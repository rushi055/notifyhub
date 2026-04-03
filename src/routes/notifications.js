import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/postgres.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();
const uuidSchema = z.string().uuid();

router.use(authMiddleware);

// GET /unread-count/:userId — get unread count for badge
router.get('/unread-count/:userId', async (req, res) => {
  try {
    const userId = uuidSchema.parse(req.params.userId);

    const result = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    return res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Unread count error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /read-all/:userId — mark all notifications as read
router.patch('/read-all/:userId', async (req, res) => {
  try {
    const userId = uuidSchema.parse(req.params.userId);

    const result = await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    return res.json({ success: true, updated: result.rowCount });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Read all error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:userId — list notifications with pagination
router.get('/:userId', async (req, res) => {
  try {
    const userId = uuidSchema.parse(req.params.userId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [notifs, totalResult, unreadResult] = await Promise.all([
      query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [userId]),
      query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false', [userId]),
    ]);

    return res.json({
      notifications: notifs.rows,
      total: parseInt(totalResult.rows[0].count),
      unreadCount: parseInt(unreadResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Get notifications error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/read — mark single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const id = uuidSchema.parse(req.params.id);

    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    return res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Mark read error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
