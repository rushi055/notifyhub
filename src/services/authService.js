import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function createToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '24h' });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
