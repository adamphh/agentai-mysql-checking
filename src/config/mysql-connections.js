const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('../utils/logger');

const connections = {
  local: config.mysql.local,
  docker: config.mysql.docker,
  aws: config.mysql.aws,
};

const pools = {};

// Initialize connection pools
async function initConnections() {
  for (const [instance, cfg] of Object.entries(connections)) {
    try {
      pools[instance] = mysql.createPool({
        ...cfg,
        waitForConnections: true,
        queueLimit: 0,
      });

      // Test connection with ping
      const connection = await pools[instance].getConnection();
      await connection.ping();
      connection.release();

      logger.info(`✓ Connected to ${instance} MySQL instance`);
    } catch (err) {
      logger.error(`✗ Failed to connect to ${instance} instance: ${err.message}`);
      // Do not crash application, connection will retry on demand
    }
  }
}

// Execute query on specific instance pool
async function query(instance, sql, values = []) {
  try {
    const pool = pools[instance];
    if (!pool) {
      throw new Error(`Instance ${instance} pool not initialized`);
    }

    const [rows] = await pool.execute(sql, values);
    return rows;
  } catch (err) {
    logger.error(`Query failed on instance '${instance}': ${err.message}`);
    throw err;
  }
}

// Get connection status for all instances
function getStatus() {
  return {
    local: pools.local ? 'connected' : 'disconnected',
    docker: pools.docker ? 'connected' : 'disconnected',
    aws: pools.aws ? 'connected' : 'disconnected',
  };
}

// Close all connection pools
async function closeAll() {
  for (const [instance, pool] of Object.entries(pools)) {
    if (pool) {
      try {
        await pool.end();
        logger.info(`Closed connection pool for ${instance}`);
      } catch (err) {
        logger.error(`Error closing pool for ${instance}: ${err.message}`);
      }
    }
  }
}

module.exports = {
  initConnections,
  query,
  getStatus,
  closeAll,
};
