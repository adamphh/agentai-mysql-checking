// Telegram Report Bot - Sends reports to Telegram users
const { Telegraf } = require('telegraf');
const { getMetrics } = require('../services/history-manager');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_IDS = process.env.ALLOWED_USER_IDS.split(',').map((id) => id.trim());

const bot = new Telegraf(BOT_TOKEN);

// Middleware to check user authentication
bot.use((ctx, next) => {
  if (!ALLOWED_USER_IDS.includes(String(ctx.from.id))) {
    return ctx.reply('❌ Unauthorized access.');
  }
  return next();
});

// Command: /report [date]
bot.command('report', (ctx) => {
  const args = ctx.message.text.split(' ');
  const date = args[1]; // Expected format: YYYY-MM-DD

  if (!date) {
    return ctx.reply('❌ Please provide a date. Usage: /report YYYY-MM-DD');
  }

  const metrics = getMetrics(date);
  if (metrics.length === 0) {
    return ctx.reply(`ℹ️ No metrics found for ${date}.`);
  }

  let report = `📊 Metrics Report for ${date}\n`;
  metrics.forEach((entry) => {
    report += `\n⏱️ Timestamp: ${new Date(entry.timestamp).toLocaleString()}`;
    report += `\n🔗 Instance: ${entry.instance}`;
    report += `\n📈 Metrics: ${JSON.stringify(entry.metrics, null, 2)}\n`;
  });

  ctx.reply(report);
});

// Start the bot
bot.launch().then(() => {
  console.log('✅ Telegram Report Bot is running.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));