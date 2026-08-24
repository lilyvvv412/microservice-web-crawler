const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../../../../shared/config');
const { logger } = require('../../../../shared/logger');
const authMiddleware = require('../middleware/auth');

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API Gateway is healthy',
    timestamp: new Date().toISOString(),
    // compose = Docker network hostnames; pm2 = host loopback
    deployMode: process.env.DEPLOY_MODE || 'compose',
  });
});

// Crawl a specific URL
router.post('/crawl', authMiddleware.authenticate, async (req, res, next) => {
  try {
    const { url, depth = 1, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'URL is required'
      });
    }

    // Forward the request to the task scheduler service
    const response = await axios.post(`${config.TASK_SCHEDULER_URL}/schedule`, {
      url,
      depth,
      options,
      userId: req.user.id
    });

    return res.status(200).json({
      status: 'success',
      message: 'Crawl task scheduled successfully',
      taskId: response.data.taskId
    });
  } catch (error) {
    logger.error(`Error scheduling crawl: ${error.message}`);

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return res.status(error.response.status).json({
        status: 'error',
        message: error.response.data.message || 'Error from task scheduler service'
      });
    }

    next(error);
  }
});

// Get crawl status
router.get('/crawl/:taskId', authMiddleware.authenticate, async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const response = await axios.get(`${config.TASK_SCHEDULER_URL}/status/${taskId}`);

    return res.status(200).json({
      status: 'success',
      data: response.data
    });
  } catch (error) {
    logger.error(`Error getting crawl status: ${error.message}`);
    next(error);
  }
});

// Search crawled data
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q || req.query.query;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const from = Math.max(0, (page - 1) * limit);

    if (!q) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required'
      });
    }

    const response = await axios.get(`${config.SEARCH_INDEXING_URL}/search`, {
      params: {
        q,
        from,
        size: limit,
        domain: req.query.domain,
        sort: req.query.sort || 'relevance',
      }
    });

    return res.status(200).json({
      status: 'success',
      data: response.data
    });
  } catch (error) {
    logger.error(`Error searching data: ${error.message}`);
    next(error);
  }
});

// Get extracted data for a specific URL
router.get('/data', async (req, res, next) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'URL parameter is required'
      });
    }

    // Forward the request to the data storage service
    const response = await axios.get(`${config.DATA_STORAGE_URL}/page`, {
      params: { url }
    });

    return res.status(200).json({
      status: 'success',
      data: response.data
    });
  } catch (error) {
    logger.error(`Error getting page data: ${error.message}`);
    next(error);
  }
});

// User management routes (could be extended based on requirements)
router.post('/user/register', async (req, res, next) => {
  // Implementation would connect to a user management service
  // This is a placeholder for the actual implementation
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Mock successful registration
    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      user: {
        id: 'user-id-placeholder',
        username,
        email
      }
    });
  } catch (error) {
    logger.error(`Error registering user: ${error.message}`);
    next(error);
  }
});

router.post('/user/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    // Mock successful login
    const token = authMiddleware.generateToken({ id: 'user-id-placeholder', email });

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      token
    });
  } catch (error) {
    logger.error(`Error logging in: ${error.message}`);
    next(error);
  }
});

module.exports = router;
