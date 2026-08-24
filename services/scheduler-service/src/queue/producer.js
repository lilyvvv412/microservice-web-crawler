const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../../shared/logger');

class Producer {
  constructor() {
    this.client = null;
    this.isConnected = false;
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
        logger.error(`Redis producer connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis producer connected successfully');
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

  async addToQueue(queueName, data, priority = 'normal') {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const taskId = data.taskId || uuidv4();
      const task = {
        ...data,
        taskId,
        createdAt: new Date().toISOString(),
      };

      // Use different priority queues
      let priorityScore;
      switch (priority) {
        case 'high':
          priorityScore = 3;
          break;
        case 'medium':
          priorityScore = 2;
          break;
        default:
          priorityScore = 1;
      }

      // Add to sorted set with priority as score
      await this.client.zadd(`${queueName}:priority`, priorityScore, JSON.stringify(task));

      // Maintain a set of all pending tasks for quick lookups
      await this.client.sadd(`${queueName}:pending`, taskId);

      logger.info(`Task added to queue ${queueName} with priority ${priority}: ${taskId}`);

      return taskId;
    } catch (error) {
      logger.error(`Failed to add task to queue ${queueName}: ${error.message}`);
      throw error;
    }
  }

  async removeFromQueue(queueName, taskId) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      // Find and remove the task from the priority queue
      const tasks = await this.client.zrange(`${queueName}:priority`, 0, -1);

      for (const taskStr of tasks) {
        const task = JSON.parse(taskStr);

        if (task.taskId === taskId) {
          await this.client.zrem(`${queueName}:priority`, taskStr);
          break;
        }
      }

      // Remove from the pending set
      await this.client.srem(`${queueName}:pending`, taskId);

      logger.info(`Task removed from queue ${queueName}: ${taskId}`);

      return true;
    } catch (error) {
      logger.error(`Failed to remove task from queue ${queueName}: ${error.message}`);
      throw error;
    }
  }

  async getQueuedTasks(queueName) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const tasks = await this.client.zrange(`${queueName}:priority`, 0, -1);
      return tasks.map(taskStr => JSON.parse(taskStr));
    } catch (error) {
      logger.error(`Failed to get tasks from queue ${queueName}: ${error.message}`);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis producer disconnected');
    }
  }
}

const producer = new Producer();

module.exports = { producer };
