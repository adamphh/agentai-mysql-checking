const logger = require('../utils/logger');

const THRESHOLDS = {
  queryDuration: 30000,      // 30 seconds
  cpuUsage: 80,              // %
  memoryUsage: 85,           // %
  lockWaitTime: 10000,       // 10 seconds
  connectionLimit: 0.8,      // 80% of max
  slowQueryCount: 10,        // Alert if > 10
};

// Alert history to prevent duplicate alerts (Debounce window)
const alertHistory = new Map();
const ALERT_DEBOUNCE = 5 * 60 * 1000; // 5 minutes

function detectAlerts(metricsArray) {
  const alerts = [];

  for (const metrics of metricsArray) {
    if (!metrics || !metrics.metrics) continue;
    const instanceAlerts = checkMetricsAlerts(metrics);
    alerts.push(...instanceAlerts.filter(Boolean));
  }

  return alerts;
}

function checkMetricsAlerts(metrics) {
  const alerts = [];
  const { instance, metrics: m } = metrics;

  // Check long running query (>30s)
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

  // Check connection limit (>80%)
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

  // Check slow query count (>10)
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

  // Check if sent recently (debounce)
  const lastAlert = alertHistory.get(alertKey);
  if (lastAlert && Date.now() - lastAlert < ALERT_DEBOUNCE) {
    return null; // Debounced
  }

  // Update last alert timestamp
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
