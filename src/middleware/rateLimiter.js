import client from '../redis/client.js';

export default async function rateLimiter(req, res, next) {
  const key = `ratelimit:notify:${req.userId}`;

  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, 60);
  }

  if (count > 10) {
    return res.status(429).json({
      error: 'Too many notifications. Limit is 10 per minute.',
      retryAfter: 60,
    });
  }

  next();
}
