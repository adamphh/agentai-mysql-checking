// History Manager - Handles storing and retrieving historical metrics
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, '../../history');
const HISTORY_DAYS = 7; // Rolling 7-day window

// Ensure history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// Save metrics to history file
function saveMetrics(instance, metrics) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filePath = path.join(HISTORY_DIR, `metrics-${date}.json`);

  let history = [];
  if (fs.existsSync(filePath)) {
    history = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  history.push({ timestamp: Date.now(), instance, metrics });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

// Get metrics for a specific date
function getMetrics(date) {
  const filePath = path.join(HISTORY_DIR, `metrics-${date}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
}

// Cleanup old history files
function cleanupHistory() {
  const files = fs.readdirSync(HISTORY_DIR);
  const cutoffDate = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;

  files.forEach((file) => {
    const match = file.match(/metrics-(\d{4}-\d{2}-\d{2})\.json/);
    if (match) {
      const fileDate = new Date(match[1]).getTime();
      if (fileDate < cutoffDate) {
        fs.unlinkSync(path.join(HISTORY_DIR, file));
      }
    }
  });
}

module.exports = { saveMetrics, getMetrics, cleanupHistory };