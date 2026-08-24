const config = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_GATEWAY_PORT: Number(process.env.API_GATEWAY_PORT || 3000),
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
  JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'development-only-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  TASK_SCHEDULER_URL: process.env.TASK_SCHEDULER_URL || 'http://task-scheduler:3005',
  DATA_STORAGE_URL: process.env.DATA_STORAGE_URL || 'http://data-storage:3002/api',
  SEARCH_INDEXING_URL: process.env.SEARCH_INDEXING_URL || 'http://search-indexing:3003/api',
});

module.exports = { config, ...config };
