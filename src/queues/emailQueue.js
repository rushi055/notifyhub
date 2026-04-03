import { Queue } from 'bullmq';
import { config } from '../config/index.js';

export const emailQueue = new Queue('email-notifications', {
  connection: { url: config.redisUrl },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
