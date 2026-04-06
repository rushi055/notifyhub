# NotifyHub

A scalable, multi-channel notification system built with Node.js that delivers notifications via email and real-time in-app channels. It uses Kafka for async event streaming, BullMQ for reliable job processing with retries, Redis for caching and WebSocket state, and PostgreSQL for persistent storage. Designed with a microservice-friendly architecture where the API, consumers, and workers run as independent processes that can be scaled horizontally.

---

## Architecture

```
                                ┌──────────────┐
                                │  PostgreSQL  │
                                │   (Storage)  │
                                └──────┬───────┘
                                       │
┌──────────┐    ┌───────────┐    ┌─────┴────── ┐     ┌───────────┐    ┌─────────────┐
│  Client  │───▶│  Express │───▶│ Notification│───▶│   Kafka   │───▶│   Consumer  │
│   App    │    │   API     │    │  Service    │     │  (Queue)  │    │  (Group)    │
└──────────┘    └───────────┘    └──────────── ┘     └───────────┘    └─────┬───────┘
                     │                                                      │
                     │                                              ┌───────┴───────┐
                     │                                              │    BullMQ      │
                     │                                              │   (Job Queues) │
                     │                                              └───────┬───────┘
                     │                                           ┌──────────┴──────────┐
                     │                                           │                     │
                     │                                    ┌──────┴──────┐    ┌─────────┴───────┐
                     │                                    │ Email Worker │   │ In-App Worker   │
                     │                                    │ (Nodemailer) │   │ (Socket.io)     │
                     │                                    └─────────────┘    └────────┬────────┘
                     │                                                                │
                     │     ┌──────────────┐                                           │
                     └───▶│    Redis      │◀─────────────────────────────────────────┘
                           │ (Cache/State)│
                           └──────────────┘
```

---

## Tech Stack

| Technology       | Purpose                    | Why                                                                 |
| ---------------- | -------------------------- | ------------------------------------------------------------------- |
| **Node.js**      | Runtime                    | Non-blocking I/O, ideal for high-throughput event-driven workloads  |
| **Express**      | HTTP API framework         | Minimal, flexible, widely adopted                                   |
| **Kafka**        | Event streaming            | Durable, ordered, partitioned message delivery at scale             |
| **BullMQ**       | Job queue & retries        | Redis-backed queues with exponential backoff, concurrency control   |
| **Redis**        | Caching & real-time state  | Sub-ms reads for preferences, socket mapping, rate limiting         |
| **Socket.io**    | Real-time WebSockets       | Bi-directional communication for instant in-app notifications       |
| **PostgreSQL**   | Primary database           | ACID-compliant, JSONB support for flexible notification metadata    |
| **Nodemailer**   | Email delivery             | Reliable SMTP transport with Gmail integration                      |
| **Docker Compose** | Infrastructure            | One-command setup for Postgres, Redis, Kafka, and Zookeeper         |

---

## Key Features

- **Multi-channel delivery** — Email + real-time in-app notifications via a single API call
- **Async event pipeline via Kafka** — API responds in <10ms; heavy work happens asynchronously
- **Retry with exponential backoff** — Failed email jobs retry up to 5 times (1s → 2s → 4s → 8s → 16s)
- **Dead-letter queue** — Failed jobs are retained (last 50) for inspection via Bull Board
- **Per-user preference management** — Users control which channels are enabled; cached in Redis (5 min TTL)
- **Rate limiting** — 10 notifications per user per minute, enforced via Redis counters
- **Real-time WebSocket delivery** — Online users receive notifications instantly via Socket.io
- **Visual queue monitoring** — Bull Board dashboard at `/dashboard` shows job status, retries, and failures
- **Horizontal scaling** — Stateless API servers + independent Kafka consumers + independent workers

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-username/notifyhub.git
cd notifyhub

# 2. Create your .env file
cp .env.example .env
# Edit .env and fill in your Gmail credentials (GMAIL_USER and GMAIL_APP_PASSWORD)

# 3. Start infrastructure (Postgres, Redis, Kafka, Zookeeper)
docker-compose up -d

# 4. Install dependencies
npm install

# 5. Run database migrations
npm run migrate

# 6. Start all services (API + Kafka consumer + workers)
npm run dev
```

### Verify

- Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Bull Board dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- WebSocket test page: [http://localhost:3000/test.html](http://localhost:3000/test.html)
- **Web Interface**: [http://localhost:3000/app/](http://localhost:3000/app/) (Login/Register and full dashboard)

---

## Web Interface

NotifyHub includes a professional web interface for managing notifications without using API tools like Postman.

### Access the Dashboard

Open [http://localhost:3000/app/](http://localhost:3000/app/) in your browser.

### Features

1. **User Authentication**
   - Register new accounts
   - Login with email/password
   - JWT-based session management

2. **Send Notifications**
   - Send to any user by UUID
   - Select notification type (Info, Success, Warning, Error, Reminder, Promotion)
   - Choose delivery channels (Email, In-App, or both)
   - Add custom title, message, and metadata
   - Quick "Use My ID" button for self-testing

3. **View Notifications**
   - List all your notifications with pagination
   - See status (pending, delivered, failed)
   - Visual indicators for notification types
   - Read/unread status tracking

4. **Manage Preferences**
   - Enable/disable email and in-app channels
   - Set quiet hours (no notifications during specified times)
   - Update email address for notifications

5. **Real-time Monitor**
   - WebSocket connection status indicator
   - Live notification feed as they arrive
   - Debug logs for troubleshooting
   - Connection controls

### Quick Demo Flow

```bash
# 1. Open the web interface
http://localhost:3000/app/

# 2. Register a new account
Click "Register" → Enter details → Create Account

# 3. Send yourself a test notification
Click "Use My ID" button
Select type: "Info"
Title: "Welcome to NotifyHub"
Message: "Your first notification!"
Check "In-App Notification"
Click "Send Notification"

# 4. View it in real-time
Click "Real-time Monitor" in sidebar
Click "Connect"
Send another notification from the "Send Notification" section
Watch it appear instantly!

# 5. Check your notification history
Click "All Notifications" in sidebar
See all notifications with timestamps and status
```

See [frontend/README.md](frontend/README.md) for detailed interface documentation.

---

## API Reference

### Auth

| Method | Path                  | Auth | Description               |
| ------ | --------------------- | ---- | ------------------------- |
| POST   | `/api/auth/register`  | No   | Register a new user       |
| POST   | `/api/auth/login`     | No   | Login and receive JWT     |

### Notifications

| Method | Path                                     | Auth   | Description                        |
| ------ | ---------------------------------------- | ------ | ---------------------------------- |
| POST   | `/api/notify`                            | Bearer | Send a notification (queues it)    |
| GET    | `/api/notifications/:userId`             | Bearer | List notifications (paginated)     |
| PATCH  | `/api/notifications/:id/read`            | Bearer | Mark a notification as read        |
| PATCH  | `/api/notifications/read-all/:userId`    | Bearer | Mark all notifications as read     |
| GET    | `/api/notifications/unread-count/:userId`| Bearer | Get unread notification count      |

### Preferences

| Method | Path                        | Auth   | Description                    |
| ------ | --------------------------- | ------ | ------------------------------ |
| GET    | `/api/preferences/:userId`  | Bearer | Get user preferences           |
| PUT    | `/api/preferences/:userId`  | Bearer | Update user preferences        |

### System

| Method | Path           | Auth | Description          |
| ------ | -------------- | ---- | -------------------- |
| GET    | `/api/health`  | No   | Health check         |
| GET    | `/dashboard`   | No   | Bull Board UI        |

---

## How It Works

The journey of a notification in 6 steps:

1. **API receives request** — A client sends `POST /api/notify` with the target user, message, and desired channels (`email`, `inapp`). The request is validated with Zod and rate-limited to 10/min per user.

2. **Saved to database** — The notification is inserted into PostgreSQL with status `pending`. This guarantees the notification is persisted even if downstream services are temporarily unavailable.

3. **Published to Kafka** — The notification is published to the `notifications` topic, keyed by `userId` for ordered delivery per user. The API responds `201 { status: 'queued' }` immediately.

4. **Consumer routes by channel** — The Kafka consumer picks up the message, checks the user's delivery preferences (cached in Redis), and adds jobs to the appropriate BullMQ queues: `email-notifications` and/or `inapp-notifications`.

5. **Workers deliver** — Each worker processes jobs from its queue:
   - **Email Worker**: Fetches the user's email from the database, sends via Gmail/Nodemailer, and updates the notification status to `delivered`.
   - **In-App Worker**: Checks Redis for the user's active WebSocket connection. If online, emits a real-time event via Socket.io. Updates status to `delivered` either way.

6. **Client receives** — Online users receive notifications instantly through their WebSocket connection. Offline users see notifications when they next fetch their notification list.

---

## Scalability

Each component can be scaled independently:

### API Servers
The Express API is stateless — all state lives in PostgreSQL and Redis. Run multiple instances behind a load balancer (e.g., Nginx, AWS ALB). Socket.io can be scaled with the `@socket.io/redis-adapter` to share events across instances.

### Kafka Consumers
Add more consumer instances to the `notifyhub-workers` consumer group. Kafka automatically rebalances partitions across consumers. More partitions = more parallelism.

### Workers
Email and in-app workers are standalone Node.js processes. Spin up additional instances of each — BullMQ distributes jobs across all connected workers automatically. Adjust `concurrency` per worker to tune throughput.

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
