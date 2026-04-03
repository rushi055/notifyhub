import pg from 'pg';
import { config } from '../config/index.js';

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

export default pool;

export const query = async (text, params) => {
  return pool.query(text, params);
};
