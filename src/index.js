require('dotenv').config();
const config = require('./config/config');
const logger = require('./utils/logger');
const connections = require('./config/mysql-connections');
const bot = require('./telegram/bot');
const metricsCollector = require('./services/metrics-collector');
const alertDetector = require('./services/alert-detector');
const historyManager = require('./services/history-manager');
const cron = require('node-cron');

const METRICS_INTERVAL = config.monitoring.metricsInterval;
let monitoringInterval = null;

async function startup() {
  try {
    logger.info('================================================');
    logger.info('Starting MySQL Telegram Monitor...');
    logger.info('================================================');

    // 1. Initialize MySQL connections
    await connections.initConnections();

    // 2. Initialize history storage
    await historyManager.initHistory();

    // 3. Start Telegram Bot
    await bot.startBot();

    // 4. Start monitoring loop
    startMonitoring();

    // 5. Setup cleanup cron job (Runs daily at 2:00 AM)
    setupCleanupCron();

    logger.info('✓ System ready for monitoring');
  } catch (err) {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  }
}

function startMonitoring() {
  monitoringInterval = setInterval(async () => {
    try {
      // Collect metrics from all 3 instances
      const metrics = await metricsCollector.collectMetrics();

      // Detect alerts based on thresholds
      const alerts = alertDetector.detectAlerts(metrics);

      // Save metrics to 7-day rolling history
      await historyManager.saveMetrics(metrics);

      // Send alert notifications to Telegram allowed users
      for (const alert of alerts) {
        if (alert) {
          await sendAlertToTelegram(alert);
        }
      }
    } catch (err) {
      logger.error('Error during monitoring cycle:', err);
    }
  }, METRICS_INTERVAL);
}

function setupCleanupCron() {
  const cleanupHour = config.monitoring.cleanupHour;

  cron.schedule(`0 ${cleanupHour} * * *`, async () => {
    logger.info('Running scheduled history cleanup...');
    await historyManager.cleanupOldFiles();
  });
}

async function sendAlertToTelegram(alert) {
  const botInstance = bot.getBot();
  if (!botInstance) return;

  const userIds = config.telegram.allowedUserIds;

  for (const userId of userIds) {
    try {
      await botInstance.telegram.sendMessage(
        userId,
        formatAlertMessage(alert),
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error(`Failed to send alert notification to Telegram User ID ${userId}: ${err.message}`);
    }
  }
}

function formatAlertMessage(alert) {
  return `
🚨 **ALERT: ${alert.type}**

📍 **Instance:** ${alert.instance.toUpperCase()}
💬 **Message:** ${alert.message}
🕒 **Time:** ${new Date(alert.timestamp).toLocaleString()}
🔥 **Severity:** ${alert.severity.toUpperCase()}
  `;
}

async function shutdown() {
  logger.info('Shutting down MySQL Monitor...');

  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  await bot.stopBot();
  await connections.closeAll();

  logger.info('Goodbye!');
  process.exit(0);
}

// Graceful Shutdown Listeners
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Execute Startup
startup().catch(err => {
  logger.error('Fatal unhandled error:', err);
  process.exit(1);
});
