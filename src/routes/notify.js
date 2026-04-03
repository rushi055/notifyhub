import { Router } from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import rateLimiter from '../middleware/rateLimiter.js';
import { triggerNotification } from '../services/notificationService.js';

const router = Router();

const notifySchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  channels: z.array(z.enum(['email', 'inapp'])).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.post('/', authMiddleware, rateLimiter, async (req, res) => {
  try {
    const data = notifySchema.parse(req.body);
    const notification = await triggerNotification(data);
    return res.status(201).json({ notificationId: notification.id, status: 'queued' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Notify error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
