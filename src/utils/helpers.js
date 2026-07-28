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
