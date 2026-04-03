import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import pool from '../db/postgres.js';
import { query } from '../db/postgres.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.gmail.user,
    pass: config.gmail.pass,
  },
});

const worker = new Worker(
  'email-notifications',
  async (job) => {
    console.log('Email worker received job data:', JSON.stringify(job.data, null, 2));
    const { id, title, message, user_id } = job.data;

    if (!user_id) {
      throw new Error('user_id is missing from job data');
    }

    const result = await query('SELECT email FROM users WHERE id = $1', [user_id]);
    if (result.rows.length === 0) {
      throw new Error('User email not found');
    }

    const email = result.rows[0].email;

    await transporter.sendMail({
      from: `NotifyHub <${config.gmail.user}>`,
      to: email,
      subject: title,
      html: `<h2>${title}</h2><p>${message}</p>`,
    });

    await query(
      "UPDATE notifications SET status = 'delivered', delivered_at = NOW() WHERE id = $1",
      [id]
    );

    console.log(`Email delivered for notification ${id} to ${email}`);
  },
  {
    connection: { url: config.redisUrl },
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed — notification ${job.data.id}`);
});

worker.on('failed', (job, err) => {
  console.error(
    `Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`
  );
});

worker.on('error', (err) => {
  console.error('Email worker error:', err.message);
});

console.log('Email worker started');

process.on('SIGTERM', async () => {
  console.log('Email worker shutting down gracefully');
  await worker.close();
  await pool.end();
  console.log('Email worker stopped');
  process.exit(0);
});
