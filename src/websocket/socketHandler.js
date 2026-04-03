import redisClient from '../redis/client.js';
import { createClient } from 'redis';
import { config } from '../config/index.js';
import { query } from '../db/postgres.js';

export async function setupSocketHandlers(io) {
  // Separate Redis client for subscribing (subscriber can't do other commands)
  const subscriber = createClient({ url: config.redisUrl });
  await subscriber.connect();

  // Listen for in-app notifications published by the worker
  await subscriber.subscribe('inapp-notifications', async (message) => {
    const { id, user_id, title, message: msg, type, createdAt } = JSON.parse(message);
    const socketId = await redisClient.get(`socket:${user_id}`);

    if (socketId) {
      io.to(socketId).emit('new_notification', { id, title, message: msg, type, createdAt });
      console.log(`Real-time notification sent to user ${user_id}`);
    } else {
      console.log(`User ${user_id} offline, notification saved in history`);
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    console.log(`User ${userId} connected. Socket: ${socket.id}`);

    try {
      await redisClient.set(`socket:${userId}`, socket.id, { EX: 3600 });
    } catch (err) {
      console.error('Redis SET error:', err.message);
    }

    socket.join(`user:${userId}`);

    socket.on('mark-read', async (notificationId) => {
      try {
        await query(
          'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
          [notificationId, userId]
        );
        socket.emit('marked-read', { notificationId });
      } catch (err) {
        console.error('mark-read error:', err.message);
      }
    });

    socket.on('get-unread-count', async () => {
      try {
        const result = await query(
          'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
          [userId]
        );
        socket.emit('unread-count', { count: parseInt(result.rows[0].count) });
      } catch (err) {
        console.error('get-unread-count error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User ${userId} disconnected`);
      try {
        await redisClient.del(`socket:${userId}`);
      } catch (err) {
        console.error('Redis DEL error:', err.message);
      }
    });
  });
}
