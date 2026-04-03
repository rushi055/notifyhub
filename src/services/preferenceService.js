import { query } from '../db/postgres.js';
import redisClient from '../redis/client.js';

export async function getUserPreferences(userId) {
  const cached = await redisClient.get(`prefs:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  const result = await query(
    'SELECT * FROM user_preferences WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { email_enabled: true, inapp_enabled: true };
  }

  const prefs = result.rows[0];
  await redisClient.set(`prefs:${userId}`, JSON.stringify(prefs), { EX: 300 });
  return prefs;
}

export async function updatePreferences(userId, data) {
  const result = await query(
    `INSERT INTO user_preferences (user_id, email_enabled, inapp_enabled, email_address, quiet_hours_start, quiet_hours_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       email_enabled = $2, inapp_enabled = $3,
       email_address = $4, quiet_hours_start = $5,
       quiet_hours_end = $6, updated_at = NOW()
     RETURNING *`,
    [userId, data.emailEnabled, data.inappEnabled, data.emailAddress, data.quietHoursStart || null, data.quietHoursEnd || null]
  );

  await redisClient.del(`prefs:${userId}`);
  return result.rows[0];
}
