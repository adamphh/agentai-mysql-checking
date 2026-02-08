# AI Coding Instructions - MySQL Telegram Monitor Bot

## Project Overview

**MySQL Telegram Monitoring Chatbot** - Realtime monitoring system cho 3 MySQL instances (Docker, AWS Cloud, Local) với Telegram notification và interactive 2-way chat.

**Key Features:**
- Realtime monitoring của 3 MySQL instances
- Phát hiện query nặng, tốn tài nguyên, chạy chậm
- Telegram bot 2 chiều với authentication
- Lưu lịch sử metrics 7 ngày (auto cleanup)
- Alert notifications + interactive queries

**Stack:** Node.js, MySQL 8.x, Telegram Bot API, Docker, Linux deployment

---

## Architecture & Components

### Directory Structure
```
src/
├── config/              # Configuration management
│   ├── config.js        # Environment & global config
│   └── mysql-connections.js  # 3 MySQL connection managers
├── services/            # Core business logic
│   ├── mysql-monitor.js      # Connection health & stats
│   ├── metrics-collector.js  # Query metrics & performance data
│   ├── alert-detector.js     # Thresholds & alert logic
│   └── history-manager.js    # 7-day history + cleanup
├── telegram/            # Telegram bot integration
│   ├── bot.js           # Bot initialization & setup
│   ├── handlers.js      # Command handlers (status, queries, alerts)
│   ├── auth.js          # User authentication & authorization
│   └── commands.js      # Command definitions
├── utils/
│   ├── logger.js        # Logging system
│   └── helpers.js       # Utility functions
└── index.js             # Entry point
```

### Major Components

1. **MySQL Connection Manager** (`config/mysql-connections.js`)
   - 3 connections: local, docker, AWS
   - Connection pooling & health checks
   - Auto-reconnect logic

2. **Metrics Collector** (`services/metrics-collector.js`)
   - Query: SHOW PROCESSLIST (running queries)
   - Query: SHOW VARIABLES (CPU, memory limits)
   - Query: SELECT slow query log
   - Detect locks, deadlocks, connections

3. **Alert Detector** (`services/alert-detector.js`)
   - Long queries: > 30 seconds
   - High CPU: > 80%
   - Memory usage: > 85%
   - Lock wait time: > 10 seconds
   - Connection limit: > 80% of max

4. **History Manager** (`services/history-manager.js`)
   - In-memory + file storage (JSON)
   - Rolling 7-day window
   - Auto-cleanup via cron job

5. **Telegram Bot** (`telegram/`)
   - Authentication: User ID whitelist + optional password
   - Commands: `/status`, `/slowqueries`, `/alerts`, `/instances`, `/help`
   - Real-time metrics streaming
   - Interactive query troubleshooting

### Data Flow
```
[MySQL Instances] 
    ↓ (SHOW PROCESSLIST, VARIABLES, etc)
[Metrics Collector] 
    ↓
[Alert Detector] → [History Manager]
    ↓ (if alert threshold)
[Telegram Bot] → [User]
    ↓ (user request)
[Command Handlers] → [Query Services]
```

---

## Development Workflows

### Setup & Installation
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit: TELEGRAM_BOT_TOKEN, ALLOWED_USERS, MYSQL_* credentials

# 3. For Docker development
docker-compose up -d

# 4. Start monitoring
npm run dev    # Development with nodemon
npm start      # Production
```

### Build & Run Commands
```bash
npm run dev          # Watch mode (development)
npm start            # Start production
npm run test         # Unit tests
npm run lint         # ESLint check
npm run logs         # View realtime logs
npm run cleanup      # Manual history cleanup
```

### Critical Workflows

1. **Adding New Metric Type**
   - Add query in `metrics-collector.js`
   - Define threshold in `alert-detector.js`
   - Add Telegram command handler
   - Update history schema

2. **Authentication Flow**
   - User → Telegram message
   - `telegram/auth.js` validates user ID
   - Optional password check for sensitive commands
   - Store authenticated session

3. **Monitoring Loop**
   - Every 30 seconds: `metrics-collector.js` queries all 3 instances
   - Results compared with thresholds in `alert-detector.js`
   - Alerts → History + Telegram notification
   - History cleanup: daily at 2 AM (remove entries > 7 days)

---

## Conventions & Patterns

### Code Style
- **Async/await** preferred over callbacks
- **Error handling:** Try-catch + logger (no silent fails)
- **Connection management:** Always use pools, handle connection errors
- **Naming:**
  - Instances: `local`, `docker`, `aws` (constants)
  - Metrics: camelCase (e.g., `runningQueries`, `maxConnections`)
  - Commands: /lowercase (e.g., `/slowqueries`)

### Common Patterns

1. **MySQL Queries**
   ```javascript
   // Always use parameterized queries
   const result = await connection.query('SELECT * FROM INFORMATION_SCHEMA.PROCESSLIST WHERE TIME > ?', [threshold]);
   // Handle connection errors gracefully
   ```

2. **Metrics Structure** (stored + sent via Telegram)
   ```javascript
   {
     timestamp: Date.now(),
     instance: 'docker',  // or 'local', 'aws'
     metrics: {
       runningQueries: 5,
       slowQueryCount: 2,
       connections: 45,
       maxConnections: 100,
       uptime: 86400,
       activeAlerts: ['long_query', 'high_memory']
     }
   }
   ```

3. **Alert Thresholds** (configurable)
   ```javascript
   const THRESHOLDS = {
     queryDuration: 30000,     // 30 seconds
     cpuUsage: 80,             // %
     memoryUsage: 85,          // %
     lockWaitTime: 10000,      // 10 seconds
     connectionLimit: 0.8      // 80% of max
   };
   ```

4. **Telegram Response Pattern**
   ```javascript
   // Always format metrics in readable Telegram message
   const message = `
   📊 **Instance: ${instance}**
   🔴 Running Queries: ${metrics.runningQueries}
   ⏱️ Slow Queries: ${metrics.slowQueryCount}
   🔗 Connections: ${metrics.connections}/${metrics.maxConnections}
   `;
   ```

### Error Handling Approach
- Connection errors: Log + retry with exponential backoff
- Invalid commands: Send help message
- Unauthorized access: Log attempt, deny silently
- Query errors: Classify (timeout, permission, syntax) + alert admin

---

## Integration Points

### External Dependencies
- **mysql2/promise** - MySQL async driver
- **telegraf** - Telegram Bot API wrapper
- **dotenv** - Environment variables
- **node-cron** - Scheduled tasks (cleanup, monitoring)
- **winston** - Logging

### MySQL Connections Configuration
```javascript
// .env format
MYSQL_LOCAL_HOST=localhost
MYSQL_LOCAL_PORT=3306
MYSQL_LOCAL_USER=monitor
MYSQL_LOCAL_PASSWORD=***

MYSQL_DOCKER_HOST=mysql-container
MYSQL_DOCKER_PORT=3306

MYSQL_AWS_HOST=*.rds.amazonaws.com
MYSQL_AWS_PORT=3306

// Telegram
TELEGRAM_BOT_TOKEN=***
ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_PASSWORD=*** (optional)
```

### Database Schema (Not Required - Metrics in File)
History stored as JSON file with auto-rotation:
```
history/
├── metrics-2026-02-08.json
├── metrics-2026-02-07.json
└── ... (up to 7 days)
```

---

## Quick Start for New Contributors

1. **Clone & setup**
   ```bash
   npm install
   cp .env.example .env
   ```

2. **Configure MySQL connections** - Edit `.env` with 3 instances
   
3. **Setup Telegram bot** - Create bot via @BotFather, add token to `.env`

4. **Start development**
   ```bash
   npm run dev
   ```

5. **Test monitoring** - Send `/status` to bot, verify all 3 instances respond

6. **Deploy to Linux**
   ```bash
   npm install --production
   pm2 start npm --name "mysql-monitor" -- start
   ```

---

## Key Files to Implement (For Copilot)

**Priority Order:**
1. `config/mysql-connections.js` - 3 connection managers
2. `services/metrics-collector.js` - Query execution & data collection
3. `services/alert-detector.js` - Threshold logic
4. `telegram/bot.js` + `telegram/handlers.js` - Bot commands
5. `services/history-manager.js` - File-based storage & cleanup
6. `index.js` - Main orchestration

---

**Last Updated:** February 8, 2026
**Status:** Ready for implementation
