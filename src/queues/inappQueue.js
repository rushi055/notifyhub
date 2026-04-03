import { Queue } from 'bullmq';
import { config } from '../config/index.js';

export const inappQueue = new Queue('inapp-notifications', {
  connection: { url: config.redisUrl },
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
