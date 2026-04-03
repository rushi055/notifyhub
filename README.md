# NotifyHub

NotifyHub is a notification system built with Node.js, PostgreSQL, Redis, Kafka, BullMQ, and Socket.io.

It supports:
- email notifications
- in-app real-time notifications
- user preferences
- a web dashboard for testing
- concurrent load testing

## Prerequisites

- Node.js 18+
- Docker and Docker Compose

## First-Time Setup

```bash
git clone https://github.com/your-username/notifyhub.git
cd notifyhub
cp .env.example .env
```

Edit `.env` and fill in the required values, especially Gmail credentials if you want email delivery.

Then run:

```bash
docker-compose up -d
npm install
npm run migrate
npm run dev
```

## Start The Project

Normal startup:

```bash
docker-compose up -d
npm run dev
```

If you deleted Docker volumes earlier, run migrations again:

```bash
docker-compose up -d
npm run migrate
npm run dev
```

## Stop The Project Safely

Stop the Node processes:

```bash
taskkill /IM node.exe /F
```

Stop containers without deleting data:

```bash
docker-compose down
```

Do not use this unless you want a full reset:

```bash
docker-compose down -v
```

`docker-compose down -v` removes volumes and deletes persisted database data.

## Open In Browser

- App UI: `http://localhost:3000/app/`
- Bull Board: `http://localhost:3000/dashboard`
- Health check: `http://localhost:3000/api/health`
- WebSocket test page: `http://localhost:3000/test.html`

## How To Test

### Web UI

1. Open `http://localhost:3000/app/`
2. Register a user
3. Log in
4. Copy your user ID from the dashboard
5. Send a notification to yourself
6. Open Real-time Monitor to see live in-app notifications

### Load Test

Run:

```bash
npm run loadtest
```

This simulates multiple users registering, logging in, and sending notifications concurrently.

### Database Check

View users:

```bash
docker exec notifyhub-postgres psql -U admin -d notifyhub -c "SELECT id, name, email FROM users;"
```

View notifications:

```bash
docker exec notifyhub-postgres psql -U admin -d notifyhub -c "SELECT id, user_id, title, type, status, is_read, channels FROM notifications ORDER BY created_at DESC LIMIT 10;"
```

View preferences:

```bash
docker exec notifyhub-postgres psql -U admin -d notifyhub -c "SELECT user_id, email_enabled, inapp_enabled, email_address FROM user_preferences;"
```

## Important Commands

```bash
npm run dev
npm run migrate
npm run loadtest
docker-compose up -d
docker-compose down
```

```
                    ┌── API Server 1 ──┐
Load Balancer ──────┼── API Server 2 ──┼──▶ Kafka (N partitions)
                    └── API Server N ──┘         │
                                          ┌──────┴──────┐
                                          │  Consumer 1  │
                                          │  Consumer 2  │
                                          │  Consumer N  │
                                          └──────┬──────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                              Email Worker  Email Worker  InApp Worker
                                 1              2             1 .. N
```

---

## Testing

### Quick Test (Manual)

After starting the server (`npm run dev`), test the full flow with cURL or Postman:

**1. Register a user**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "password": "password123"}'
```
Response:
```json
{ "userId": "abc-123-...", "name": "Test User", "email": "test@example.com" }
```

**2. Login to get a JWT token**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```
Response:
```json
{ "token": "eyJhbG...", "userId": "abc-123-...", "name": "Test User" }
```

**3. Send a notification**
```bash
curl -X POST http://localhost:3000/api/notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "userId": "<your-userId>",
    "type": "info",
    "title": "Hello World",
    "message": "This is a test notification",
    "channels": ["inapp", "email"]
  }'
```
Response:
```json
{ "notificationId": "def-456-...", "status": "queued" }
```

**4. Fetch your notifications**
```bash
curl http://localhost:3000/api/notifications/<your-userId> \
  -H "Authorization: Bearer <your-token>"
```

**5. Get unread count**
```bash
curl http://localhost:3000/api/notifications/unread-count/<your-userId> \
  -H "Authorization: Bearer <your-token>"
```

**6. Update preferences**
```bash
curl -X PUT http://localhost:3000/api/preferences/<your-userId> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"emailEnabled": true, "inappEnabled": true}'
```

### Load Test (Concurrency)

Run the built-in load test to simulate multiple users sending notifications concurrently:

```bash
npm run loadtest
```

This script:
- Registers **10 users** simultaneously
- All 10 users **log in** in parallel
- Fires **50 notifications** at once (5 per user, random targets)
- Prints a detailed report with throughput, latency percentiles, and success/failure counts

Example output:
```
============================================================
  NOTIFYHUB LOAD TEST REPORT
============================================================

  Configuration
  ─────────────────────────────────
  Users:                  10
  Notifications/user:     5
  Total requests:         50

  Results
  ─────────────────────────────────
  Users registered:       10/10
  Users logged in:        10/10
  Notifications sent:     50
  Notifications failed:   0
  Rate limited (429):     0

  Performance
  ─────────────────────────────────
  Total time:             0.24s
  Throughput:             211 req/s
  Avg response time:      181ms
  P95:                    222ms
  P99:                    225ms

============================================================
  RESULT: PASSED — System handled all concurrent requests
============================================================
```

You can customize the test by editing `scripts/loadtest.js`:
- `NUM_USERS` — Number of concurrent users (default: 10)
- `NOTIFICATIONS_PER_USER` — Notifications each user sends (default: 5)

### Inspect the Database

Check the data directly in PostgreSQL:

```bash
# View all registered users
docker exec notifyhub-postgres psql -U admin -d notifyhub \
  -c "SELECT id, name, email FROM users;"

# View recent notifications
docker exec notifyhub-postgres psql -U admin -d notifyhub \
  -c "SELECT id, user_id, title, type, status, is_read, channels FROM notifications ORDER BY created_at DESC LIMIT 10;"

# View user preferences
docker exec notifyhub-postgres psql -U admin -d notifyhub \
  -c "SELECT user_id, email_enabled, inapp_enabled, email_address FROM user_preferences;"

# Count notifications by status
docker exec notifyhub-postgres psql -U admin -d notifyhub \
  -c "SELECT status, COUNT(*) FROM notifications GROUP BY status;"
```

### Monitor Queues

Open the Bull Board dashboard to see job status, retries, and failures:

```
http://localhost:3000/dashboard
```

### Test WebSocket (Real-time)

1. Open `http://localhost:3000/app/` and log in
2. Go to **Real-time Monitor** in the sidebar
3. Click **Connect**
4. Open another tab, go to **Send Notification**, and send a notification to yourself
5. Watch it appear instantly in the Real-time Monitor

### Test Rate Limiting

The system limits each user to **10 notifications per minute**. To test:

```bash
# Send 11 rapid requests — the 11th should return 429 Too Many Requests
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    -X POST http://localhost:3000/api/notify \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <your-token>" \
    -d '{"userId":"<your-userId>","type":"info","title":"Rate test","message":"Test '$i'","channels":["inapp"]}'
done
```

Expected: Requests 1-10 return `201`, request 11 returns `429`.