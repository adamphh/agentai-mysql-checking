# System Architecture - MySQL Telegram Monitor

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      TELEGRAM USER                          │
└────────────────┬────────────────────────────────────────────┘
                 │ /status, /slowqueries, /alerts...
                 ▼
┌─────────────────────────────────────────────────────────────┐
│          TELEGRAM BOT (telegraf)                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Auth (telegram/auth.js) - Whitelist + Password        │ │
│  │ Handlers (telegram/handlers.js) - Command routing     │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────┬──────────────────────────────────┬─────────────┘
             │                                  │
             │ Query metrics                    │ Trigger alert
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│           MONITORING ENGINE (services/)                     │
│  ┌──────────────────────┐                                   │
│  │ MySQL Connections    │                                   │
│  │  • Local             │                                   │
│  │  • Docker            │                                   │
│  │  • AWS RDS           │                                   │
│  └──────────────────────┘                                   │
│           ▼                                                  │
│  ┌──────────────────────┐                                   │
│  │ Metrics Collector    │ ← SHOW PROCESSLIST, VARIABLES... │
│  │                      │                                   │
│  │ • Long queries       │                                   │
│  │ • CPU/Memory         │                                   │
│  │ • Connections        │                                   │
│  │ • Locks/Deadlocks    │                                   │
│  └──────────────────────┘                                   │
│           ▼                                                  │
│  ┌──────────────────────┐                                   │
│  │ Alert Detector       │ ← Check thresholds               │
│  │                      │                                   │
│  │ If alert triggered → │                                   │
│  └──────────────────────┘                                   │
│           ▼                                                  │
│  ┌──────────────────────┐                                   │
│  │ History Manager      │ → JSON files (7-day rolling)     │
│  │                      │   Auto-cleanup daily at 2 AM     │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. MySQL Connections Layer (`config/mysql-connections.js`)

**Purpose:** Centralized connection management for 3 instances

**Key Responsibilities:**
- Create connection pools for each instance (local, docker, aws)
- Handle connection failures & auto-reconnect
- Provide query execution interface
- Expose instance health status

**Connection Lifecycle:**
```
Init → Pool Created → Health Check → Ready
                          ↑
                          └── Periodic ping (every 60s)
                                  │
                          If fail → Reconnect attempt
                                     (exponential backoff)
```

**Error Handling:**
- ECONNREFUSED → Log + retry in 10s
- PROTOCOL_ERROR → Log + close + recreate
- QUERY_TIMEOUT → Log + alert
- Authentication errors → Log + notify admin

---

### 2. Metrics Collector (`services/metrics-collector.js`)

**Purpose:** Gather performance data from all 3 MySQL instances

**Monitoring Loop (Every 30 seconds):**
1. For each instance (local, docker, aws):
   - Get current running queries: `SHOW PROCESSLIST`
   - Get system variables: `SELECT * FROM information_schema.global_variables`
   - Get slow query log entries (last 30s)
   - Get InnoDB status: `SHOW ENGINE INNODB STATUS`

2. Extract key metrics:
   ```javascript
   {
     instance: 'docker',
     timestamp: Date.now(),
     metrics: {
       // Process info
       runningQueries: 5,
       longestQueryDuration: 45000,  // 45 seconds
       slowQueryCount: 2,
       
       // Connections
       connections: 45,
       maxConnections: 100,
       connectionUsage: 0.45,  // 45%
       
       // Performance
       questionsPerSec: 120,
       slowQueriesTotal: 250,
       
       // System
       uptime: 86400000,  // milliseconds
       
       // InnoDB
       activeTransactions: 3,
       locksWaiting: 1,
       
       status: 'healthy',  // 'healthy', 'warning', 'critical'
     }
   }
   ```

3. Store in History Manager for later access

**Query Examples:**
```sql
-- Running queries
SELECT * FROM INFORMATION_SCHEMA.PROCESSLIST WHERE COMMAND != 'Sleep';

-- Slow queries
SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;

-- Connection info
SHOW STATUS WHERE variable_name IN ('Threads_connected', 'Max_used_connections');

-- InnoDB locks
SELECT * FROM INFORMATION_SCHEMA.INNODB_LOCKS;
```

---

### 3. Alert Detector (`services/alert-detector.js`)

**Purpose:** Compare metrics against thresholds and trigger alerts

**Default Thresholds (Configurable):**
```javascript
{
  queryDuration: 30000,        // Alert if query > 30 seconds
  cpuUsage: 80,                // Alert if CPU > 80%
  memoryUsage: 85,             // Alert if memory > 85%
  lockWaitTime: 10000,         // Alert if lock wait > 10 sec
  connectionLimit: 0.8,        // Alert at 80% of max connections
  slowQueryThreshold: 10       // Alert if > 10 slow queries
}
```

**Alert Types:**
- `LONG_QUERY` - Single query running > 30s
- `HIGH_MEMORY` - Memory usage > 85%
- `HIGH_CPU` - CPU usage > 80%
- `LOCK_DETECTED` - InnoDB lock or deadlock detected
- `CONNECTION_LIMIT` - Connections > 80% of max
- `SLOW_QUERY_COUNT` - Multiple slow queries detected

**Alert Escalation:**
```
Detected → History (file) → Telegram (immediate notification)
                                      ↓
                              Format message with:
                              • Severity level
                              • Affected instance
                              • Recommended action
```

---

### 4. History Manager (`services/history-manager.js`)

**Purpose:** Store metrics history and manage 7-day rolling window

**Storage Strategy:**
- In-memory cache: Latest 1 hour of metrics
- File storage: Daily JSON files
- Location: `./history/metrics-YYYY-MM-DD.json`

**File Format:**
```json
{
  "date": "2026-02-08",
  "entries": [
    {
      "timestamp": 1707384000000,
      "instance": "docker",
      "metrics": { ... }
    },
    ...
  ]
}
```

**Cleanup Logic:**
- Daily cron job: 2:00 AM
- Delete files older than 7 days
- Keep today + 6 previous days

**Query Interface:**
```javascript
// Get metrics for last hour
getRecentMetrics(instance, minutes = 60)

// Get metrics for specific date range
getMetricsRange(instance, startDate, endDate)

// Get alerts in last 24 hours
getRecentAlerts(instance, hours = 24)
```

---

### 5. Telegram Bot (`telegram/`)

**Bot Commands:**

| Command | Description | Response |
|---------|-------------|----------|
| `/status` | Current metrics of all 3 instances | Table with all metrics |
| `/slowqueries` | Top slow queries in last hour | List of slow queries |
| `/alerts` | Recent alerts | Alert log |
| `/instances` | Instance connectivity status | Health check per instance |
| `/help` | Available commands | Command list |
| `/history [instance] [hours]` | Historical metrics | Graph or list data |

**Authentication:**
- User ID whitelist: `ALLOWED_USER_IDS=123,456,789`
- Optional password: `TELEGRAM_PASSWORD=secret123`
- First message: Must authenticate or denied

**Session Management:**
```javascript
// After authentication
authenticatedUsers = {
  123: { timestamp: Date.now(), authorized: true }
}

// Verify on each message
if (!isAuthorized(userId)) {
  return sendUnauthorizedMessage();
}
```

---

### 6. Main Orchestration (`index.js`)

**Startup Sequence:**
1. Load environment variables
2. Initialize MySQL connections
3. Verify all 3 instances are reachable
4. Start Telegram bot
5. Start monitoring loop (every 30s)
6. Setup cron jobs (cleanup at 2 AM daily)
7. Log "System ready"

**Graceful Shutdown:**
```
SIGTERM/SIGINT received
  ↓
Stop new metrics collection
  ↓
Close all MySQL connections
  ↓
Stop Telegram bot
  ↓
Save pending metrics to history
  ↓
Exit with code 0
```

---

## Data Flow Examples

### Example 1: User Requests Status
```
User: /status
  ↓
Telegram Bot receives message
  ↓
Auth.js validates user
  ↓
Handlers.js routes to statusHandler
  ↓
statusHandler queries Metrics Collector
  ↓
Get latest metrics from History Manager
  ↓
Format message with emojis (📊, 🔴, ⏱️, etc)
  ↓
Send to user via Telegram
```

### Example 2: Query Becomes Slow
```
Metrics Collector: Running query for 45 seconds
  ↓
Alert Detector: 45s > 30s threshold?
  ↓
YES → Create LONG_QUERY alert
  ↓
Save to History Manager
  ↓
Send notification to Telegram:
"⚠️ LONG QUERY on [docker]
  Duration: 45 seconds
  Database: myapp
  User: app_user"
  ↓
User can run /slowqueries to get details
```

---

## Environment & Configuration

**.env format:**
```bash
# MySQL Instances
MYSQL_LOCAL_HOST=localhost
MYSQL_LOCAL_PORT=3306
MYSQL_LOCAL_USER=monitor
MYSQL_LOCAL_PASSWORD=pass123

MYSQL_DOCKER_HOST=mysql-container
MYSQL_DOCKER_PORT=3306
MYSQL_DOCKER_USER=root
MYSQL_DOCKER_PASSWORD=docker123

MYSQL_AWS_HOST=db.xxx.us-east-1.rds.amazonaws.com
MYSQL_AWS_PORT=3306
MYSQL_AWS_USER=admin
MYSQL_AWS_PASSWORD=aws123

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_PASSWORD=optional_password

# Monitoring
METRICS_INTERVAL=30000  # 30 seconds
HISTORY_DAYS=7
CLEANUP_HOUR=2         # 2 AM daily

# Logging
LOG_LEVEL=info
```

---

## Error Handling Strategy

### Connection Errors
```javascript
try {
  connection.query(...)
} catch (err) {
  if (err.code === 'PROTOCOL_ERROR') {
    logger.error('Connection lost, reconnecting...');
    await connection.close();
    await connection.connect();  // Retry
  } else if (err.code === 'QUERY_TIMEOUT') {
    logger.warn('Query timeout, continuing...');
    // Don't reconnect, just log
  }
}
```

### Telegram Errors
```javascript
bot.on('error', (err) => {
  logger.error('Telegram error:', err);
  // Don't crash, continue monitoring
  // Retry send in next cycle
});
```

### Recovery Strategy
- Connection failures: Exponential backoff (1s, 2s, 4s, 8s, 30s)
- Query failures: Log and skip, try next cycle
- Bot failures: Log and restart connection
- Never crash entire process

---

## Performance Considerations

- **Metrics collection:** Runs every 30s (configurable)
- **Query efficiency:** All queries use indexes, max results limited
- **Memory:** In-memory cache for 1 hour only
- **File I/O:** Daily file writes (not per metric)
- **Telegram API:** Rate-limited, batch alerts when possible

---

**Last Updated:** February 8, 2026
