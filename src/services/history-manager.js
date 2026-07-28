const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/config');

const HISTORY_DIR = path.join(__dirname, '../..', 'history');
const MAX_DAYS = config.monitoring.historyDays || 7;

async function initHistory() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    logger.info('✓ History directory ready');
  } catch (err) {
    logger.error('Failed to create history directory:', err.message);
  }
}

async function saveMetrics(metricsArray) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filePath = path.join(HISTORY_DIR, `metrics-${today}.json`);

  try {
    let data = { date: today, entries: [] };
    try {
      const content = await fs.readFile(filePath, 'utf8');
      data = JSON.parse(content);
    } catch (err) {
      // File doesn't exist yet, start fresh
    }

    data.entries.push(...metricsArray);

    // Keep max 1000 entries per daily file to manage file size
    if (data.entries.length > 1000) {
      data.entries = data.entries.slice(-1000);
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error('Failed to save metrics history:', err.message);
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
      // File missing for this date, ignore
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
    logger.error('History cleanup failed:', err.message);
  }
}

module.exports = {
  initHistory,
  saveMetrics,
  getMetricsRange,
  cleanupOldFiles,
};
