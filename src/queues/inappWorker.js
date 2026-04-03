import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { query } from '../db/postgres.js';
import { createClient } from 'redis';

// Separate Redis client for publishing (worker runs in its own process)
const publisher = createClient({ url: config.redisUrl });
await publisher.connect();

const worker = new Worker(
  'inapp-notifications',
  async (job) => {
    const notification = job.data;
    const { id, user_id, title, message, type, created_at } = notification;

    // Publish to Redis channel — the server process listens and emits via Socket.io
    await publisher.publish(
      'inapp-notifications',
      JSON.stringify({ id, user_id, title, message, type, createdAt: created_at })
    );

    await query(
      "UPDATE notifications SET status = 'delivered', delivered_at = NOW() WHERE id = $1",
      [id]
    );

    console.log(`In-app notification processed for user ${user_id}`);
  },
  {
    connection: { url: config.redisUrl },
    concurrency: 10,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed — notification ${job.data.id}`);
});

worker.on('failed', (job, err) => {
  console.error(
    `Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`
  );
});

worker.on('error', (err) => {
  console.error('In-app worker error:', err.message);
});

console.log('In-app worker started');

process.on('SIGTERM', async () => {
  console.log('In-app worker shutting down gracefully');
  await worker.close();
  console.log('In-app worker stopped');
  process.exit(0);
});
