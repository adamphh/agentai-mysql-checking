# Implementation Guide - Key Patterns & Examples

This document provides concrete code examples for common implementation scenarios.

---

## 1. MySQL Connection Pattern

### File: `src/config/mysql-connections.js`

```javascript
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Connection configurations
const connections = {
  local: {
    host: process.env.MYSQL_LOCAL_HOST,
    port: process.env.MYSQL_LOCAL_PORT,
    user: process.env.MYSQL_LOCAL_USER,
    password: process.env.MYSQL_LOCAL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
  docker: {
    host: process.env.MYSQL_DOCKER_HOST,
    port: process.env.MYSQL_DOCKER_PORT,
    user: process.env.MYSQL_DOCKER_USER,
    password: process.env.MYSQL_DOCKER_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
  aws: {
    host: process.env.MYSQL_AWS_HOST,
    port: process.env.MYSQL_AWS_PORT,
    user: process.env.MYSQL_AWS_USER,
    password: process.env.MYSQL_AWS_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
};

const pools = {};

// Initialize connections
async function initConnections() {
  for (const [instance, config] of Object.entries(connections)) {
    try {
      pools[instance] = mysql.createPool(config);
      
      // Test connection
      const connection = await pools[instance].getConnection();
      await connection.ping();
      connection.release();
      
      logger.info(`✓ Connected to ${instance} instance`);
    } catch (err) {
      logger.error(`✗ Failed to connect to ${instance}:`, err.message);
      // Don't crash, retry on next cycle
    }
  }
}

// Execute query on specific instance
async function query(instance, sql, values = []) {
  try {
    const pool = pools[instance];
    if (!pool) {
      throw new Error(`Instance ${instance} not initialized`);
    }
    
    const [rows, fields] = await pool.execute(sql, values);
    return rows;
  } catch (err) {
    logger.error(`Query failed on ${instance}:`, err.message);
    throw err;
  }
}

// Get connection status
function getStatus() {
  return {
    local: pools.local ? 'connected' : 'disconnected',
    docker: pools.docker ? 'connected' : 'disconnected',
    aws: pools.aws ? 'connected' : 'disconnected',
  };
}

// Close all connections
async function closeAll() {
  for (const [instance, pool] of Object.entries(pools)) {
    if (pool) {
      await pool.end();
      logger.info(`Closed ${instance} connection`);
    }
  }
}

module.exports = {
  initConnections,
  query,
  getStatus,
  closeAll,
};
```

---

## 2. Metrics Collector Pattern

### File: `src/services/metrics-collector.js`

```javascript
const connections = require('../config/mysql-connections');
const logger = require('../utils/logger');

const INSTANCES = ['local', 'docker', 'aws'];
const SLOW_QUERY_THRESHOLD = 5; // seconds

async function collectMetrics() {
  const allMetrics = [];
  
  for (const instance of INSTANCES) {
    try {
      const metrics = await getInstanceMetrics(instance);
      allMetrics.push(metrics);
    } catch (err) {
      logger.error(`Failed to collect metrics for ${instance}:`, err.message);
    }
  }
  
  return allMetrics;
}

async function getInstanceMetrics(instance) {
  const metrics = {
    timestamp: Date.now(),
    instance,
    metrics: {},
    status: 'healthy',
  };
  
  try {
    // Get running queries
    const processlist = await connections.query(instance, 
      `SELECT * FROM INFORMATION_SCHEMA.PROCESSLIST 
       WHERE COMMAND != 'Sleep'`
    );
    
    metrics.metrics.runningQueries = processlist.length;
    metrics.metrics.longestQueryDuration = processlist.length > 0 
      ? Math.max(...processlist.map(p => p.TIME * 1000))
      : 0;
    
    // Get slow queries
    const slowQueries = processlist.filter(p => p.TIME > SLOW_QUERY_THRESHOLD);
    metrics.metrics.slowQueryCount = slowQueries.length;
    
    // Get connection info
    const vars = await connections.query(instance,
      `SHOW STATUS WHERE VARIABLE_NAME IN ('Threads_connected', 'Max_connections')`
    );
    
    const threadsConnected = vars.find(v => v.Variable_name === 'Threads_connected')?.Value || 0;
    const maxConnections = vars.find(v => v.Variable_name === 'Max_connections')?.Value || 100;
    
    metrics.metrics.connections = parseInt(threadsConnected);
    metrics.metrics.maxConnections = parseInt(maxConnections);
    metrics.metrics.connectionUsage = parseInt(threadsConnected) / parseInt(maxConnections);
    
    // Get uptime
    const uptime = await connections.query(instance,
      `SHOW STATUS WHERE VARIABLE_NAME = 'Uptime'`
    );
    metrics.metrics.uptime = parseInt(uptime[0]?.Value || 0) * 1000;
    
    // Determine status
    if (metrics.metrics.longestQueryDuration > 30000) {
      metrics.status = 'warning';
    }
    if (metrics.metrics.connectionUsage > 0.8) {
      metrics.status = 'warning';
    }
    
  } catch (err) {
    logger.error(`Error collecting metrics for ${instance}:`, err);
    metrics.status = 'error';
  }
  
  return metrics;
}

// Get slow queries details
async function getSlowQueries(instance) {
  try {
    const result = await connections.query(instance,
      `SELECT * FROM INFORMATION_SCHEMA.PROCESSLIST 
       WHERE TIME > 5 AND COMMAND != 'Sleep'
       ORDER BY TIME DESC`
    );
    
    return result.map(q => ({
      id: q.ID,
      user: q.USER,
      host: q.HOST,
      database: q.DB,
      command: q.COMMAND,
      duration: q.TIME,
      info: q.INFO?.substring(0, 100), // First 100 chars
    }));
  } catch (err) {
    logger.error('Failed to get slow queries:', err);
    return [];
  }
}

module.exports = {
  collectMetrics,
  getInstanceMetrics,
  getSlowQueries,
};
```

---

## 3. Alert Detector Pattern

### File: `src/services/alert-detector.js`

```javascript
const logger = require('../utils/logger');

const THRESHOLDS = {
  queryDuration: 30000,      // 30 seconds
  cpuUsage: 80,              // %
  memoryUsage: 85,           // %
  lockWaitTime: 10000,       // 10 seconds
  connectionLimit: 0.8,      // 80% of max
  slowQueryCount: 10,        // Alert if > 10
};

// Alert history to prevent duplicate alerts
const alertHistory = new Map();
const ALERT_DEBOUNCE = 5 * 60 * 1000; // 5 minutes

function detectAlerts(metricsArray) {
  const alerts = [];
  
  for (const metrics of metricsArray) {
    const instanceAlerts = checkMetricsAlerts(metrics);
    alerts.push(...instanceAlerts);
  }
  
  return alerts;
}

function checkMetricsAlerts(metrics) {
  const alerts = [];
  const { instance, metrics: m } = metrics;
  
  // Check long running query
  if (m.longestQueryDuration > THRESHOLDS.queryDuration) {
    const alert = createAlert(
      instance,
      'LONG_QUERY',
      `⏱️ Long query detected: ${Math.round(m.longestQueryDuration / 1000)}s`,
      {
        duration: m.longestQueryDuration,
        query_count: m.runningQueries,
      }
    );
    alerts.push(alert);
  }
  
  // Check connection limit
  if (m.connectionUsage > THRESHOLDS.connectionLimit) {
    const alert = createAlert(
      instance,
      'HIGH_CONNECTIONS',
      `🔗 High connection usage: ${Math.round(m.connectionUsage * 100)}%`,
      {
        current: m.connections,
        max: m.maxConnections,
      }
    );
    alerts.push(alert);
  }
  
  // Check slow query count
  if (m.slowQueryCount > THRESHOLDS.slowQueryCount) {
    const alert = createAlert(
      instance,
      'SLOW_QUERY_BURST',
      `⚠️ ${m.slowQueryCount} slow queries detected`,
      {
        count: m.slowQueryCount,
      }
    );
    alerts.push(alert);
  }
  
  return alerts;
}

function createAlert(instance, type, message, details = {}) {
  const alertKey = `${instance}:${type}`;
  
  // Check if we already sent this alert recently
  const lastAlert = alertHistory.get(alertKey);
  if (lastAlert && Date.now() - lastAlert < ALERT_DEBOUNCE) {
    return null; // Debounce alert
  }
  
  // Update history
  alertHistory.set(alertKey, Date.now());
  
  return {
    timestamp: Date.now(),
    instance,
    type,
    message,
    details,
    severity: getSeverity(type),
  };
}

function getSeverity(alertType) {
  const severityMap = {
    LONG_QUERY: 'warning',
    HIGH_CONNECTIONS: 'warning',
    SLOW_QUERY_BURST: 'info',
    DEADLOCK: 'critical',
    CONNECTION_ERROR: 'critical',
  };
  
  return severityMap[alertType] || 'info';
}

module.exports = {
  detectAlerts,
  THRESHOLDS,
};
```

---

## 4. History Manager Pattern

### File: `src/services/history-manager.js`

```javascript
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const HISTORY_DIR = path.join(__dirname, '../..', 'history');
const MAX_DAYS = 7;

async function initHistory() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    logger.info('History directory ready');
  } catch (err) {
    logger.error('Failed to create history directory:', err);
  }
}

async function saveMetrics(metricsArray) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filePath = path.join(HISTORY_DIR, `metrics-${today}.json`);
  
  try {
    // Read existing file or create empty
    let data = { date: today, entries: [] };
    try {
      const content = await fs.readFile(filePath, 'utf8');
      data = JSON.parse(content);
    } catch (err) {
      // File doesn't exist yet
    }
    
    // Add new metrics
    data.entries.push(...metricsArray);
    
    // Keep only last 1000 entries per file
    if (data.entries.length > 1000) {
      data.entries = data.entries.slice(-1000);
    }
    
    // Write file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error('Failed to save metrics:', err);
  }
}

async function getMetricsRange(instance, startDate, endDate) {
  const metrics = [];
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const filePath = path.join(HISTORY_DIR, `metrics-${dateStr}.json`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      const filtered = data.entries.filter(e => e.instance === instance);
      metrics.push(...filtered);
    } catch (err) {
      // File doesn't exist for this date
    }
  }
  
  return metrics;
}

async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const today = new Date();
    
    for (const file of files) {
      const match = file.match(/metrics-(\d{4}-\d{2}-\d{2})\.json/);
      if (!match) continue;
      
      const fileDate = new Date(match[1]);
      const daysOld = Math.floor((today - fileDate) / (1000 * 60 * 60 * 24));
      
      if (daysOld > MAX_DAYS) {
        const filePath = path.join(HISTORY_DIR, file);
        await fs.unlink(filePath);
        logger.info(`Deleted old history file: ${file}`);
      }
    }
  } catch (err) {
    logger.error('Cleanup failed:', err);
  }
}

module.exports = {
  initHistory,
  saveMetrics,
  getMetricsRange,
  cleanupOldFiles,
};
```

---

## 5. Telegram Bot Pattern

### File: `src/telegram/bot.js`

```javascript
const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const { isAuthorized } = require('./auth');
const handlers = require('./handlers');

let bot = null;

function initBot() {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  
  // Auth middleware
  bot.use(async (ctx, next) => {
    if (await isAuthorized(ctx.message?.from?.id)) {
      return next();
    } else {
      return ctx.reply('❌ Unauthorized. Contact admin.');
    }
  });
  
  // Register commands
  bot.command('start', handlers.handleStart);
  bot.command('help', handlers.handleHelp);
  bot.command('status', handlers.handleStatus);
  bot.command('slowqueries', handlers.handleSlowQueries);
  bot.command('alerts', handlers.handleAlerts);
  bot.command('instances', handlers.handleInstances);
  bot.command('history', handlers.handleHistory);
  
  // Error handling
  bot.catch((err) => {
    logger.error('Telegram error:', err);
  });
  
  return bot;
}

async function startBot() {
  try {
    initBot();
    await bot.launch();
    logger.info('✓ Telegram bot started');
    
    return bot;
  } catch (err) {
    logger.error('Failed to start bot:', err);
    throw err;
  }
}

async function stopBot() {
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}

function getBot() {
  return bot;
}

module.exports = {
  startBot,
  stopBot,
  getBot,
};
```

---

## 6. Telegram Handlers Pattern

### File: `src/telegram/handlers.js`

```javascript
const metricsCollector = require('../services/metrics-collector');
const historyManager = require('../services/history-manager');

async function handleStart(ctx) {
  const welcome = `
👋 Welcome to MySQL Monitor Bot!

Use /help to see available commands.

Type a command to get started:
/status - View current metrics
/slowqueries - See slow queries
/alerts - View recent alerts
  `;
  
  return ctx.reply(welcome);
}

async function handleHelp(ctx) {
  const help = `
📚 Available Commands:

/status - 📊 Current metrics for all instances
/slowqueries - ⏱️ Slow queries in last hour
/alerts - 🚨 Recent alerts
/instances - 🔌 Instance connectivity status
/history [instance] [hours] - 📈 Historical data
  Example: /history docker 24

/help - This message
  `;
  
  return ctx.reply(help);
}

async function handleStatus(ctx) {
  try {
    const metrics = await metricsCollector.collectMetrics();
    
    let message = '📊 **Current Status**\n\n';
    
    for (const m of metrics) {
      message += formatMetricsMessage(m);
      message += '\n---\n';
    }
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply('❌ Failed to get status');
  }
}

function formatMetricsMessage(metrics) {
  const m = metrics.metrics;
  const icon = metrics.status === 'healthy' ? '✅' : '⚠️';
  
  return `
${icon} **Instance: ${metrics.instance.toUpperCase()}**

🔴 Running Queries: ${m.runningQueries}
⏱️ Longest Query: ${Math.round(m.longestQueryDuration / 1000)}s
🐌 Slow Queries: ${m.slowQueryCount}
🔗 Connections: ${m.connections}/${m.maxConnections} (${Math.round(m.connectionUsage * 100)}%)
📊 Uptime: ${formatUptime(m.uptime)}
  `;
}

async function handleSlowQueries(ctx) {
  try {
    const instances = ['local', 'docker', 'aws'];
    let message = '⏱️ **Slow Queries**\n\n';
    
    for (const instance of instances) {
      const queries = await metricsCollector.getSlowQueries(instance);
      
      if (queries.length === 0) {
        message += `${instance}: No slow queries\n`;
        continue;
      }
      
      message += `**${instance.toUpperCase()}:**\n`;
      for (const q of queries) {
        message += `  • ${q.duration}s - ${q.user}@${q.host}\n`;
        message += `    ${q.info}\n\n`;
      }
    }
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply('❌ Failed to get slow queries');
  }
}

async function handleAlerts(ctx) {
  // Implementation would query history for recent alerts
  return ctx.reply('🚨 Recent alerts would be shown here');
}

async function handleInstances(ctx) {
  const connections = require('../config/mysql-connections');
  const status = connections.getStatus();
  
  let message = '🔌 **Instance Status**\n\n';
  
  for (const [instance, state] of Object.entries(status)) {
    const icon = state === 'connected' ? '✅' : '❌';
    message += `${icon} ${instance}: ${state}\n`;
  }
  
  return ctx.reply(message, { parse_mode: 'Markdown' });
}

async function handleHistory(ctx) {
  // Parse command: /history docker 24
  const args = ctx.message.text.split(' ');
  const instance = args[1] || 'docker';
  const hours = parseInt(args[2]) || 24;
  
  try {
    const now = new Date();
    const start = new Date(now - hours * 60 * 60 * 1000);
    
    const metrics = await historyManager.getMetricsRange(instance, start, now);
    
    let message = `📈 **History: ${instance} (last ${hours}h)**\n\n`;
    message += `Total data points: ${metrics.length}\n`;
    
    if (metrics.length > 0) {
      const avgConnections = Math.round(
        metrics.reduce((sum, m) => sum + m.metrics.connections, 0) / metrics.length
      );
      message += `Avg connections: ${avgConnections}\n`;
    }
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply('❌ Failed to get history');
  }
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  
  return `${days}d ${hours}h`;
}

module.exports = {
  handleStart,
  handleHelp,
  handleStatus,
  handleSlowQueries,
  handleAlerts,
  handleInstances,
  handleHistory,
};
```

---

## 7. Main Orchestration Pattern

### File: `src/index.js`

```javascript
require('dotenv').config();
const logger = require('./utils/logger');
const connections = require('./config/mysql-connections');
const bot = require('./telegram/bot');
const metricsCollector = require('./services/metrics-collector');
const alertDetector = require('./services/alert-detector');
const historyManager = require('./services/history-manager');
const cron = require('node-cron');

const METRICS_INTERVAL = parseInt(process.env.METRICS_INTERVAL) || 30000;

let monitoringInterval = null;

async function startup() {
  try {
    logger.info('Starting MySQL Monitor...');
    
    // 1. Initialize connections
    await connections.initConnections();
    
    // 2. Initialize history storage
    await historyManager.initHistory();
    
    // 3. Start Telegram bot
    await bot.startBot();
    
    // 4. Start monitoring loop
    startMonitoring();
    
    // 5. Setup cleanup cron job
    setupCleanupCron();
    
    logger.info('✓ System ready for monitoring');
  } catch (err) {
    logger.error('Failed to start system:', err);
    process.exit(1);
  }
}

function startMonitoring() {
  monitoringInterval = setInterval(async () => {
    try {
      // Collect metrics
      const metrics = await metricsCollector.collectMetrics();
      
      // Detect alerts
      const alerts = alertDetector.detectAlerts(metrics);
      
      // Store metrics
      await historyManager.saveMetrics(metrics);
      
      // Send alerts to Telegram (if any)
      for (const alert of alerts) {
        if (alert) {
          sendAlert(alert);
        }
      }
    } catch (err) {
      logger.error('Monitoring cycle error:', err);
    }
  }, METRICS_INTERVAL);
}

function setupCleanupCron() {
  const cleanupHour = parseInt(process.env.CLEANUP_HOUR) || 2;
  
  // Run daily at 2 AM
  cron.schedule(`0 ${cleanupHour} * * *`, async () => {
    logger.info('Running cleanup...');
    await historyManager.cleanupOldFiles();
  });
}

async function sendAlert(alert) {
  // Send alert to Telegram (to all authorized users)
  const botInstance = bot.getBot();
  if (!botInstance) return;
  
  const userIds = process.env.ALLOWED_USER_IDS?.split(',') || [];
  
  for (const userId of userIds) {
    try {
      await botInstance.telegram.sendMessage(
        userId,
        formatAlertMessage(alert),
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error(`Failed to send alert to ${userId}:`, err);
    }
  }
}

function formatAlertMessage(alert) {
  return `
🚨 **ALERT: ${alert.type}**

Instance: ${alert.instance}
Message: ${alert.message}
Time: ${new Date(alert.timestamp).toLocaleString()}

Severity: ${alert.severity}
  `;
}

async function shutdown() {
  logger.info('Shutting down...');
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  
  await bot.stopBot();
  await connections.closeAll();
  
  logger.info('Goodbye!');
  process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start app
startup().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
```

---

## 8. Telegram Auth Pattern

### File: `src/telegram/auth.js`

```javascript
const logger = require('../utils/logger');

// Cache authorized users in-memory
const authenticatedUsers = new Set();

/**
 * Check if a Telegram user ID is authorized.
 * Whitelist check against ALLOWED_USER_IDS in .env
 */
async function isAuthorized(userId) {
  if (!userId) return false;

  const allowedIds = (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (allowedIds.includes(String(userId))) {
    authenticatedUsers.add(userId);
    return true;
  }

  logger.warn(`Unauthorized access attempt from Telegram User ID: ${userId}`);
  return false;
}

module.exports = {
  isAuthorized,
};
```

---

## 9. Logger Utility Pattern

### File: `src/utils/logger.js`

```javascript
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'mysql-monitor' },
  transports: [
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new transports.File({ filename: path.join(logDir, 'app.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, stack }) => {
          return `[${timestamp}] ${level}: ${stack || message}`;
        })
      ),
    })
  );
}

module.exports = logger;
```

---

## 10. Helpers Utility Pattern

### File: `src/utils/helpers.js`

```javascript
/**
 * Format milliseconds into human readable uptime string (e.g. "2d 4h 15m")
 */
function formatUptime(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${totalSeconds % 60}s`);

  return parts.join(' ');
}

/**
 * Safe JSON parser with fallback
 */
function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch (err) {
    return fallback;
  }
}

/**
 * Truncate text with ellipsis
 */
function truncateText(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

module.exports = {
  formatUptime,
  safeJsonParse,
  truncateText,
};
```

---

## Common Errors & Solutions

### Error: "Cannot read property 'query' of undefined"
**Cause:** Connection not initialized
**Solution:** Ensure `await initConnections()` called before using `connections.query()`

### Error: "Connection timeout"
**Cause:** MySQL instance not reachable
**Solution:** Check credentials, host, port in `.env`

### Error: "Unauthorized access"
**Cause:** User ID not in whitelist
**Solution:** Add user ID to `ALLOWED_USER_IDS` in `.env`

---

**Last Updated:** February 8, 2026
