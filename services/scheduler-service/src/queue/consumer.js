const Redis = require('ioredis');
const axios = require('axios');
const logger = require('../../../../shared/logger');

const COMPLETED_TTL_SECONDS = 60 * 60 * 24 * 7;

class Consumer {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isConsuming = false;
    this.processingInterval = 1000;
    this.queueName = 'crawler';
    this.maxConcurrent = Number(process.env.MAX_CONCURRENT_TASKS || 5);
    this.runningTasks = 0;
    this.extractionUrl = process.env.DATA_EXTRACTION_URL || 'http://data-extraction:3001';
    this.fetchTimeoutMs = Number(process.env.REQUEST_TIMEOUT || 60000);
  }

  async connect() {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
      });

      this.client.on('error', (err) => {
        logger.error(`Redis consumer connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis consumer connected successfully');
        this.isConnected = true;
      });

      await this.client.ping();
      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${error.message}`);
      throw error;
    }
  }

  startConsuming() {
    if (this.isConsuming) return;
    this.isConsuming = true;
    this.consumeMessages();
    logger.info('Consumer started processing messages');
  }

  /**
   * Atomically claim the highest-priority task with ZPOPMAX.
   */
  async claimNextTask() {
    const popped = await this.client.zpopmax(`${this.queueName}:priority`, 1);
    if (!popped || popped.length === 0) {
      return null;
    }

    const taskStr = popped[0];
    const task = JSON.parse(taskStr);

    await this.client.srem(`${this.queueName}:pending`, task.taskId);
    await this.client.sadd(`${this.queueName}:processing`, task.taskId);
    await this.client.set(
      `${this.queueName}:processing:${task.taskId}`,
      taskStr,
      'EX',
      60 * 30
    );

    return task;
  }

  async consumeMessages() {
    while (this.isConsuming) {
      try {
        if (this.runningTasks >= this.maxConcurrent) {
          await new Promise((resolve) => setTimeout(resolve, this.processingInterval));
          continue;
        }

        const task = await this.claimNextTask();
        if (!task) {
          await new Promise((resolve) => setTimeout(resolve, this.processingInterval));
          continue;
        }

        this.runningTasks += 1;
        this.processTask(task)
          .catch((error) => {
            logger.error(`Error processing task ${task.taskId}: ${error.message}`);
          })
          .finally(() => {
            this.runningTasks -= 1;
          });
      } catch (error) {
        logger.error(`Error in consume loop: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, this.processingInterval));
      }
    }
  }

  async markCompleted(task, result) {
    const payload = JSON.stringify({
      ...task,
      completedAt: new Date().toISOString(),
      result,
    });

    await this.client.set(
      `${this.queueName}:completed:${task.taskId}`,
      payload,
      'EX',
      COMPLETED_TTL_SECONDS
    );
    await this.client.hset(`${this.queueName}:completed`, task.taskId, payload);
    await this.client.srem(`${this.queueName}:processing`, task.taskId);
    await this.client.del(`${this.queueName}:processing:${task.taskId}`);
  }

  async markFailed(task, error) {
    const payload = JSON.stringify({
      ...task,
      failedAt: new Date().toISOString(),
      error: error.message || String(error),
    });

    await this.client.set(
      `${this.queueName}:failed:${task.taskId}`,
      payload,
      'EX',
      COMPLETED_TTL_SECONDS
    );
    await this.client.hset(`${this.queueName}:failed`, task.taskId, payload);
    await this.client.srem(`${this.queueName}:processing`, task.taskId);
    await this.client.del(`${this.queueName}:processing:${task.taskId}`);
  }

  async processTask(task) {
    try {
      logger.info(`Processing task: ${task.taskId} - URL: ${task.url}`);

      const response = await axios.post(
        `${this.extractionUrl}/extract`,
        {
          url: task.url,
          depth: task.depth || 2,
          taskId: task.taskId,
          persist: true,
        },
        { timeout: this.fetchTimeoutMs }
      );

      logger.info(`Task ${task.taskId} processed successfully`);
      await this.markCompleted(task, response.data);
      return true;
    } catch (error) {
      const readable =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;

      logger.error(`Failed to process task ${task.taskId}: ${readable}`);

      const retryCount = task.retryCount || 0;
      if (retryCount < 3) {
        const updatedTask = {
          ...task,
          retryCount: retryCount + 1,
          lastError: readable,
          lastRetryAt: new Date().toISOString(),
        };

        await this.client.zadd(
          `${this.queueName}:priority`,
          1,
          JSON.stringify(updatedTask)
        );
        await this.client.sadd(`${this.queueName}:pending`, task.taskId);
        await this.client.srem(`${this.queueName}:processing`, task.taskId);
        await this.client.del(`${this.queueName}:processing:${task.taskId}`);
        logger.info(`Task ${task.taskId} requeued for retry (${retryCount + 1}/3)`);
      } else {
        await this.markFailed(task, { message: readable });
        logger.error(`Task ${task.taskId} marked as failed after 3 retries`);
      }

      throw error;
    }
  }

  async stopConsuming() {
    this.isConsuming = false;
    logger.info('Consumer stopped processing messages');
  }

  async disconnect() {
    if (this.client) {
      await this.stopConsuming();
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis consumer disconnected');
    }
  }
}

const consumer = new Consumer();

module.exports = { consumer };
