/**
 * Lock & Concurrency Analyzer (Pillar 2).
 * Inspects row lock contention, long-running transactions, deadlocks, and wait events.
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes lock contention, transactions, and wait events.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @param {Object} versionAdapter - Version compatibility adapter.
 * @returns {Promise<Array>} List of detected lock and concurrency issues.
 */
async function analyzeLocksAndConcurrency(queryRunner, capabilities, versionAdapter) {
  const issues = [];

  // 1. Long-Running Active Transactions (>30s) (CRITICAL)
  try {
    const longTrxSql = `
      SELECT 
        trx_id, trx_state, trx_started,
        TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS duration_sec,
        trx_mysql_thread_id, trx_query, trx_rows_locked, trx_rows_modified
      FROM information_schema.innodb_trx
      WHERE TIMESTAMPDIFF(SECOND, trx_started, NOW()) >= 30
      ORDER BY duration_sec DESC
      LIMIT 20
    `;
    const longTrxRows = await queryRunner.safeQuery(longTrxSql);
    for (const row of longTrxRows) {
      issues.push({
        code: 'LONG_RUNNING_TRANSACTION',
        title: `Long-running transaction (PID: ${row.trx_mysql_thread_id}, duration: ${row.duration_sec}s)`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Concurrency & Locking',
        details: `Transaction ${row.trx_id} has been active for ${row.duration_sec}s. ` +
          `Locked rows: ${row.trx_rows_locked}, Modified rows: ${row.trx_rows_modified}. ` +
          `Query snippet: ${row.trx_query ? row.trx_query.substring(0, 100) : 'Idle inside transaction'}`,
        recommendation: `Investigate why transaction is uncommitted. Long transactions prevent undo log purging.`,
        fixSql: `KILL ${row.trx_mysql_thread_id}; -- Terminate blocking connection if safe`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 2. Current Lock Waits & Contention (CRITICAL)
  try {
    const lockWaitSql = versionAdapter.getLockWaitsQuery();
    if (lockWaitSql) {
      const lockWaitRows = await queryRunner.safeQuery(lockWaitSql);
      for (const row of lockWaitRows) {
        issues.push({
          code: 'ACTIVE_LOCK_WAIT_BLOCK',
          title: `Lock Contention: PID ${row.blocking_pid} is blocking PID ${row.waiting_pid}`,
          severity: SEVERITY_LEVELS.CRITICAL,
          category: 'Concurrency & Locking',
          details: `Waiting query: ${row.waiting_query ? row.waiting_query.substring(0, 80) : 'N/A'}. ` +
            `Blocking query: ${row.blocking_query ? row.blocking_query.substring(0, 80) : 'N/A'} ` +
            `(Lock wait age: ${row.wait_age || 'Active'}).`,
          recommendation: `Check for unindexed UPDATE/DELETE or overlapping transactions locking identical rows.`,
          fixSql: `KILL ${row.blocking_pid}; -- Kill blocking thread if necessary`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 3. Global Status Lock Contention Metrics (WARNING)
  try {
    const statusMap = await queryRunner.queryKeyValueMap("SHOW GLOBAL STATUS LIKE 'Innodb_row_lock%'");
    const lockWaits = parseInt(statusMap.Innodb_row_lock_waits || 0, 10);
    const lockTimeAvg = parseInt(statusMap.Innodb_row_lock_time_avg || 0, 10);
    const lockTimeouts = parseInt(statusMap.Innodb_row_lock_timeouts || 0, 10);

    if (lockWaits > 1000 && lockTimeAvg > 200) {
      issues.push({
        code: 'HIGH_ROW_LOCK_CONTENTION',
        title: `High cumulative row lock contention (${lockWaits} waits, avg ${lockTimeAvg}ms)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Concurrency & Locking',
        details: `Server recorded ${lockWaits} row lock waits with average wait time of ${lockTimeAvg}ms. ` +
          `Row lock timeouts recorded: ${lockTimeouts}.`,
        recommendation: `Review transaction isolation levels (e.g. READ COMMITTED) and index WHERE conditions.`,
        fixSql: `SET GLOBAL transaction_isolation = 'READ-COMMITTED';`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 4. Thread Saturation (WARNING)
  try {
    const threadStatus = await queryRunner.queryKeyValueMap("SHOW GLOBAL STATUS LIKE 'Threads_running'");
    const threadsRunning = parseInt(threadStatus.Threads_running || 0, 10);
    if (threadsRunning > 25) {
      issues.push({
        code: 'HIGH_ACTIVE_THREADS_SATURATION',
        title: `High active thread concurrency (${threadsRunning} threads running)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Concurrency & Locking',
        details: `${threadsRunning} active threads executing simultaneously. ` +
          `May lead to excessive CPU context switching and OS scheduler contention.`,
        recommendation: `Consider implementing connection pooling at application level or MySQL Thread Pool.`,
        fixSql: `-- Implement application-level connection pool throttling`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 5. Deadlock Detection via Engine Status (WARNING)
  try {
    const engineRows = await queryRunner.safeQuery('SHOW ENGINE INNODB STATUS');
    if (engineRows && engineRows.length > 0 && engineRows[0].Status) {
      const statusText = engineRows[0].Status;
      if (statusText.includes('LATEST DETECTED DEADLOCK')) {
        const deadlockMatch = statusText.match(/LATEST DETECTED DEADLOCK[\s\S]*?(?=-{10,})/);
        const snippet = deadlockMatch ? deadlockMatch[0].substring(0, 300) : 'Deadlock detected in engine status';
        issues.push({
          code: 'DEADLOCK_DETECTED_RECENTLY',
          title: 'Recent InnoDB Deadlock event detected in engine log',
          severity: SEVERITY_LEVELS.WARNING,
          category: 'Concurrency & Locking',
          details: `InnoDB recorded a recent deadlock conflict between concurrent transactions:\n${snippet}...`,
          recommendation: `Ensure concurrent transactions access tables and rows in a consistent alphabetical order.`,
          fixSql: `-- Enforce consistent table/row locking order across application transactions`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  return issues;
}

module.exports = {
  analyzeLocksAndConcurrency
};
