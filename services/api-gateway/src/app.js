const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { logger } = require('../../../shared/logger');
const { config } = require('../../../shared/config');
const authMiddleware = require('./middleware/auth');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: config.CORS_ORIGINS || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

app.use('/api/v1/private', authMiddleware.authenticate);
app.use('/api/v1', routes);

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(config.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use((req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  return res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

const PORT = config.API_GATEWAY_PORT || 3000;

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});

module.exports = app;
