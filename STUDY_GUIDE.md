# NotifyHub — Complete Code Flow Study Guide (Interview-Ready)

This guide walks through every file and every flow in the NotifyHub codebase.
Read it top-to-bottom once, then use the **Interview Q&A** callouts to drill the hard questions.

---

## Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Infrastructure: Docker Compose](#2-infrastructure-docker-compose)
3. [Module 1 — Config, DB, Redis & Kafka Bootstrap](#3-module-1--config-db-redis--kafka-bootstrap)
4. [Module 2 — Server Startup & Graceful Shutdown](#4-module-2--server-startup--graceful-shutdown)
5. [Module 3 — Authentication Flow](#5-module-3--authentication-flow)
6. [Module 4 — Notification Trigger Flow](#6-module-4--notification-trigger-flow)
7. [Module 5 — Kafka Consumer → BullMQ Routing](#7-module-5--kafka-consumer--bullmq-routing)
8. [Module 6 — Email Delivery Worker](#8-module-6--email-delivery-worker)
9. [Module 7 — In-App Delivery Worker & Redis Pub/Sub](#9-module-7--in-app-delivery-worker--redis-pubsub)
10. [Module 8 — WebSocket & Real-Time Push](#10-module-8--websocket--real-time-push)
11. [Module 9 — Notification History REST API](#11-module-9--notification-history-rest-api)
12. [Module 10 — User Preferences & Cache-Aside](#12-module-10--user-preferences--cache-aside)
13. [Module 11 — Rate Limiting](#13-module-11--rate-limiting)
14. [Module 12 — Bull Board (Queue Dashboard)](#14-module-12--bull-board-queue-dashboard)
15. [Database Schema Reference](#15-database-schema-reference)
16. [Complete End-to-End Flow (One-Liner per Step)](#16-complete-end-to-end-flow)
17. [Master Interview Q&A Cheatsheet](#17-master-interview-qa-cheatsheet)

---

## 1. Project Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         4 NODE PROCESSES                         │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐                        │
│  │   server.js    │  │  consumer.js    │                        │
│  │  HTTP + WS +   │  │  Kafka consumer │                        │
│  │  Kafka producer│  │  → BullMQ router│                        │
│  └───────┬────────┘  └────────┬────────┘                        │
│          │                    │                                  │
│  ┌───────▼────────┐  ┌────────▼────────┐                        │
│  │ emailWorker.js │  │ inappWorker.js  │                        │
│  │  BullMQ worker │  │  BullMQ worker  │                        │
│  │  → Gmail SMTP  │  │  → Redis pub/sub│                        │
│  └────────────────┘  └─────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘

External services: PostgreSQL · Redis · Kafka (+ Zookeeper)
```

**Why split into 4 processes?**
Each process can be scaled, restarted, and monitored independently.
The workers don't need an HTTP server; the server doesn't need to run email jobs.

---

## 2. Infrastructure: Docker Compose

**File:** `docker-compose.yml`

| Service | Image | Port | Role |
|---|---|---|---|
| `postgres` | postgres:15 | 5432 | Primary relational DB |
| `redis` | redis:7-alpine | 6379 | Cache + BullMQ backend + pub/sub + rate-limit counter |
| `zookeeper` | cp-zookeeper:7.4.0 | 2181 | Kafka cluster coordination (metadata, leader election) |
| `kafka` | cp-kafka:7.4.0 | 9092 | Message broker |

**Key Kafka env vars:**
- `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"` — the `notifications` topic is created automatically on first publish, no manual setup needed.
- `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1` — only 1 broker in dev, so replication factor must be 1 (production would use 3).

> **Interview Q:** *Why does Kafka need Zookeeper?*  
> Zookeeper stores Kafka's cluster metadata: which brokers are alive, which broker is the partition leader, consumer group offsets (in older Kafka). KafkaJS and modern Kafka (2.8+) can use KRaft mode without Zookeeper, but the Confluent images here still use it.

---

## 3. Module 1 — Config, DB, Redis & Kafka Bootstrap

### `src/config/index.js`

```
dotenv.config() → reads .env file into process.env

Required vars: DATABASE_URL, REDIS_URL, JWT_SECRET, KAFKA_BROKERS
→ Loop throws immediately if any are missing (fail-fast)

Exports: config object (port, databaseUrl, redisUrl, kafkaBrokers[], jwtSecret, nodeEnv, gmail{user,pass})
```

- `kafkaBrokers` is split on `,` — supports multiple broker addresses for a real cluster.
- Single exported object = single source of truth; no scattered `process.env` reads across the app.

> **Interview Q:** *Why validate env vars at startup instead of lazily reading them when needed?*  
> Fail-fast: you crash immediately with a clear error before serving any traffic. Lazy reads mean you might only discover a missing variable in production under a specific code path.

---

### `src/db/postgres.js`

```
pg.Pool({ connectionString, max: 10 })

Exports:
  pool   — raw pool (used for pool.end() on shutdown)
  query  — async helper: (text, params) => pool.query(text, params)
```

- All DB calls in the entire app go through the `query` export — consistent parameterized queries prevent SQL injection.
- `max: 10` caps concurrent DB connections. More than needed wastes Postgres memory; too few creates a queue of waiting queries.

> **Interview Q:** *What is connection pooling and why is it important?*  
> Without pooling, every incoming HTTP request opens a new TCP connection + authentication handshake to Postgres, then closes it. This is slow (~5-10 ms overhead) and Postgres has a hard limit on concurrent connections. A pool keeps connections open and reuses them, reducing latency and resource usage.

> **Interview Q:** *What happens when all 10 pool connections are busy?*  
> New queries queue up inside pg.Pool until a connection is freed. If the wait exceeds the `idleTimeoutMillis` (default 10s), the query errors with a timeout.

---

### `src/redis/client.js`

```
createClient({ url: config.redisUrl })
await client.connect()   ← top-level await (ESM "type":"module" required)

Exports:
  default client   — raw Redis client (used for pub/sub, custom commands)
  redisHelpers     — typed wrappers: set, get, del, incr, expire, exists
```

- Top-level `await` works because `package.json` has `"type": "module"` — Node treats all `.js` files as ES modules.
- **Why export both?** The raw client is needed for `subscribe`/`publish` calls (pub/sub requires a dedicated connection that can't run other commands). `redisHelpers` is a clean API for the common operations everywhere else.

> **Interview Q:** *Why can't you use the same Redis connection for both subscribing and regular commands?*  
> Once a Redis client enters subscriber mode (after calling `SUBSCRIBE`), it can only receive messages — it cannot send `GET`, `SET`, etc. You must create a separate client for each role.

---

### `src/kafka/client.js`

```
new Kafka({ clientId: 'notifyhub', brokers: config.kafkaBrokers, retry: { retries: 5 } })

Exports default kafka instance (singleton)
```

- Both `producer.js` and `consumer.js` import this singleton and call `.producer()` / `.consumer()` on it — they share the same configured Kafka instance but get independent connections.
- `retry: { retries: 5 }` means KafkaJS will automatically retry failed connection attempts 5 times with exponential backoff before throwing.

---

## 4. Module 2 — Server Startup & Graceful Shutdown

**File:** `src/server.js`

### Express + Middleware Stack

```
app.use(cors())                       — allows cross-origin requests (frontend on different port)
app.use(morgan('dev'))                — HTTP request logging
app.use(express.json())               — parses JSON request bodies
app.use(express.urlencoded(...))      — parses form-encoded bodies
app.use(express.static('public'))     — serves static files from /public
app.use('/app', static('frontend'))   — serves React/HTML frontend
```

### Route Registration

```
/api/auth          → authRouter
/api/notify        → notifyRouter
/api/notifications → notificationsRouter
/api/preferences   → preferencesRouter
/dashboard         → bullBoardRouter (queue monitoring UI)
/api/health        → { status: 'ok', timestamp }
```

### `createServer(app)` — Why wrap Express in `http.createServer`?

`new Server(server, ...)` (Socket.io) needs the raw Node HTTP server to attach its WebSocket upgrade handler. If you passed `app` directly, Socket.io couldn't intercept the HTTP upgrade event.

### Startup Sequence (`start()`)

```
1. checkDependencies()
   ├── redisClient.ping()       — Redis must respond
   └── query('SELECT 1')        — Postgres must accept queries
   If either fails → process.exit(1)

2. connectProducer()             — Kafka producer connects

3. setupSocketHandlers(io)       — Redis subscriber + Socket.io handlers registered

4. server.listen(config.port)    — Start accepting traffic
```

**Why check dependencies before listening?** If Redis or Postgres is down, every request will fail. Better to crash with a clear log than silently serve 500 errors.

### Graceful Shutdown (`SIGTERM` / `SIGINT`)

```
1. Set 10-second force-exit timeout (safety net)
2. server.close()           — stop accepting new HTTP connections
3. disconnectProducer()     — flush pending Kafka messages and disconnect
4. redisClient.quit()       — send QUIT command (graceful Redis close)
5. pool.end()               — drain Postgres pool connections
6. clearTimeout(forceExit)  — cancel the 10s kill timer
7. process.exit(0)
```

> **Interview Q:** *Why handle SIGTERM?*  
> Kubernetes/Docker send SIGTERM before killing a container (typically with 30s grace). Handling it lets in-flight HTTP requests finish, Kafka messages flush, and database connections close cleanly. Without it, you'd leave dangling Kafka messages and corrupt state.

> **Interview Q:** *What does the 10-second force-exit timer protect against?*  
> If any shutdown step hangs (e.g., Kafka can't disconnect), the timer fires `process.exit(1)` anyway. This prevents the container from hanging indefinitely and blocking deployment rollouts.

---

## 5. Module 3 — Authentication Flow

### Database: `003_create_users.sql`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

UUIDs as primary keys avoid sequential enumeration attacks (`/users/1`, `/users/2`...) and work across distributed systems without coordination.

---

### Register — `POST /api/auth/register`

**File:** `src/routes/auth.js`

```
1. Zod validates body: { name: string, email: valid email, password: min 8 chars }
   └── ZodError → 400 Bad Request

2. SELECT id FROM users WHERE email = $1
   └── Exists → 409 Conflict "Email already registered"

3. bcrypt.hash(password, 10)
   └── saltRounds=10 → 2^10=1024 hashing iterations → ~100ms on modern CPU

4. INSERT INTO users (name, email, password_hash) RETURNING id

5. INSERT INTO user_preferences (user_id, email_enabled=true, inapp_enabled=true, email_address)
   └── Every user gets both channels enabled by default

6. Return 201 { userId, name, email }   ← no token; user must log in
```

> **Interview Q:** *Why not return a JWT on register?*  
> Separation of concerns — register creates the account, login authenticates. Some apps send a verification email before allowing login, so auto-issuing a token on register would bypass that gate.

> **Interview Q:** *Why bcrypt instead of SHA-256?*  
> bcrypt is intentionally slow (configurable work factor). SHA-256 is fast — an attacker can hash billions of guesses per second with a GPU. bcrypt's built-in salt also prevents rainbow table attacks.

---

### Login — `POST /api/auth/login`

```
1. Zod validates body: { email, password }

2. SELECT id, name, password_hash FROM users WHERE email = $1
   └── No rows → 401 "Invalid credentials" (don't reveal whether email exists)

3. bcrypt.compare(plaintext, hash)
   └── false → 401 "Invalid credentials"

4. createToken(user.id)
   └── jwt.sign({ userId }, config.jwtSecret, { expiresIn: '24h' })

5. Return 200 { token, userId, name }
```

> **Interview Q:** *Why return the same "Invalid credentials" message for both "email not found" and "wrong password"?*  
> User enumeration protection. If you said "email not found" the attacker knows which emails are registered and can target them with phishing or credential stuffing.

---

### Auth Service — `src/services/authService.js`

```javascript
createToken(userId)  → jwt.sign({ userId }, secret, { expiresIn: '24h' })
verifyToken(token)   → jwt.verify(token, secret)  // throws if invalid/expired
```

The JWT payload contains only `userId`. The secret is an env var — never hardcoded.

---

### Auth Middleware — `src/middleware/auth.js`

```
Request arrives with header: "Authorization: Bearer <token>"

1. Extract token: header.slice(7)
2. verifyToken(token)
   ├── Success → req.userId = payload.userId; next()
   └── Throws  → 401 "Invalid or expired token"
```

`req.userId` is then available in every downstream route handler.

> **Interview Q:** *What's the difference between authentication and authorization?*  
> **Authentication** = proving who you are (JWT validation here).  
> **Authorization** = what you're allowed to do (e.g., preferences route checks `req.userId !== req.params.userId` to block modifying another user's settings).

> **Interview Q:** *Why are JWTs stateless?*  
> The server doesn't store anything. The token itself is self-contained (payload + signature). Any server instance can verify it with just the secret — perfect for horizontal scaling.

---

## 6. Module 4 — Notification Trigger Flow

### Rate Limiter — `src/middleware/rateLimiter.js`

```
Redis key: "ratelimit:notify:<userId>"

INCR key            → atomically increment and get new count
if count === 1:
  EXPIRE key 60     → start 60-second window on first request

if count > 10:
  → 429 "Too many notifications. Limit is 10 per minute."
else:
  → next()
```

> **Interview Q:** *Why use Redis for rate limiting instead of an in-memory counter?*  
> In-memory is per-process. With multiple server instances, each has its own counter — a user could send 10× the limit. Redis is shared across all instances, making limits accurate in horizontal scaling.

> **Interview Q:** *What is the sliding window vs fixed window problem here?*  
> This is a **fixed window** counter. The window resets at 60s after the first request in that window. A user could send 10 at second 59, wait 2 seconds (new window starts), and send 10 more — 20 requests in 2 seconds. A **sliding window** (using Redis sorted sets) would prevent this.

---

### Notify Route — `POST /api/notify`

**File:** `src/routes/notify.js`

```
Middleware chain: authMiddleware → rateLimiter → handler

Zod schema validates:
  userId:   UUID string
  type:     string (1-100 chars)
  title:    string (1-255 chars)
  message:  string (min 1)
  channels: array of 'email'|'inapp', minimum 1 item
  metadata: optional key-value object

→ triggerNotification(data)
→ 201 { notificationId, status: 'queued' }
```

---

### Notification Service — `src/services/notificationService.js`

```
1. INSERT INTO notifications (user_id, type, title, message, channels, metadata)
   VALUES ($1, $2, $3, $4, $5::text[], $6)
   RETURNING *
   └── $5::text[] explicit cast: channels array stored as Postgres TEXT[]
   └── metadata stored as JSONB (flexible schema, queryable)

2. publishNotification(notification)   ← Kafka publish
   └── On failure: log error, DO NOT throw
       The notification is already in DB; no data loss
       The HTTP response still returns the notificationId

3. return notification (the inserted row)
```

**Why not fail the HTTP request if Kafka is down?**
The notification is durably saved in Postgres with `status='pending'`. A separate retry/replay job could pick these up. Failing the HTTP request would give the caller a false impression that the notification wasn't created.

---

### Kafka Producer — `src/kafka/producer.js`

```
producer.send({
  topic: 'notifications',
  messages: [{
    key:   notification.userId,    ← partition key
    value: JSON.stringify(notification)
  }]
})
```

> **Interview Q:** *Why use `userId` as the Kafka message key?*  
> Messages with the same key always go to the same partition. This guarantees **ordering** — all notifications for a given user are processed sequentially, preventing race conditions where notification #2 is delivered before notification #1.

---

## 7. Module 5 — Kafka Consumer → BullMQ Routing

**File:** `src/kafka/consumer.js` (runs as its own process)

```
consumer = kafka.consumer({ groupId: 'notifyhub-workers' })

consumer.subscribe({ topic: 'notifications', fromBeginning: false })
  └── fromBeginning: false → only process new messages, skip history

consumer.run({ eachMessage: async ({ partition, message }) => {
  notification = JSON.parse(message.value)

  prefs = await getUserPreferences(notification.user_id)
    └── Redis cache hit → return immediately
    └── Cache miss → SELECT FROM user_preferences → cache for 5 min

  if channels.includes('email') && prefs.email_enabled:
    emailQueue.add('send-email', notification, { attempts:5, backoff: exponential/1000ms })

  if channels.includes('inapp') && prefs.inapp_enabled:
    inappQueue.add('send-inapp', notification)
}})
```

> **Interview Q:** *What is a Kafka consumer group?*  
> All consumers sharing the same `groupId` form a group. Kafka assigns each partition to exactly one consumer in the group. If you add a second consumer instance, Kafka rebalances and gives it some partitions — enabling parallel processing without duplicate message delivery.

> **Interview Q:** *What happens if the consumer crashes mid-processing?*  
> KafkaJS commits offsets after successful processing. If the consumer crashes before commit, the message will be re-delivered on restart (at-least-once delivery). This means email workers must be idempotent or use deduplication.

> **Interview Q:** *Why go Kafka → BullMQ instead of processing directly in the consumer?*  
> Kafka is a transport layer — it doesn't retry failed jobs with backoff, doesn't have a monitoring UI, and doesn't support job-level persistence. BullMQ adds: 5-attempt retries with exponential backoff, a web dashboard, job state tracking (waiting/active/completed/failed), and per-job data storage in Redis.

---

## 8. Module 6 — Email Delivery Worker

**File:** `src/queues/emailWorker.js` (runs as its own process)

```
Queue definition (emailQueue.js):
  name:    'email-notifications'
  backend: Redis (config.redisUrl)
  defaultJobOptions:
    attempts:         5
    backoff:          { type: 'exponential', delay: 1000 }  ← 1s, 2s, 4s, 8s, 16s
    removeOnComplete: { count: 100 }  ← keep last 100 successful jobs for audit
    removeOnFail:     { count: 50 }   ← keep last 50 failed jobs for debugging

Worker:
  concurrency: 5   ← 5 jobs processed in parallel

Job handler:
  1. Extract { id, title, message, user_id } from job.data
  2. SELECT email FROM users WHERE id = $1
     └── No user → throw (job fails, BullMQ retries)
  3. transporter.sendMail({ from, to, subject: title, html: <h2>+<p> })
     └── Gmail SMTP via nodemailer (credentials from config.gmail)
  4. UPDATE notifications SET status='delivered', delivered_at=NOW() WHERE id=$1
```

**nodemailer transport:**
```javascript
nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
```
`pass` is a Gmail **App Password** (not the account password) — required when 2FA is enabled on the Gmail account.

> **Interview Q:** *What is exponential backoff?*  
> On failure, retry after 1s, then 2s, 4s, 8s, 16s. This prevents overwhelming a temporarily down service with rapid retries (thundering herd problem). Total wait before giving up: ~31 seconds across 5 attempts.

> **Interview Q:** *What if Gmail is down for 10 minutes?*  
> BullMQ retries up to 5 times with exponential backoff. After 5 failures, the job moves to the `failed` state, visible on Bull Board. The notification stays in the DB with `status='pending'`. A manual retry can be triggered from the dashboard.

---

## 9. Module 7 — In-App Delivery Worker & Redis Pub/Sub

**File:** `src/queues/inappWorker.js` (runs as its own process)

```
Queue definition (inappQueue.js):
  name:    'inapp-notifications'
  backend: Redis
  defaultJobOptions:
    attempts:         3   ← fewer retries (Redis publish is local, faster)
    removeOnComplete: { count: 100 }
    removeOnFail:     { count: 50 }

Worker:
  concurrency: 10   ← higher than email (Redis publish is cheap/fast)

const publisher = createClient({ url: config.redisUrl })
await publisher.connect()   ← separate Redis client for publishing

Job handler:
  1. Extract { id, user_id, title, message, type, created_at } from job.data
  2. publisher.publish('inapp-notifications', JSON.stringify({ id, user_id, title, message, type, createdAt }))
     └── Redis pub/sub: any subscriber to this channel receives the message
  3. UPDATE notifications SET status='delivered', delivered_at=NOW() WHERE id=$1
```

> **Interview Q:** *Why does the worker create its own Redis client instead of using the shared one?*  
> This worker runs in a completely separate OS process from server.js. It has no access to the `redisClient` singleton exported by `src/redis/client.js` in the server process. Each process must create its own connections.

> **Interview Q:** *Why use Redis pub/sub to bridge the worker to Socket.io instead of emitting directly?*  
> The worker process has no reference to the Socket.io `io` object — it lives only in `server.js`. Redis pub/sub is the standard inter-process communication pattern: worker publishes, server subscribes and emits over the socket.

---

## 10. Module 8 — WebSocket & Real-Time Push

**File:** `src/websocket/socketHandler.js`

### Setup (called once during `start()` in server.js)

```javascript
// Dedicated subscriber client — can ONLY subscribe, not run other commands
const subscriber = createClient({ url: config.redisUrl })
await subscriber.connect()

await subscriber.subscribe('inapp-notifications', async (message) => {
  const { id, user_id, title, message: msg, type, createdAt } = JSON.parse(message)

  // Look up the user's current socket ID
  const socketId = await redisClient.get(`socket:${user_id}`)

  if (socketId) {
    io.to(socketId).emit('new_notification', { id, title, message: msg, type, createdAt })
    // → real-time push to the specific connected client
  } else {
    // User is offline — notification is still in DB history
    console.log(`User ${user_id} offline`)
  }
})
```

### Socket.io Connection Lifecycle

```
Client connects with: { auth: { userId } }

on('connection'):
  1. Validate userId → disconnect if missing
  2. redisClient.set('socket:<userId>', socket.id, { EX: 3600 })
     └── 1-hour TTL — auto-cleans stale entries if client doesn't disconnect cleanly
  3. socket.join('user:<userId>')
     └── Joins a named room (useful for future broadcast-to-user features)

on('mark-read', notificationId):
  UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2
  emit('marked-read', { notificationId })
  └── Direct DB update via socket — no HTTP round-trip

on('get-unread-count'):
  SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false
  emit('unread-count', { count })

on('disconnect'):
  redisClient.del('socket:<userId>')
  └── Remove the mapping so future pub/sub doesn't try to reach this dead socket
```

> **Interview Q:** *Why store socket IDs in Redis instead of in-memory (a Map)?*  
> With multiple server instances behind a load balancer, a notification might be processed by server A but the user is connected to server B. If socket IDs were stored in-memory on server A, server A couldn't reach the socket on server B. Redis is the shared lookup table across all instances.

> **Interview Q:** *What happens if a user receives a notification while offline?*  
> The `socketId` lookup returns `null`. The `inappWorker` still updates `status='delivered'` in the DB, and the notification is available via `GET /api/notifications/:userId` whenever the user opens the app.

> **Interview Q:** *What is the 1-hour TTL on `socket:<userId>` for?*  
> If a client disconnects ungracefully (browser crash, network drop), the `disconnect` event may not fire. Without TTL, a stale socket ID could live in Redis forever. Attempts to emit to a stale socket ID will silently fail (Socket.io ignores unknown IDs), but it wastes a Redis lookup. The TTL bounds the stale window to 1 hour.

---

## 11. Module 9 — Notification History REST API

**File:** `src/routes/notifications.js`

All routes use `authMiddleware`.

### `GET /api/notifications/:userId` — Paginated List

```
Query params: page (default 1), limit (default 20, max 100)
offset = (page - 1) * limit

Promise.all([
  SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3,
  SELECT COUNT(*) FROM notifications WHERE user_id=$1,
  SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false
])
└── 3 independent queries run in parallel — 3× faster than sequential

Returns: { notifications[], total, unreadCount, page, limit }
```

> **Interview Q:** *What does `Promise.all` do here?*  
> Runs all 3 DB queries concurrently. If done sequentially (await each), total time = sum of each query time. With `Promise.all`, total time ≈ the slowest individual query. All 3 are independent reads so there's no data dependency.

### `GET /api/notifications/unread-count/:userId`

Lightweight count for notification bell badge: `SELECT COUNT(*) WHERE user_id=$1 AND is_read=false`

### `PATCH /api/notifications/:id/read` — Mark Single as Read

```
UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2
└── user_id=$2 = req.userId (from JWT) — prevents marking someone else's notification
```

### `PATCH /api/notifications/read-all/:userId` — Bulk Mark Read

```
UPDATE notifications SET is_read=true WHERE user_id=$1 AND is_read=false
Returns: { success: true, updated: rowCount }
```

---

## 12. Module 10 — User Preferences & Cache-Aside

### `src/services/preferenceService.js`

#### Read: `getUserPreferences(userId)` — Cache-Aside Pattern

```
1. redisClient.get('prefs:<userId>')
   ├── Cache HIT  → JSON.parse and return immediately
   └── Cache MISS ↓

2. SELECT * FROM user_preferences WHERE user_id=$1
   └── No row → return defaults { email_enabled: true, inapp_enabled: true }

3. redisClient.set('prefs:<userId>', JSON.stringify(prefs), { EX: 300 })
   └── Cache for 5 minutes (300 seconds)

4. return prefs
```

> **Interview Q:** *What is the cache-aside (lazy loading) pattern?*  
> Don't pre-populate the cache. Only load into cache on first read (cache miss). This is efficient when many users' preferences are rarely read.

> **Interview Q:** *What is the downside of a 5-minute TTL?*  
> For up to 5 minutes after a preference update, the old cached value is served. In this app, the update explicitly deletes the cache key (`redisClient.del`), so the stale window is actually zero — the TTL is a safety net, not the primary invalidation mechanism.

#### Write: `updatePreferences(userId, data)` — UPSERT + Cache Invalidation

```sql
INSERT INTO user_preferences (user_id, email_enabled, inapp_enabled, email_address, quiet_hours_start, quiet_hours_end)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id) DO UPDATE SET
  email_enabled=$2, inapp_enabled=$3,
  email_address=$4, quiet_hours_start=$5,
  quiet_hours_end=$6, updated_at=NOW()
RETURNING *
```

```
After write: redisClient.del('prefs:<userId>')
└── Force next read to fetch fresh data from DB
```

> **Interview Q:** *What is a PostgreSQL UPSERT?*  
> `INSERT ... ON CONFLICT DO UPDATE` — atomically inserts if the row doesn't exist, or updates it if it does. This avoids a separate `SELECT` + conditional `INSERT/UPDATE` which would be a race condition under concurrent requests.

### `src/routes/preferences.js`

- `GET /:userId` — fetches preferences (no authorization check — any logged-in user can view another's preferences — this might be a future improvement).
- `PUT /:userId` — **authorization check**: `req.userId !== req.params.userId` → 403 Forbidden. Users can only update their own preferences.

---

## 13. Module 11 — Rate Limiting

**File:** `src/middleware/rateLimiter.js`  
Applied only to `POST /api/notify` (notification trigger), not to read/auth routes.

```
Redis key: "ratelimit:notify:<userId>"

INCR "ratelimit:notify:<userId>"   → atomic increment, returns new count
if count === 1: EXPIRE key 60      → start 60s window on first request
if count > 10:  → 429 { error, retryAfter: 60 }
else:           → next()
```

**Why INCR is atomic:** Redis is single-threaded. INCR is guaranteed to be atomic — no two concurrent requests can get the same count value. This makes it a perfect distributed counter.

> **Interview Q:** *What's the difference between INCR+EXPIRE and a more sophisticated rate limiter?*  
> This is a simple fixed-window counter. It has the "boundary burst" problem (10 requests at second 59 + 10 at second 61 = 20 in 2 seconds). A token bucket or sliding window algorithm using Redis sorted sets would prevent this, but adds complexity.

---

## 14. Module 12 — Bull Board (Queue Dashboard)

**File:** `src/dashboard/bullboard.js`

```javascript
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/dashboard')

createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(inappQueue)],
  serverAdapter
})

export default serverAdapter.getRouter()
// Mounted in server.js: app.use('/dashboard', bullBoardRouter)
```

Accessible at `http://localhost:3000/dashboard`.

Features:
- View jobs by state: waiting, active, completed, failed, delayed
- Inspect job data (the full notification object)
- Retry failed jobs manually
- Pause/resume queues
- See failure error messages and stack traces

> **Interview Q:** *Why is this useful in production?*  
> Without a dashboard, debugging why notifications aren't being delivered requires reading Redis keys directly or scanning logs. Bull Board gives instant visibility into queue health, error rates, and individual job failures.

---

## 15. Database Schema Reference

### `notifications` table (`001_create_notifications.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` — auto-generated |
| `user_id` | UUID NOT NULL | Foreign key (no constraint — intentional for perf) |
| `type` | VARCHAR(100) | e.g., `'order_shipped'`, `'password_reset'` |
| `title` | VARCHAR(255) | Notification headline |
| `message` | TEXT | Full notification body |
| `channels` | TEXT[] | e.g., `{'email','inapp'}` — Postgres array type |
| `status` | VARCHAR(20) | `'pending'` → `'delivered'` |
| `is_read` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMP | Auto-set on insert |
| `delivered_at` | TIMESTAMP | Set by worker on delivery |
| `metadata` | JSONB | Flexible extra data, queryable with `->>`  |

**Indexes:**
- `idx_notifications_user_id (user_id)` — speeds up `WHERE user_id=$1` queries
- `idx_notifications_user_unread (user_id, is_read)` — composite index for unread count queries (avoids full table scan)

### `user_preferences` table (`002_create_user_preferences.sql`)

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID PK | One row per user |
| `email_enabled` | BOOLEAN | Default true |
| `inapp_enabled` | BOOLEAN | Default true |
| `email_address` | VARCHAR(255) | Delivery email (may differ from login email) |
| `quiet_hours_start` | TIME | Stored but not yet enforced in code |
| `quiet_hours_end` | TIME | Stored but not yet enforced in code |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Updated via UPSERT |

### `users` table (`003_create_users.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `name` | VARCHAR(100) NOT NULL | |
| `email` | VARCHAR(255) UNIQUE NOT NULL | Enforced unique at DB level |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt output |
| `created_at` | TIMESTAMP | |

---

## 16. Complete End-to-End Flow

```
1. POST /api/auth/register
   → Zod validates body
   → bcrypt hashes password
   → INSERT users row
   → INSERT user_preferences row (defaults)
   → return { userId, name, email }

2. POST /api/auth/login
   → Zod validates
   → SELECT password_hash
   → bcrypt.compare
   → jwt.sign({ userId }, secret, 24h)
   → return { token, userId, name }

3. Client connects WebSocket
   → socket.handshake.auth.userId validated
   → redis SET socket:<userId> = socket.id (TTL 1h)
   → socket joins room 'user:<userId>'

4. POST /api/notify  (Authorization: Bearer <token>)
   → authMiddleware: jwt.verify → req.userId
   → rateLimiter: redis INCR ratelimit:notify:<userId> — check ≤ 10/min
   → Zod validates body
   → INSERT notifications (status='pending')
   → kafka producer.send({ topic:'notifications', key:userId, value:notificationJSON })
   → return 201 { notificationId, status:'queued' }

5. Kafka consumer (consumer.js process) receives message
   → getUserPreferences(user_id): redis GET prefs:<userId> || SELECT user_preferences
   → if email channel + email_enabled: emailQueue.add('send-email', notification)
   → if inapp channel + inapp_enabled: inappQueue.add('send-inapp', notification)

6a. Email worker (emailWorker.js process) picks email job
    → SELECT email FROM users WHERE id=user_id
    → nodemailer.sendMail (Gmail SMTP)
    → UPDATE notifications SET status='delivered', delivered_at=NOW()

6b. In-app worker (inappWorker.js process) picks inapp job
    → redis PUBLISH 'inapp-notifications' notificationJSON
    → UPDATE notifications SET status='delivered', delivered_at=NOW()

7. server.js socketHandler receives Redis pub/sub message
   → redis GET socket:<user_id>   ← look up active socket
   → if found: io.to(socketId).emit('new_notification', payload)
   → if not:   log "user offline"

8. Client receives 'new_notification' event via WebSocket — real-time UI update

9. GET /api/notifications/:userId?page=1&limit=20
   → authMiddleware
   → Promise.all([notifications, total count, unread count])
   → return paginated list

10. socket.emit('mark-read', notificationId) OR PATCH /api/notifications/:id/read
    → UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2
```

---

## 17. Master Interview Q&A Cheatsheet

| Question | Answer |
|---|---|
| **What does this system do?** | A notification platform: users register, clients send notification requests via REST API, messages flow through Kafka → BullMQ → workers that deliver via email (Gmail) and real-time push (Socket.io via Redis pub/sub) |
| **Why Kafka?** | Decouples the HTTP API from delivery workers; durable and replayable; handles traffic spikes; guarantees per-user ordering via partition key |
| **Why BullMQ on top of Kafka?** | Kafka delivers once; BullMQ adds retry logic with exponential backoff, job monitoring dashboard, and per-job state tracking |
| **Why Redis for so many things?** | It's extremely fast and flexible: BullMQ job store, rate limit counter, preferences cache, socket ID lookup table, pub/sub message bus — all in one low-latency store |
| **Why pub/sub for in-app?** | Worker process and server process are separate OS processes; Redis pub/sub is the IPC channel between them |
| **Why partition key = userId?** | Guarantees all notifications for the same user land in the same partition, ensuring ordered delivery per user |
| **JWT vs sessions?** | JWTs are stateless (no server storage, scales horizontally); sessions require server-side store (Redis/DB) per session |
| **Cache-aside vs write-through?** | Cache-aside: populate cache on read miss, invalidate on write. Write-through: write to DB and cache simultaneously. This app uses cache-aside with explicit `DEL` on write |
| **What is connection pooling?** | Reuse existing TCP connections to DB instead of opening/closing per request; `max:10` limits concurrent connections to avoid overwhelming Postgres |
| **What is graceful shutdown?** | Handle SIGTERM to drain in-flight requests, flush Kafka messages, and close DB/Redis connections cleanly before process exits |
| **What is UPSERT?** | `INSERT ... ON CONFLICT DO UPDATE` — atomically creates or updates a row without a separate read; prevents race conditions |
| **What happens if Kafka is down?** | `publishNotification` throws, caught and logged; notification stays in DB with `status='pending'`; a replay mechanism could retry pending records |
| **What is exponential backoff?** | Retry delays: 1s, 2s, 4s, 8s, 16s — avoids thundering herd when downstream service is temporarily unavailable |
| **Quiet hours are stored but not used?** | Yes — the schema has `quiet_hours_start/end` columns, and the preferences API accepts them, but the consumer/worker code doesn't check them yet. This is a planned feature |
| **What if a user is offline when a notification arrives?** | Worker publishes to Redis pub/sub, socket handler finds no socket ID, logs "user offline". Notification is in DB and delivered via REST on next load |
| **Why store socket IDs in Redis?** | Multi-instance scaling: the worker might run on a different server than the one the user's WebSocket is connected to; Redis is the shared registry |
| **What is `fromBeginning: false` in Kafka?** | Consumer only processes messages produced after it subscribes; won't replay historical messages on restart (offset is committed after each message) |
| **What is a Kafka consumer group?** | Consumers sharing the same `groupId` share the partition load; each partition processed by exactly one consumer in the group; enables horizontal scaling of consumers |
| **Why does `type: module` matter?** | Enables ES module syntax (`import/export`) and top-level `await` in Node.js; required for `await client.connect()` at the top level of `redis/client.js` |
| **What does `pg.Pool max:10` mean?** | At most 10 simultaneous Postgres connections; additional queries queue until one is freed; protects Postgres from connection exhaustion |
| **Why validate Zod server-side if there's a frontend?** | Frontend validation is UX only — easily bypassed. Server-side validation is the security gate. Never trust client input. |
