const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');
const { producer } = require('../queue/producer');
const logger = require('../../../../shared/logger');

class CrawlerScheduler {
  constructor() {
    this.schedules = new Map();
    this.client = null;
    this.isConnected = false;
    this.queueName = 'crawler';
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
        logger.error(`Redis scheduler connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis scheduler connected successfully');
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

  async init() {
    if (!this.isConnected) {
      await this.connect();
    }

    // Load existing scheduled tasks from Redis
    await this.loadScheduledTasks();

    // Start periodic cleanup of completed and failed tasks
    this.startCleanupJob();

    logger.info('Crawler scheduler initialized');
  }

  async loadScheduledTasks() {
    try {
      const scheduledTasks = await this.client.hgetall('scheduler:tasks');

      if (!scheduledTasks) {
        return;
      }

      for (const [taskId, taskStr] of Object.entries(scheduledTasks)) {
        const task = JSON.parse(taskStr);

        if (task.schedule) {
          this.createCronJob(task);
          logger.info(`Loaded scheduled task: ${taskId} - ${task.url} - Schedule: ${task.schedule}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to load scheduled tasks: ${error.message}`);
    }
  }

  createCronJob(task) {
    try {
      // Validate cron expression
      if (!cron.validate(task.schedule)) {
        throw new Error(`Invalid cron expression: ${task.schedule}`);
      }

      // Schedule the task using node-cron
      const job = cron.schedule(task.schedule, async () => {
        try {
          logger.info(`Running scheduled task: ${task.taskId} - ${task.url}`);

          // Add the URL to the crawler queue
          await producer.addToQueue(this.queueName, {
            url: task.url,
            depth: task.depth || 2,
            taskId: `${task.taskId}-${new Date().toISOString()}`,
            scheduledTaskId: task.taskId,
          }, task.priority || 'normal');

          // Update last run time
          task.lastRun = new Date().toISOString();
          await this.client.hset('scheduler:tasks', task.taskId, JSON.stringify(task));

          logger.info(`Scheduled task executed: ${task.taskId}`);
        } catch (error) {
          logger.error(`Failed to execute scheduled task ${task.taskId}: ${error.message}`);
        }
      }, {
        scheduled: true,
      });

      // Store the job reference for later cancellation if needed
      this.schedules.set(task.taskId, job);

      return true;
    } catch (error) {
      logger.error(`Failed to create cron job for task ${task.taskId}: ${error.message}`);
      throw error;
    }
  }

  async scheduleTask({ url, priority, depth, schedule }) {
    try {
      const taskId = uuidv4();

      const task = {
        taskId,
        url,
        priority: priority || 'normal',
        depth: depth || 2,
        createdAt: new Date().toISOString(),
      };

      // If there's a schedule, set up a recurring job
      if (schedule) {
        task.schedule = schedule;

        // Create and start the cron job
        this.createCronJob(task);

        // Store the scheduled task
        await this.client.hset('scheduler:tasks', taskId, JSON.stringify(task));

        logger.info(`Created scheduled task: ${taskId} - ${url} - Schedule: ${schedule}`);
      } else {
        // If no schedule, just queue it once immediately
        await producer.addToQueue(this.queueName, task, priority);
        logger.info(`Created one-time task: ${taskId} - ${url}`);
      }

      return taskId;
    } catch (error) {
      logger.error(`Failed to schedule task: ${error.message}`);
      throw error;
    }
  }

  async cancelTask(taskId) {
    try {
      // Check if it's a scheduled task
      if (this.schedules.has(taskId)) {
        // Stop the cron job
        const job = this.schedules.get(taskId);
        job.stop();
        this.schedules.delete(taskId);

        // Remove from scheduled tasks in Redis
        await this.client.hdel('scheduler:tasks', taskId);

        logger.info(`Cancelled scheduled task: ${taskId}`);
      } else {
        // Try to remove from the queue if it's a one-time task
        await producer.removeFromQueue(this.queueName, taskId);
        logger.info(`Cancelled one-time task: ${taskId}`);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  async getTasks() {
    try {
      // Get all scheduled tasks
      const scheduledTasks = await this.client.hgetall('scheduler:tasks') || {};
      const scheduledTasksArray = Object.values(scheduledTasks).map(taskStr => JSON.parse(taskStr));

      // Get all queued tasks
      const queuedTasks = await producer.getQueuedTasks(this.queueName);

      // Combine all tasks
      const allTasks = [
        ...scheduledTasksArray.map(task => ({ ...task, type: 'scheduled' })),
        ...queuedTasks.map(task => ({ ...task, type: 'queued' })),
      ];

      return allTasks;
    } catch (error) {
      logger.error(`Failed to get tasks: ${error.message}`);
      throw error;
    }
  }

  startCleanupJob() {
    // Run cleanup once a day
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('Starting cleanup of old completed and failed tasks');

        // Get all completed tasks
        const completedTasks = await this.client.hgetall(`${this.queueName}:completed`);

        if (completedTasks) {
          // Remove tasks older than 7 days
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 7);

          for (const [taskId, taskStr] of Object.entries(completedTasks)) {
            const task = JSON.parse(taskStr);
            const completedAt = new Date(task.completedAt);

            if (completedAt < cutoffDate) {
              await this.client.hdel(`${this.queueName}:completed`, taskId);
            }
          }
        }

        // Get all failed tasks
        const failedTasks = await this.client.hgetall(`${this.queueName}:failed`);

        if (failedTasks) {
          // Remove tasks older than 7 days
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 7);

          for (const [taskId, taskStr] of Object.entries(failedTasks)) {
            const task = JSON.parse(taskStr);
            const failedAt = new Date(task.failedAt);

            if (failedAt < cutoffDate) {
              await this.client.hdel(`${this.queueName}:failed`, taskId);
            }
          }
        }

        logger.info('Cleanup of old tasks completed');
      } catch (error) {
        logger.error(`Error during cleanup: ${error.message}`);
      }
    });
  }

  async disconnect() {
    // Stop all scheduled jobs
    for (const [taskId, job] of this.schedules.entries()) {
      job.stop();
      logger.info(`Stopped scheduled task: ${taskId}`);
    }

    this.schedules.clear();

    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis scheduler disconnected');
    }
  }
}

const scheduler = new CrawlerScheduler();

module.exports = { scheduler };
