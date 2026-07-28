const metricsCollector = require('../services/metrics-collector');
const historyManager = require('../services/history-manager');
const connections = require('../config/mysql-connections');
const { formatUptime } = require('../utils/helpers');

async function handleStart(ctx) {
  const welcome = `
👋 **Welcome to MySQL Monitor Bot!**

Use /help to see all available commands.

Quick Commands:
/status - Current metrics for all instances
/slowqueries - View slow queries
/alerts - View recent alerts
  `;

  return ctx.reply(welcome, { parse_mode: 'Markdown' });
}

async function handleHelp(ctx) {
  const help = `
📚 **Available Commands:**

/status - 📊 Current metrics for all instances
/slowqueries - ⏱️ Slow queries (> 5s)
/alerts - 🚨 Recent alerts log
/instances - 🔌 Instance connection status
/history [instance] [hours] - 📈 Historical data (e.g. /history docker 24)
/help - Show this message
  `;

  return ctx.reply(help, { parse_mode: 'Markdown' });
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
    return ctx.reply('❌ Failed to retrieve status metrics');
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
    let message = '⏱️ **Slow Queries (> 5s)**\n\n';

    for (const instance of instances) {
      const queries = await metricsCollector.getSlowQueries(instance);

      if (queries.length === 0) {
        message += `**${instance.toUpperCase()}:** No slow queries running\n\n`;
        continue;
      }

      message += `**${instance.toUpperCase()}:**\n`;
      for (const q of queries) {
        message += `  • ${q.duration}s - User: \`${q.user}\` @ \`${q.host}\`\n`;
        message += `    Query: \`${q.info}\`\n\n`;
      }
    }

    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply('❌ Failed to retrieve slow queries');
  }
}

async function handleAlerts(ctx) {
  return ctx.reply('🚨 **Recent Alerts:** All recent alerts are broadcasted directly to this chat when detected.', { parse_mode: 'Markdown' });
}

async function handleInstances(ctx) {
  const status = connections.getStatus();

  let message = '🔌 **Instance Connection Status**\n\n';

  for (const [instance, state] of Object.entries(status)) {
    const icon = state === 'connected' ? '✅' : '❌';
    message += `${icon} **${instance.toUpperCase()}**: ${state}\n`;
  }

  return ctx.reply(message, { parse_mode: 'Markdown' });
}

async function handleHistory(ctx) {
  const text = ctx.message?.text || '';
  const args = text.split(' ');
  const instance = args[1] || 'local';
  const hours = parseInt(args[2]) || 24;

  try {
    const now = new Date();
    const start = new Date(now - hours * 60 * 60 * 1000);

    const metrics = await historyManager.getMetricsRange(instance, start, now);

    let message = `📈 **History: ${instance.toUpperCase()} (last ${hours}h)**\n\n`;
    message += `Data points collected: ${metrics.length}\n`;

    if (metrics.length > 0) {
      const avgConnections = Math.round(
        metrics.reduce((sum, m) => sum + (m.metrics?.connections || 0), 0) / metrics.length
      );
      message += `Avg Active Connections: ${avgConnections}\n`;
    }

    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply('❌ Failed to retrieve history data');
  }
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
