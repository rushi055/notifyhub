import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import notifyRouter from './routes/notify.js';
import notificationsRouter from './routes/notifications.js';
import preferencesRouter from './routes/preferences.js';
import authRouter from './routes/auth.js';
import bullBoardRouter from './dashboard/bullboard.js';
import { setupSocketHandlers } from './websocket/socketHandler.js';
import { connectProducer, disconnectProducer } from './kafka/producer.js';
import redisClient from './redis/client.js';
import pool from './db/postgres.js';
import { query } from './db/postgres.js';

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/app', express.static('frontend'));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/notify', notifyRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/dashboard', bullBoardRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// HTTP + WebSocket server
const server = createServer(app);
export const io = new Server(server, {
  cors: { origin: '*' },
});

async function checkDependencies() {
  try {
    await redisClient.ping();
    await query('SELECT 1');
    console.log('All dependencies connected');
  } catch (err) {
    console.error('Dependency check failed:', err.message);
    process.exit(1);
  }
}

async function start() {
  await checkDependencies();
  await connectProducer();
  await setupSocketHandlers(io);
  server.listen(config.port, () => {
    console.log(`NotifyHub server running on port ${config.port}`);
  });
}

start();

async function shutdown() {
  console.log('Shutting down gracefully...');

  const forceExit = setTimeout(() => {
    console.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000);

  try {
    server.close(() => console.log('HTTP server closed'));
    await disconnectProducer();
    console.log('Kafka producer disconnected');
    await redisClient.quit();
    console.log('Redis client closed');
    await pool.end();
    console.log('PostgreSQL pool closed');
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
