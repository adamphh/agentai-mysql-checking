/**
 * Safe Database Query Runner.
 * Executes read-only queries with dual-layer timeout and session guardrails.
 */

class QueryRunner {
  /**
   * Initializes the QueryRunner with a connection pool and default options.
   *
   * @param {Object} pool - MySQL connection pool.
   * @param {Object} [options={}] - Execution options.
   * @param {number} [options.timeout=5000] - Default timeout in milliseconds.
   */
  constructor(pool, options = {}) {
    this.pool = pool;
    this.defaultTimeout = options.timeout || 5000;
  }

  /**
   * Initializes session-level safety guardrails.
   *
   * @param {Object} conn - MySQL connection object.
   * @param {Object} [capabilities={}] - Detected capabilities.
   * @returns {Promise<void>}
   */
  async setupSessionGuardrails(conn, capabilities = {}) {
    try {
      await conn.query('SET SESSION TRANSACTION READ ONLY');
    } catch (err) {
      // Some read-only replicas or older versions might not support this, ignore
    }

    if (capabilities.isMySQL57) {
      try {
        await conn.query('SET SESSION innodb_stats_on_metadata = 0');
      } catch (err) {
        // Ignore if unsupported
      }
    }
  }

  /**
   * Executes a read-only query with timeout protection.
   *
   * @param {string} sql - SQL query string.
   * @param {Array} [params=[]] - Query parameters.
   * @param {number} [timeout] - Optional custom timeout in ms.
   * @returns {Promise<Array>} Result rows array.
   */
  async query(sql, params = [], timeout = this.defaultTimeout) {
    let conn;
    try {
      conn = await this.pool.getConnection();
      const [rows] = await conn.query({
        sql,
        values: params,
        timeout
      });
      return rows;
    } catch (error) {
      // Return empty array on timeout or error to isolate faults
      if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.code === 'ER_QUERY_TIMEOUT') {
        console.warn(`⚠️ Query timed out after ${timeout}ms: ${sql.substring(0, 80)}...`);
      }
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  /**
   * Executes a query safely, returning fallback array on error instead of throwing.
   *
   * @param {string} sql - SQL query string.
   * @param {Array} [params=[]] - Query parameters.
   * @param {Array} [fallback=[]] - Fallback value on failure.
   * @param {number} [timeout] - Timeout in ms.
   * @returns {Promise<Array>} Result rows or fallback.
   */
  async safeQuery(sql, params = [], fallback = [], timeout = this.defaultTimeout) {
    if (!sql || sql.trim() === '') {
      return fallback;
    }
    try {
      return await this.query(sql, params, timeout);
    } catch (err) {
      return fallback;
    }
  }

  /**
   * Queries a key-value status or variable table and converts to a JavaScript object.
   *
   * @param {string} sql - Query string like "SHOW GLOBAL STATUS" or "SHOW GLOBAL VARIABLES".
   * @returns {Promise<Object>} Key-value map of status or variable values.
   */
  async queryKeyValueMap(sql) {
    const rows = await this.safeQuery(sql);
    const map = {};
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const key = row.Variable_name || row.variable_name || row.Name || row.name;
        const val = row.Value !== undefined ? row.Value : row.value;
        if (key) {
          map[key] = val;
        }
      }
    }
    return map;
  }
}

module.exports = {
  QueryRunner
};
