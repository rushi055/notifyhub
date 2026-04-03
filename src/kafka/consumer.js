import kafka from './client.js';
import { emailQueue } from '../queues/emailQueue.js';
import { inappQueue } from '../queues/inappQueue.js';
import { getUserPreferences } from '../services/preferenceService.js';
import redisClient from '../redis/client.js';
import pool from '../db/postgres.js';

const consumer = kafka.consumer({ groupId: 'notifyhub-workers' });

export async function startConsumer() {
  await consumer.connect();
  console.log('Kafka consumer connected');

  await consumer.subscribe({ topic: 'notifications', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      try {
        const notification = JSON.parse(message.value.toString());

        console.log(
          `Received notification ${notification.id} on partition ${partition} at offset ${message.offset}`
        );
        console.log('Notification user_id:', notification.user_id);

        const prefs = await getUserPreferences(notification.user_id);

        if (notification.channels.includes('email') && prefs.email_enabled) {
          await emailQueue.add('send-email', notification, {
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
          });
        }

        if (notification.channels.includes('inapp') && prefs.inapp_enabled) {
          await inappQueue.add('send-inapp', notification);
        }
      } catch (err) {
        console.error('Error processing message:', err.message);
      }
    },
  });
}

startConsumer();

process.on('SIGTERM', async () => {
  console.log('Kafka consumer shutting down');
  await consumer.disconnect();
  console.log('Kafka consumer disconnected');
  await redisClient.quit();
  console.log('Redis client closed');
  await pool.end();
  console.log('PostgreSQL pool closed');
  process.exit(0);
});
