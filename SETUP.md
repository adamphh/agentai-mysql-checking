# Setup & Deployment Guide

## Prerequisites

### System Requirements
- **Node.js:** v16+ (recommend v18 LTS)
- **npm:** v8+
- **Operating System:** Linux (production) / Windows or macOS (development)
- **Network:** Access to all 3 MySQL instances + Telegram API

### MySQL Instances Configuration

Bạn cần chuẩn bị 3 instances MySQL 8.x:

1. **Local Instance**
   - Host: localhost
   - Port: 3306 (default)
   - User: monitor account (minimal privileges)

2. **Docker Instance**
   - Host: mysql-container or docker IP
   - Port: 3306
   - User: root or monitor account

3. **AWS RDS Instance**
   - Host: *.rds.amazonaws.com
   - Port: 3306 (default)
   - User: admin or dedicated monitor account

### Create Monitor User (Optional but Recommended)

Trên mỗi MySQL instance, tạo user chỉ để monitoring:

```sql
-- Create monitor user (local instance)
CREATE USER 'monitor'@'localhost' IDENTIFIED BY 'monitor_password_123';

-- Grant minimal required privileges
GRANT SELECT ON *.* TO 'monitor'@'localhost';
GRANT PROCESS ON *.* TO 'monitor'@'localhost';
GRANT REPLICATION CLIENT ON *.* TO 'monitor'@'localhost';

FLUSH PRIVILEGES;
```

**Privileges Giải thích:**
- `SELECT` - Read metrics from information_schema
- `PROCESS` - View PROCESSLIST (running queries)
- `REPLICATION CLIENT` - View replication status

---

## Installation Steps

### Step 1: Clone/Initialize Project

```bash
# Create project directory
mkdir mysql-telegram-monitor
cd mysql-telegram-monitor

# Initialize npm project
npm init -y

# Or clone nếu từ git repo
git clone <repo-url>
cd mysql-telegram-monitor
```

### Step 2: Install Dependencies

```bash
npm install
```

**Dependencies sẽ cài:**
```json
{
  "mysql2": "^3.x",          // MySQL driver
  "telegraf": "^4.x",        // Telegram bot
  "dotenv": "^16.x",         // Environment variables
  "node-cron": "^3.x",       // Scheduled tasks
  "winston": "^3.x",         // Logging
  "moment": "^2.x",          // Date manipulation
  "express": "^4.x"          // (Optional) untuk future dashboard
}
```

### Step 3: Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your credentials
nano .env
```

**Fill .env file:**
```bash
# MySQL Local
MYSQL_LOCAL_HOST=localhost
MYSQL_LOCAL_PORT=3306
MYSQL_LOCAL_USER=monitor
MYSQL_LOCAL_PASSWORD=monitor_pass_123
MYSQL_LOCAL_DATABASE=mysql

# MySQL Docker
MYSQL_DOCKER_HOST=mysql-container
MYSQL_DOCKER_PORT=3306
MYSQL_DOCKER_USER=root
MYSQL_DOCKER_PASSWORD=docker_root_pass
MYSQL_DOCKER_DATABASE=mysql

# MySQL AWS RDS
MYSQL_AWS_HOST=db-prod.c9akciq32.us-east-1.rds.amazonaws.com
MYSQL_AWS_PORT=3306
MYSQL_AWS_USER=admin
MYSQL_AWS_PASSWORD=aws_password_secure
MYSQL_AWS_DATABASE=mysql

# Telegram Bot
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
ALLOWED_USER_IDS=123456789,987654321,111111111
TELEGRAM_PASSWORD=optional_password_for_sensitive_commands

# Monitoring Settings
METRICS_INTERVAL=30000        # 30 seconds - how often to collect metrics
MONITORING_TIMEOUT=10000      # 10 seconds - query timeout
HISTORY_DAYS=7                # Keep 7 days of history
CLEANUP_HOUR=2                # Daily cleanup at 2 AM

# Logging
LOG_LEVEL=info               # info, warn, error, debug
LOG_FILE=./logs/app.log

# Environment
NODE_ENV=production          # production or development
```

### Step 4: Get Telegram Bot Token

1. Open Telegram app
2. Search for `@BotFather`
3. Send `/start` then `/newbot`
4. Fill bot name: `MySQL Monitor Bot`
5. Fill bot username: `mysql_monitor_bot_yourusername`
6. Copy token and paste vào `.env` TELEGRAM_BOT_TOKEN

**Example token:** `1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh`

### Step 5: Get Your Telegram User ID

1. Open Telegram app
2. Search for `@userinfobot`
3. Send `/start`
4. It will show your user ID
5. Add to `.env` ALLOWED_USER_IDS

---

## Development Setup

### Option A: Direct Node.js

```bash
# Install dev dependencies
npm install --save-dev nodemon eslint

# Run development mode (auto-restart on file changes)
npm run dev

# Check logs
tail -f ./logs/app.log
```

### Option B: Docker Development

```bash
# Create docker-compose.yml (see section below)

# Start MySQL services
docker-compose up -d

# Run bot
npm run dev
```

**docker-compose.yml example:**
```yaml
version: '3.8'

services:
  mysql-local:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: test_db
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  mysql-docker-test:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: docker_root_pass
      MYSQL_DATABASE: test_db
    ports:
      - "3307:3306"

volumes:
  mysql_data:
```

```bash
# Start Docker services
docker-compose up -d

# Verify containers running
docker-compose ps

# View logs
docker-compose logs -f mysql-local
```

### Option C: PM2 for Process Management (Development)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start npm --name "mysql-monitor" -- start

# View logs
pm2 logs mysql-monitor

# Monitor
pm2 monit

# Stop
pm2 stop mysql-monitor

# Restart
pm2 restart mysql-monitor
```

---

## Production Deployment (Linux)

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs npm

# Verify installation
node --version
npm --version
```

### Step 2: Create App User

```bash
# Create dedicated user
sudo useradd -m -s /bin/bash mysql-monitor

# Create app directory
sudo mkdir -p /opt/mysql-monitor
sudo chown mysql-monitor:mysql-monitor /opt/mysql-monitor
```

### Step 3: Deploy Code

```bash
# Switch to app user
sudo -u mysql-monitor bash

# Navigate to app dir
cd /opt/mysql-monitor

# Clone repo (or upload files)
git clone <repo-url> .

# Install dependencies
npm install --production

# Copy .env (configure it first!)
cp .env.example .env
nano .env  # Fill credentials

# Create directories
mkdir -p logs history
```

### Step 4: Setup Systemd Service

Create `/etc/systemd/system/mysql-monitor.service`:

```ini
[Unit]
Description=MySQL Telegram Monitor
After=network.target

[Service]
Type=simple
User=mysql-monitor
WorkingDirectory=/opt/mysql-monitor
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

**Enable & start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable mysql-monitor
sudo systemctl start mysql-monitor

# Check status
sudo systemctl status mysql-monitor

# View logs
sudo journalctl -u mysql-monitor -f

# Stop
sudo systemctl stop mysql-monitor
```

### Step 5: Log Rotation (Logrotate)

Create `/etc/logrotate.d/mysql-monitor`:

```
/opt/mysql-monitor/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 mysql-monitor mysql-monitor
    sharedscripts
    postrotate
        systemctl reload mysql-monitor > /dev/null 2>&1 || true
    endscript
}
```

### Step 6: Monitoring with PM2 (Alternative to Systemd)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start app with PM2
sudo -u mysql-monitor pm2 start npm --name "mysql-monitor" -- start --cwd /opt/mysql-monitor

# Setup PM2 startup
pm2 startup
pm2 save

# View logs
pm2 logs mysql-monitor
```

---

## Verification & Testing

### Test 1: MySQL Connections

```bash
npm run test:connections
# Should show:
# ✓ Local instance: Connected
# ✓ Docker instance: Connected  
# ✓ AWS instance: Connected
```

### Test 2: Telegram Bot

```bash
# Open Telegram and send to your bot:
/start
# Response: "Welcome! Use /help for available commands"

/help
# Should show command list
```

### Test 3: Metrics Collection

```bash
npm run test:metrics
# Should show:
# Instance: local - 5 running queries, 45 connections
# Instance: docker - 2 running queries, 32 connections
# Instance: aws - 8 running queries, 78 connections
```

### Test 4: Telegram Commands

```
/status        → See all metrics
/slowqueries   → See slow queries
/alerts        → See recent alerts
/instances     → See connection status
/history docker 24  → See 24-hour history for docker instance
```

---

## Troubleshooting

### Issue: Cannot connect to MySQL

```bash
# Check MySQL is running
telnet localhost 3306

# Verify credentials in .env
mysql -h localhost -u monitor -p -e "SELECT 1"

# Check .env file
cat .env

# View logs
tail -f logs/app.log
```

### Issue: Telegram bot not responding

```bash
# Verify token is correct
TELEGRAM_BOT_TOKEN in .env

# Check if user ID in whitelist
echo $ALLOWED_USER_IDS

# Restart bot
npm run dev

# Check Telegram API is accessible
curl -s https://api.telegram.org/bot<TOKEN>/getMe
```

### Issue: High memory usage

```bash
# Check history files size
du -sh history/

# Clear old files manually
rm history/metrics-*.json

# Or check cleanup cron is running
crontab -l
```

### Issue: Connection pool exhausted

```bash
# Increase pool size in mysql-connections.js
connectionLimit: 20  // Increase from 10

# Or reduce monitoring interval
METRICS_INTERVAL=60000  // 60 seconds instead of 30
```

---

## Maintenance

### Weekly Tasks
- Check logs for errors: `tail -100 logs/app.log`
- Verify all 3 MySQL instances responding: `/status` command
- Review alert history: `/alerts` command

### Monthly Tasks
- Update dependencies: `npm update`
- Review and adjust alert thresholds if needed
- Backup configuration: `cp .env .env.backup`

### Monitor Service Health

```bash
# View current status
sudo systemctl status mysql-monitor

# View recent logs
sudo journalctl -u mysql-monitor -n 50

# Check for errors
sudo journalctl -u mysql-monitor | grep ERROR
```

---

**Last Updated:** February 8, 2026
