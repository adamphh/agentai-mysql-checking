const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const config = require('../config/config');
const { isAuthorized } = require('./auth');
const handlers = require('./handlers');

let bot = null;

function initBot() {
  const token = config.telegram.token;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN is not set in environment. Bot disabled.');
    return null;
  }

  bot = new Telegraf(token);

  // Authentication Middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.message?.from?.id;
    if (await isAuthorized(userId)) {
      return next();
    } else {
      return ctx.reply('❌ Unauthorized access. Your Telegram User ID is not in the whitelist.');
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

  // Global Error Handler
  bot.catch((err) => {
    logger.error('Telegram bot error:', err);
  });

  return bot;
}

async function startBot() {
  try {
    const botInstance = initBot();
    if (!botInstance) return null;

    await botInstance.launch();
    logger.info('✓ Telegram bot started successfully');

    return botInstance;
  } catch (err) {
    logger.error('Failed to start Telegram bot:', err.message);
    // Don't throw error to allow monitoring to run even if bot fails
    return null;
  }
}

async function stopBot() {
  if (bot) {
    try {
      await bot.stop();
      logger.info('Telegram bot stopped');
    } catch (err) {
      logger.error('Error stopping bot:', err.message);
    }
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
