const connections = require('../config/mysql-connections');
const logger = require('../utils/logger');
const { truncateText } = require('../utils/helpers');

const INSTANCES = ['local', 'docker', 'aws'];
const SLOW_QUERY_THRESHOLD = 5; // seconds

async function collectMetrics() {
  const allMetrics = [];

  for (const instance of INSTANCES) {
    try {
      const metrics = await getInstanceMetrics(instance);
      allMetrics.push(metrics);
    } catch (err) {
      logger.error(`Failed to collect metrics for ${instance}: ${err.message}`);
    }
  }

  return allMetrics;
}

async function getInstanceMetrics(instance) {
  const metrics = {
    timestamp: Date.now(),
    instance,
    metrics: {
      runningQueries: 0,
      longestQueryDuration: 0,
      slowQueryCount: 0,
      connections: 0,
      maxConnections: 100,
      connectionUsage: 0,
      uptime: 0,
    },
    status: 'healthy',
  };

  try {
    // Get running queries
    const processlist = await connections.query(
      instance,
      `SELECT * FROM INFORMATION_SCHEMA.PROCESSLIST WHERE COMMAND != 'Sleep'`
    );

    metrics.metrics.runningQueries = processlist.length;
    metrics.metrics.longestQueryDuration = processlist.length > 0
      ? Math.max(...processlist.map(p => (p.TIME || 0) * 1000))
      : 0;

    // Get slow queries count
    const slowQueries = processlist.filter(p => (p.TIME || 0) > SLOW_QUERY_THRESHOLD);
    metrics.metrics.slowQueryCount = slowQueries.length;

    // Get connection info
    const vars = await connections.query(
      instance,
      `SHOW STATUS WHERE VARIABLE_NAME IN ('Threads_connected', 'Max_used_connections')`
    );

    const threadsConnected = vars.find(v => v.Variable_name === 'Threads_connected')?.Value || 0;
    const maxConnections = vars.find(v => v.Variable_name === 'Max_used_connections')?.Value || 100;

    metrics.metrics.connections = parseInt(threadsConnected);
    metrics.metrics.maxConnections = parseInt(maxConnections) || 100;
    metrics.metrics.connectionUsage = metrics.metrics.maxConnections > 0
      ? metrics.metrics.connections / metrics.metrics.maxConnections
      : 0;

    // Get uptime
    const uptimeResult = await connections.query(
      instance,
      `SHOW STATUS WHERE VARIABLE_NAME = 'Uptime'`
    );
    metrics.metrics.uptime = parseInt(uptimeResult[0]?.Value || 0) * 1000;

    // Determine health status
    if (metrics.metrics.longestQueryDuration > 30000 || metrics.metrics.connectionUsage > 0.8) {
      metrics.status = 'warning';
    }

  } catch (err) {
    logger.error(`Error collecting metrics for instance '${instance}': ${err.message}`);
    metrics.status = 'error';
  }

  return metrics;
}

// Get slow queries details for a specific instance
async function getSlowQueries(instance) {
  try {
    const result = await connections.query(
      instance,
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
      info: truncateText(q.INFO || '', 100),
    }));
  } catch (err) {
    logger.error(`Failed to get slow queries for '${instance}': ${err.message}`);
    return [];
  }
}

module.exports = {
  collectMetrics,
  getInstanceMetrics,
  getSlowQueries,
};
