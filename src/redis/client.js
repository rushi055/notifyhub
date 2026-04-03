import { createClient } from 'redis';
import { config } from '../config/index.js';

const client = createClient({ url: config.redisUrl });

client.on('error', (err) => {
  console.error('Redis error:', err.message);
});

client.on('connect', () => {
  console.log('Redis connected');
});

await client.connect();

export default client;

export const redisHelpers = {
  /**
   * Set a key-value pair with an optional TTL.
   * @param {string} key
   * @param {string} value
   * @param {number} [ttlSeconds] — expiry in seconds
   */
  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      return client.set(key, value, { EX: ttlSeconds });
    }
    return client.set(key, value);
  },

  /**
   * Get the value of a key. Returns null if not found.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    return client.get(key);
  },

  /**
   * Delete a key.
   * @param {string} key
   */
  async del(key) {
    return client.del(key);
  },

  /**
   * Increment a key by 1 and return the new value.
   * @param {string} key
   * @returns {Promise<number>}
   */
  async incr(key) {
    return client.incr(key);
  },

  /**
   * Set an expiry (in seconds) on an existing key.
   * @param {string} key
   * @param {number} seconds
   */
  async expire(key, seconds) {
    return client.expire(key, seconds);
  },

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    const result = await client.exists(key);
    return result === 1;
  },
};
