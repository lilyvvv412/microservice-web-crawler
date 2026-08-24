/**
 * PM2 process file for local evidence demos.
 *
 * Infra (MongoDB / Redis / Elasticsearch) stays in Docker:
 *   docker compose up -d mongo redis elasticsearch
 *   # or: docker compose -f docker-compose.infra.yml up -d
 *
 * App processes run on the host under PM2 (cluster + autorestart).
 * Do not run the Node app containers at the same time (port conflicts).
 */
require('dotenv').config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'password';
const MONGO_DB = process.env.MONGO_DB || 'crawler_db';
const MONGO_PORT = process.env.MONGO_PORT || '27017';

const sharedEnv = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_HOST,
  REDIS_PORT,
  REDIS_URL: process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`,
  MONGODB_URI:
    process.env.MONGODB_URI ||
    `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@127.0.0.1:${MONGO_PORT}/${MONGO_DB}?authSource=admin`,
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || 'http://127.0.0.1:9200',
  DATA_STORAGE_URL: process.env.DATA_STORAGE_URL || 'http://127.0.0.1:3002/api',
  SEARCH_INDEXING_URL: process.env.SEARCH_INDEXING_URL || 'http://127.0.0.1:3003/api',
  DATA_EXTRACTION_URL: process.env.DATA_EXTRACTION_URL || 'http://127.0.0.1:3001',
  TASK_SCHEDULER_URL: process.env.TASK_SCHEDULER_URL || 'http://127.0.0.1:3005',
  AUTH_SECRET: process.env.AUTH_SECRET || 'your_auth_secret_key_change_in_production',
  JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'your_auth_secret_key_change_in_production',
  REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT || '30000',
  MAX_CONCURRENT_TASKS: process.env.MAX_CONCURRENT_REQUESTS || '5',
  API_GATEWAY_PORT: process.env.API_GATEWAY_PORT || '3000',
  DEPLOY_MODE: process.env.DEPLOY_MODE || 'pm2',
};

module.exports = {
  apps: [
    {
      name: 'api-gateway',
      cwd: './services/api-gateway',
      script: './src/app.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: { ...sharedEnv, PORT: 3000 },
    },
    {
      name: 'data-extraction',
      cwd: './services/extraction-service',
      script: './src/app.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { ...sharedEnv, PORT: 3001 },
    },
    {
      name: 'data-storage',
      cwd: './services/storage-service',
      script: './app.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: { ...sharedEnv, PORT: 3002 },
    },
    {
      name: 'search-indexing',
      cwd: './services/search-service',
      script: './src/app.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { ...sharedEnv, PORT: 3003 },
    },
    {
      name: 'task-scheduler',
      cwd: './services/scheduler-service',
      script: './src/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: { ...sharedEnv, PORT: 3005 },
    },
  ],
};
