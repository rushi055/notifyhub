import { query } from '../db/postgres.js';
import { publishNotification } from '../kafka/producer.js';

export async function triggerNotification({ userId, type, title, message, channels, metadata }) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, message, channels, metadata)
     VALUES ($1, $2, $3, $4, $5::text[], $6) RETURNING *`,
    [userId, type, title, message, channels, metadata ? JSON.stringify(metadata) : null]
  );

  const notification = result.rows[0];

  try {
    await publishNotification(notification);
  } catch (err) {
    console.error('Kafka publish failed, will retry later:', err.message);
  }

  return notification;
}
