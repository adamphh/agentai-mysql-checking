# MySQL Telegram Monitor Bot

Realtime monitoring chatbot for MySQL instances with Telegram integration. Monitor 3 MySQL instances (Local, Docker, AWS RDS), detect slow queries, resource bottlenecks, and receive instant alerts via Telegram.

## Features

✅ **Real-time Monitoring** of 3 MySQL instances  
✅ **Slow Query Detection** - Identify queries > 30 seconds  
✅ **Resource Monitoring** - Track CPU, memory, connections  
✅ **Telegram 2-way Chat** - Interactive commands via Telegram  
✅ **Smart Alerts** - Instant notifications with recommended actions  
✅ **7-day History** - Automatic cleanup, file-based storage  
✅ **User Authentication** - Whitelist + optional password  
✅ **Linux Deployment** - Systemd service, PM2 compatible  

## Quick Start

### 1. Prerequisites

- Node.js 16+ (v18 LTS recommended)
- npm 8+
- 3 MySQL 8.x instances accessible
- Telegram bot token (create via @BotFather)
- Your Telegram user ID (get from @userinfobot)

### 2. Installation

```bash
# Clone or initialize project
git clone <repo-url>
cd mysql-telegram-monitor

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials and Telegram token
nano .env
```

### 3. Start Monitoring

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 4. Test in Telegram

Send to your bot:
```
/start
/status
/slowqueries
/help
```

## Documentation

| Document | Purpose |
|----------|---------|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | AI agent instructions - architecture, patterns, conventions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data flows, error handling |
| [SETUP.md](SETUP.md) | Installation, configuration, deployment guides |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Code patterns, examples, troubleshooting |

## Project Structure

```
mysql-telegram-monitor/
├── src/
│   ├── config/
│   │   ├── config.js              # Environment & global config
│   │   └── mysql-connections.js   # 3 connection managers
│   ├── services/
│   │   ├── mysql-monitor.js       # Connection health
│   │   ├── metrics-collector.js   # Query metrics collection
│   │   ├── alert-detector.js      # Threshold checking
│   │   └── history-manager.js     # 7-day file storage
│   ├── telegram/
│   │   ├── bot.js                 # Telegram bot init
│   │   ├── handlers.js            # Command handlers
│   │   ├── auth.js                # User authentication
│   │   └── commands.js            # Command definitions
│   ├── utils/
│   │   ├── logger.js              # Winston logging
│   │   └── helpers.js             # Utility functions
│   └── index.js                   # Main entry point
├── history/                       # 7-day rolling history (auto-generated)
├── logs/                          # Application logs (auto-generated)
├── .env.example                   # Configuration template
├── package.json
├── ARCHITECTURE.md                # System design
├── SETUP.md                       # Deployment guide
├── IMPLEMENTATION.md              # Code patterns
└── README.md                      # This file
```

## Key Concepts

### Monitoring Loop
Every 30 seconds (configurable):
1. **Collect** metrics from all 3 instances (SHOW PROCESSLIST, variables, etc)
2. **Detect** alerts by comparing against thresholds
3. **Store** metrics to history (JSON files, 7-day rolling)
4. **Notify** via Telegram if alerts triggered

### Alert Types
- **LONG_QUERY** - Single query > 30 seconds
- **HIGH_CONNECTIONS** - Connection usage > 80%
- **SLOW_QUERY_BURST** - Multiple slow queries detected
- **LOCK_DETECTED** - InnoDB locks or deadlocks
- **CONNECTION_ERROR** - Instance unreachable

### Metrics Tracked
Per instance:
- Running queries count
- Longest query duration
- Slow queries count (> 5 seconds)
- Active connections / max connections
- Uptime
- Query per second (QPS)
- InnoDB transactions & locks

### Telegram Commands

```
/start          - Welcome & setup
/status         - 📊 All metrics (all instances)
/slowqueries    - ⏱️ Top slow queries
/alerts         - 🚨 Recent alerts
/instances      - 🔌 Instance connectivity
/history docker 24    - 📈 Historical data (24 hours)
/help           - Command list
```

## Configuration

### Environment Variables (.env)

```bash
# MySQL 3 Instances
MYSQL_LOCAL_HOST=localhost
MYSQL_LOCAL_PORT=3306
MYSQL_LOCAL_USER=monitor
MYSQL_LOCAL_PASSWORD=***

MYSQL_DOCKER_HOST=mysql-container
MYSQL_DOCKER_PORT=3306
MYSQL_DOCKER_USER=root
MYSQL_DOCKER_PASSWORD=***

MYSQL_AWS_HOST=db.xxx.rds.amazonaws.com
MYSQL_AWS_PORT=3306
MYSQL_AWS_USER=admin
MYSQL_AWS_PASSWORD=***

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_PASSWORD=optional_password

# Monitoring
METRICS_INTERVAL=30000   # 30 seconds
MONITORING_TIMEOUT=10000
HISTORY_DAYS=7
CLEANUP_HOUR=2           # 2 AM daily cleanup

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
NODE_ENV=production
```

## Available Commands

### Development
```bash
npm run dev              # Development with auto-reload
npm start               # Production mode
npm run test            # Run tests
npm run lint            # ESLint check
npm run logs            # View realtime logs
npm run cleanup         # Manual history cleanup
```

### Deployment
```bash
# Linux with Systemd
sudo systemctl start mysql-monitor
sudo systemctl status mysql-monitor
sudo journalctl -u mysql-monitor -f

# Or with PM2
pm2 start npm --name "mysql-monitor" -- start
pm2 logs mysql-monitor
pm2 restart mysql-monitor
```

## Alert Thresholds

Default thresholds (configurable in `alert-detector.js`):

| Alert | Threshold | Example |
|-------|-----------|---------|
| Long Query | > 30 seconds | Query running for 45 seconds |
| High Connections | > 80% of max | 80 / 100 connections |
| Slow Query Burst | > 10 queries | 15 queries > 5 seconds |
| Lock Wait | > 10 seconds | InnoDB lock detected |
| Memory Usage | > 85% | RAM usage high |

## MySQL Setup

### Create Monitor User (Recommended)

```sql
-- On each MySQL instance
CREATE USER 'monitor'@'%' IDENTIFIED BY 'secure_password';

-- Grant minimal required privileges
GRANT SELECT ON *.* TO 'monitor'@'%';
GRANT PROCESS ON *.* TO 'monitor'@'%';
GRANT REPLICATION CLIENT ON *.* TO 'monitor'@'%';

FLUSH PRIVILEGES;
```

**Privileges:**
- `SELECT` - Read information_schema
- `PROCESS` - View PROCESSLIST (running queries)
- `REPLICATION CLIENT` - View replication status

## History Storage

Metrics stored as JSON files, 7-day rolling window:

```
history/
├── metrics-2026-02-08.json   # Today's metrics
├── metrics-2026-02-07.json   # Yesterday
└── ... (up to 7 days)
```

**File Format:**
```json
{
  "date": "2026-02-08",
  "entries": [
    {
      "timestamp": 1707384000000,
      "instance": "docker",
      "metrics": {
        "runningQueries": 5,
        "connections": 45,
        ...
      }
    }
  ]
}
```

**Auto-cleanup:** Daily at 2 AM (removes files > 7 days old)

## Deployment to Linux

### Option 1: Systemd Service (Recommended)

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Create app directory
sudo mkdir -p /opt/mysql-monitor
sudo useradd -m mysql-monitor
sudo chown mysql-monitor:mysql-monitor /opt/mysql-monitor

# 3. Deploy code
cd /opt/mysql-monitor
git clone <repo-url> .
npm install --production

# 4. Configure
cp .env.example .env
nano .env  # Fill credentials

# 5. Create systemd service
sudo nano /etc/systemd/system/mysql-monitor.service

# [Content from SETUP.md]

# 6. Enable & start
sudo systemctl daemon-reload
sudo systemctl enable mysql-monitor
sudo systemctl start mysql-monitor

# 7. Check status
sudo systemctl status mysql-monitor
sudo journalctl -u mysql-monitor -f
```

### Option 2: PM2

```bash
sudo npm install -g pm2

cd /opt/mysql-monitor
pm2 start npm --name "mysql-monitor" -- start
pm2 startup
pm2 save

pm2 logs mysql-monitor
```

## Troubleshooting

### Cannot connect to MySQL
```bash
# Test connection
mysql -h localhost -u monitor -p

# Check .env credentials
cat .env | grep MYSQL_LOCAL

# View logs
npm run logs
```

### Telegram bot not responding
```bash
# Verify token
curl -s https://api.telegram.org/bot<TOKEN>/getMe

# Check user ID in whitelist
grep ALLOWED_USER_IDS .env

# Restart bot
npm run dev
```

### High memory usage
```bash
# Check history file size
du -sh history/

# Manual cleanup
rm history/metrics-*.json

# Or adjust interval
METRICS_INTERVAL=60000  # 60 seconds
```

## Performance Notes

- **Monitoring interval:** 30 seconds (configurable)
- **History retention:** 7 days rolling window
- **Memory usage:** In-memory cache for 1 hour only
- **File I/O:** Daily writes only (not per metric)
- **Telegram API:** Respects rate limiting, batches alerts

## Monitoring Best Practices

1. **Set appropriate thresholds** for your workload
2. **Monitor closely first week** - adjust thresholds as needed
3. **Review logs daily** - check for connection issues
4. **Keep history files** - useful for trend analysis
5. **Test alerts** - verify Telegram notifications work

## Security

- ✅ User ID whitelist required
- ✅ Optional password for sensitive commands
- ✅ No credentials in logs
- ✅ Limited MySQL user privileges
- ✅ Environment variables only (no hardcoded secrets)

## Contributing

To add new features:

1. See [ARCHITECTURE.md](ARCHITECTURE.md) for system design
2. Follow patterns in [IMPLEMENTATION.md](IMPLEMENTATION.md)
3. Use conventions from [.github/copilot-instructions.md](.github/copilot-instructions.md)
4. Test with: `npm run test`
5. Lint with: `npm run lint`

## License

[Your License Here]

## Support

For issues or questions:
1. Check [TROUBLESHOOTING section](#troubleshooting)
2. Review [SETUP.md](SETUP.md) for configuration help
3. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for code examples
4. Contact your team lead or admin

---

**Last Updated:** February 8, 2026  
**Status:** Ready for development  
**Version:** 1.0.0

For detailed architecture: [ARCHITECTURE.md](ARCHITECTURE.md)  
For setup instructions: [SETUP.md](SETUP.md)  
For code examples: [IMPLEMENTATION.md](IMPLEMENTATION.md)  
For AI agent instructions: [.github/copilot-instructions.md](.github/copilot-instructions.md)
