/**
 * NotifyHub Load Test — Multi-User Concurrent Notification Test
 * 
 * This script simulates multiple users sending notifications simultaneously
 * to prove the system handles concurrency without crashing.
 * 
 * What it does:
 *   1. Registers N test users in parallel
 *   2. Each user logs in and gets a JWT token
 *   3. All users send notifications concurrently (bombarding the API)
 *   4. Prints a detailed report: success/failure counts, response times, rate limits hit
 * 
 * Usage: node scripts/loadtest.js
 */

const NUM_USERS = 10;
const NOTIFICATIONS_PER_USER = 5;
const API_URL = 'http://localhost:3000/api';

const results = {
  registered: 0,
  loginSuccess: 0,
  notifSent: 0,
  notifFailed: 0,
  rateLimited: 0,
  errors: [],
  responseTimes: [],
};

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

async function registerUser(index) {
  const email = `loadtest_${index}_${randomId()}@test.com`;
  const password = 'TestPassword123';
  const name = `Test User ${index}`;

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Register failed: ${res.status}`);

    results.registered++;
    return { email, password, userId: data.userId };
  } catch (err) {
    results.errors.push(`Register user ${index}: ${err.message}`);
    return null;
  }
}

async function loginUser(user) {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Login failed: ${res.status}`);

    results.loginSuccess++;
    return { ...user, token: data.token };
  } catch (err) {
    results.errors.push(`Login ${user.email}: ${err.message}`);
    return null;
  }
}

async function sendNotification(user, notifIndex, targetUserId) {
  const types = ['info', 'success', 'warning', 'error', 'reminder', 'promotion'];
  const type = types[notifIndex % types.length];

  const start = Date.now();
  try {
    const res = await fetch(`${API_URL}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        userId: targetUserId,
        type,
        title: `Load Test #${notifIndex + 1}`,
        message: `Concurrent notification from ${user.email} at ${new Date().toISOString()}`,
        channels: ['inapp'],
        metadata: { test: true, userIndex: notifIndex },
      }),
    });

    const elapsed = Date.now() - start;
    results.responseTimes.push(elapsed);

    if (res.status === 429) {
      results.rateLimited++;
      return;
    }

    const data = await res.json();
    if (res.ok) {
      results.notifSent++;
    } else {
      results.notifFailed++;
      results.errors.push(`Notify [${res.status}] from ${user.email}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    results.notifFailed++;
    results.errors.push(`Notify from ${user.email}: ${err.message}`);
  }
}

function printReport(totalTime) {
  const times = results.responseTimes;
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const min = sorted[0] || 0;
  const max = sorted[sorted.length - 1] || 0;

  console.log('\n' + '='.repeat(60));
  console.log('  NOTIFYHUB LOAD TEST REPORT');
  console.log('='.repeat(60));
  console.log(`\n  Configuration`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Users:                  ${NUM_USERS}`);
  console.log(`  Notifications/user:     ${NOTIFICATIONS_PER_USER}`);
  console.log(`  Total requests:         ${NUM_USERS * NOTIFICATIONS_PER_USER}`);
  console.log(`\n  Results`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Users registered:       ${results.registered}/${NUM_USERS}`);
  console.log(`  Users logged in:        ${results.loginSuccess}/${NUM_USERS}`);
  console.log(`  Notifications sent:     ${results.notifSent}`);
  console.log(`  Notifications failed:   ${results.notifFailed}`);
  console.log(`  Rate limited (429):     ${results.rateLimited}`);
  console.log(`\n  Performance`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total time:             ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`  Throughput:             ${(results.notifSent / (totalTime / 1000)).toFixed(1)} req/s`);
  console.log(`  Avg response time:      ${avg}ms`);
  console.log(`  Min response time:      ${min}ms`);
  console.log(`  P50 (median):           ${p50}ms`);
  console.log(`  P95:                    ${p95}ms`);
  console.log(`  P99:                    ${p99}ms`);
  console.log(`  Max response time:      ${max}ms`);

  if (results.errors.length > 0) {
    console.log(`\n  Errors (first 5)`);
    console.log(`  ─────────────────────────────────`);
    results.errors.slice(0, 5).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  console.log('\n' + '='.repeat(60));

  const passed = results.notifFailed === 0 && results.registered === NUM_USERS;
  if (passed) {
    console.log('  RESULT: PASSED — System handled all concurrent requests');
  } else {
    console.log('  RESULT: ISSUES DETECTED — Check errors above');
  }
  console.log('='.repeat(60) + '\n');
}

async function run() {
  console.log('\n  NotifyHub Load Test Starting...');
  console.log(`  Simulating ${NUM_USERS} users, ${NOTIFICATIONS_PER_USER} notifications each\n`);

  // Step 1: Register all users in parallel
  console.log('  [1/3] Registering users...');
  const userPromises = Array.from({ length: NUM_USERS }, (_, i) => registerUser(i));
  const registeredUsers = (await Promise.all(userPromises)).filter(Boolean);
  console.log(`         ${registeredUsers.length} users registered`);

  if (registeredUsers.length === 0) {
    console.log('  ERROR: No users could be registered. Is the server running?');
    process.exit(1);
  }

  // Step 2: Login all users in parallel
  console.log('  [2/3] Logging in users...');
  const loginPromises = registeredUsers.map(u => loginUser(u));
  const loggedInUsers = (await Promise.all(loginPromises)).filter(Boolean);
  console.log(`         ${loggedInUsers.length} users logged in`);

  // Step 3: All users send notifications concurrently
  console.log('  [3/3] Sending notifications concurrently...');
  const startTime = Date.now();

  const allNotifPromises = [];
  for (const user of loggedInUsers) {
    for (let i = 0; i < NOTIFICATIONS_PER_USER; i++) {
      const target = loggedInUsers[Math.floor(Math.random() * loggedInUsers.length)];
      allNotifPromises.push(sendNotification(user, i, target.userId));
    }
  }

  await Promise.all(allNotifPromises);
  const totalTime = Date.now() - startTime;

  console.log(`         ${results.notifSent + results.rateLimited} processed in ${(totalTime / 1000).toFixed(2)}s`);

  printReport(totalTime);
}

run().catch(err => {
  console.error('Load test crashed:', err);
  process.exit(1);
});
