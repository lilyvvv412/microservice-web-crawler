const express = require('express');
const bodyParser = require('body-parser');
const { producer } = require('./queue/producer');
const { consumer } = require('./queue/consumer');
const { scheduler } = require('./scheduler/crawler');
const logger = require('../../../shared/logger');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(bodyParser.json());

// Initialize queues and scheduler
const initialize = async () => {
  try {
    await producer.connect();
    await consumer.connect();
    consumer.startConsuming();
    await scheduler.init();

    logger.info('Task scheduler service initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize task scheduler: ${error.message}`, { error });
    process.exit(1);
  }
};

// Initialize on startup
initialize();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Add URL to crawl
app.post('/crawl', async (req, res) => {
  try {
    const { url, priority, depth, frequency } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const jobId = await scheduler.scheduleTask({
      url,
      priority: priority || 'normal',
      depth: depth || 1,
      schedule: frequency && frequency !== 'once' ? frequency : undefined,
    });

    res.status(201).json({
      message: 'Crawl job added successfully',
      jobId
    });
  } catch (error) {
    logger.error(`Failed to add crawl job: ${error.message}`, { error });
    res.status(500).json({
      error: 'Failed to add crawl job',
      message: error.message
    });
  }
});

app.post('/schedule', async (req, res) => {
  try {
    const { url, priority = 'normal', depth = 1, schedule } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const taskId = await scheduler.scheduleTask({ url, priority, depth, schedule });
    return res.status(201).json({ taskId, status: 'queued' });
  } catch (error) {
    logger.error(`Failed to schedule crawl: ${error.message}`);
    return res.status(500).json({ error: 'Failed to schedule crawl', message: error.message });
  }
});

app.get('/tasks', async (req, res) => {
  try {
    return res.json({ tasks: await scheduler.getTasks() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const completedKey = await scheduler.client.get(`crawler:completed:${taskId}`);
    const completed = completedKey || await scheduler.client.hget('crawler:completed', taskId);
    if (completed) {
      return res.json({ status: 'completed', task: JSON.parse(completed) });
    }

    const failedKey = await scheduler.client.get(`crawler:failed:${taskId}`);
    const failed = failedKey || await scheduler.client.hget('crawler:failed', taskId);
    if (failed) {
      return res.json({ status: 'failed', task: JSON.parse(failed) });
    }

    if (await scheduler.client.sismember('crawler:processing', taskId)) {
      return res.json({ status: 'processing', taskId });
    }
    if (await scheduler.client.sismember('crawler:pending', taskId)) {
      return res.json({ status: 'queued', taskId });
    }
    return res.status(404).json({ error: 'Task not found' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get scheduler status
app.get('/status', async (req, res) => {
  try {
    const status = await scheduler.getStatus();
    res.status(200).json(status);
  } catch (error) {
    logger.error(`Failed to get scheduler status: ${error.message}`, { error });
    res.status(500).json({
      error: 'Failed to get scheduler status',
      message: error.message
    });
  }
});

// Control crawler operations
app.post('/control', async (req, res) => {
  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    let result;

    switch (action) {
      case 'pause':
        result = await scheduler.pause();
        break;
      case 'resume':
        result = await scheduler.resume();
        break;
      case 'reset':
        result = await scheduler.reset();
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error(`Failed to control scheduler: ${error.message}`, { error });
    res.status(500).json({
      error: 'Failed to control scheduler',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Task scheduler service running on port ${PORT}`);
});

const shutdown = async () => {
  await consumer.disconnect();
  await producer.disconnect();
  await scheduler.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
