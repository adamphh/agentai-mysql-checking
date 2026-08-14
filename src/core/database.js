/**
 * Database connection manager.
 * Provides safe, connection-pooled access to MySQL and MariaDB instances.
 */

const mysql = require('mysql2/promise');

/**
 * Creates and initializes a connection pool to the target database.
 *
 * @param {Object} config - Database configuration parameters.
 * @param {string} [config.host='127.0.0.1'] - Database host.
 * @param {number} [config.port=3306] - Database port.
 * @param {string} [config.user='root'] - Database username.
 * @param {string} [config.password=''] - Database password.
 * @param {string} [config.database] - Optional target database name.
 * @param {number} [config.connectionLimit=5] - Maximum pool connections.
 * @param {number} [config.connectTimeout=10000] - Connection timeout in ms.
 * @returns {mysql.Pool} Initialized MySQL connection pool.
 */
function createConnectionPool(config = {}) {
  const poolConfig = {
    host: config.host || '127.0.0.1',
    port: parseInt(config.port || 3306, 10),
    user: config.user || 'root',
    password: config.password || '',
    database: config.database || undefined,
    waitForConnections: true,
    connectionLimit: config.connectionLimit || 5,
    connectTimeout: config.connectTimeout || 10000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };

  return mysql.createPool(poolConfig);
}

/**
 * Tests if the target database can be connected to.
 *
 * @param {mysql.Pool} pool - MySQL connection pool.
 * @returns {Promise<{success: boolean, error?: string}>} Connection test result.
 */
async function testConnection(pool) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.ping();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unable to establish database connection'
    };
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

module.exports = {
  createConnectionPool,
  testConnection
};
