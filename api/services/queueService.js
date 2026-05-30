const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions,
});

const indexerQueue = new Queue('indexer', {
  connection,
  defaultJobOptions,
});

module.exports = {
  notificationQueue,
  indexerQueue,
  connection,
};
