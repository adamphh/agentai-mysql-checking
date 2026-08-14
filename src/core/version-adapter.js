/**
 * Cross-version SQL Compatibility Adapter.
 * Provides version-safe queries tailored for MySQL 5.7, 8.0, 8.4+ and MariaDB.
 */

/**
 * Builds version-adapted SQL query templates based on detected capabilities.
 *
 * @param {Object} capabilities - Database capabilities object from capability-probe.
 * @returns {Object} Helper containing version-adapted query generators.
 */
function createVersionAdapter(capabilities) {
  const { isMySQL8Plus, isMySQL84Plus, isMariaDB, hasPerformanceSchema, hasSysSchema } = capabilities;

  return {
    /**
     * Appends an optimizer timeout hint to a SELECT statement.
     *
     * @param {string} sql - Base SELECT SQL statement.
     * @param {number} [timeoutMs=5000] - Timeout in milliseconds.
     * @returns {string} SQL query with timeout hint.
     */
    withTimeoutHint(sql, timeoutMs = 5000) {
      if (isMariaDB) {
        return sql.replace(/^SELECT/i, `SELECT /*+ MAX_EXECUTION_TIME(${timeoutMs}) */`);
      }
      return sql.replace(/^SELECT/i, `SELECT /*+ MAX_EXECUTION_TIME(${timeoutMs}) */`);
    },

    /**
     * Gets the query for inspecting active InnoDB lock waits.
     *
     * @returns {string} Lock wait inspection query.
     */
    getLockWaitsQuery() {
      if (hasSysSchema) {
        return `
          SELECT 
            waiting_trx_id, waiting_pid, waiting_query, 
            blocking_trx_id, blocking_pid, blocking_query,
            wait_age, wait_started, locked_table, locked_type
          FROM sys.innodb_lock_waits
          LIMIT 50
        `;
      }

      if (isMySQL8Plus) {
        return `
          SELECT 
            r.trx_id AS waiting_trx_id,
            r.trx_mysql_thread_id AS waiting_pid,
            r.trx_query AS waiting_query,
            b.trx_id AS blocking_trx_id,
            b.trx_mysql_thread_id AS blocking_pid,
            b.trx_query AS blocking_query,
            w.requesting_engine_lock_id,
            w.blocking_engine_lock_id
          FROM performance_schema.data_lock_waits w
          JOIN information_schema.innodb_trx r ON w.requesting_engine_transaction_id = r.trx_id
          JOIN information_schema.innodb_trx b ON w.blocking_engine_transaction_id = b.trx_id
          LIMIT 50
        `;
      }

      // MySQL 5.7 or MariaDB fallback
      return `
        SELECT 
          r.trx_id AS waiting_trx_id,
          r.trx_mysql_thread_id AS waiting_pid,
          r.trx_query AS waiting_query,
          b.trx_id AS blocking_trx_id,
          b.trx_mysql_thread_id AS blocking_pid,
          b.trx_query AS blocking_query
        FROM information_schema.innodb_lock_waits w
        JOIN information_schema.innodb_trx r ON w.requesting_trx_id = r.trx_id
        JOIN information_schema.innodb_trx b ON w.blocking_trx_id = b.trx_id
        LIMIT 50
      `;
    },

    /**
     * Gets statement digest analysis query for top slow queries.
     *
     * @param {number} [limit=10] - Number of slow queries to retrieve.
     * @returns {string} Statement digest query.
     */
    getStatementDigestQuery(limit = 10) {
      if (hasSysSchema) {
        return `
          SELECT 
            query,
            db,
            exec_count,
            total_latency,
            max_latency,
            avg_latency,
            rows_sent,
            rows_sent_avg,
            rows_examined,
            rows_examined_avg,
            full_scan,
            tmp_tables,
            tmp_disk_tables,
            rows_sorted,
            sort_merge_passes
          FROM sys.statement_analysis
          WHERE db NOT IN ('sys', 'mysql', 'performance_schema', 'information_schema')
          ORDER BY total_latency DESC
          LIMIT ${limit}
        `;
      }

      if (hasPerformanceSchema) {
        return `
          SELECT 
            DIGEST_TEXT AS query,
            SCHEMA_NAME AS db,
            COUNT_STAR AS exec_count,
            ROUND(SUM_TIMER_WAIT / 1000000000000, 3) AS total_latency_sec,
            ROUND(MAX_TIMER_WAIT / 1000000000000, 3) AS max_latency_sec,
            ROUND(AVG_TIMER_WAIT / 1000000000000, 3) AS avg_latency_sec,
            SUM_ROWS_SENT AS rows_sent,
            SUM_ROWS_EXAMINED AS rows_examined,
            SUM_NO_INDEX_USED AS no_index_used_count,
            SUM_NO_GOOD_INDEX_USED AS no_good_index_used_count,
            SUM_CREATED_TMP_DISK_TABLES AS tmp_disk_tables,
            SUM_SORT_ROWS AS rows_sorted
          FROM performance_schema.events_statements_summary_by_digest
          WHERE SCHEMA_NAME NOT IN ('sys', 'mysql', 'performance_schema', 'information_schema')
            OR SCHEMA_NAME IS NULL
          ORDER BY SUM_TIMER_WAIT DESC
          LIMIT ${limit}
        `;
      }

      // Fallback when performance_schema is off: return empty query string
      return '';
    },

    /**
     * Gets redundant index analysis query.
     *
     * @returns {string} Redundant index query.
     */
    getRedundantIndexesQuery() {
      if (hasSysSchema) {
        return `
          SELECT 
            table_schema, table_name, redundant_index_name,
            redundant_index_columns, dominant_index_name,
            dominant_index_columns, subpart_exists, sql_drop_index
          FROM sys.schema_redundant_indexes
          WHERE table_schema NOT IN ('mysql', 'sys', 'performance_schema', 'information_schema')
        `;
      }
      return '';
    },

    /**
     * Gets unused indexes query.
     *
     * @returns {string} Unused indexes query.
     */
    getUnusedIndexesQuery() {
      if (hasSysSchema) {
        return `
          SELECT 
            object_schema AS table_schema,
            object_name AS table_name,
            index_name
          FROM sys.schema_unused_indexes
          WHERE object_schema NOT IN ('mysql', 'sys', 'performance_schema', 'information_schema')
        `;
      }
      return '';
    }
  };
}

module.exports = {
  createVersionAdapter
};
