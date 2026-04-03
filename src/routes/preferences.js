import { Router } from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { getUserPreferences, updatePreferences } from '../services/preferenceService.js';

const router = Router();
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z.object({
  emailEnabled: z.boolean().optional(),
  inappEnabled: z.boolean().optional(),
  emailAddress: z.string().email().optional(),
  quietHoursStart: z.string().regex(timeRegex).nullable().optional(),
  quietHoursEnd: z.string().regex(timeRegex).nullable().optional(),
});

router.use(authMiddleware);

// GET /:userId — get user preferences
router.get('/:userId', async (req, res) => {
  try {
    const prefs = await getUserPreferences(req.params.userId);
    return res.json(prefs);
  } catch (err) {
    console.error('Get preferences error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:userId — update user preferences
router.put('/:userId', async (req, res) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Cannot update another user\'s preferences' });
    }

    const data = updateSchema.parse(req.body);
    const prefs = await updatePreferences(req.params.userId, data);
    return res.json({ success: true, preferences: prefs });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    console.error('Update preferences error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
