/**
 * Memory & I/O Engine Analyzer (Pillar 4).
 * Inspects InnoDB Buffer Pool efficiency, dirty page flush rates, Redo Log sizing, and cache hit ratios.
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes memory usage, I/O efficiency, and InnoDB engine health.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @returns {Promise<Array>} List of detected memory and I/O issues.
 */
async function analyzeMemoryAndIO(queryRunner, capabilities) {
  const issues = [];

  try {
    const statusMap = await queryRunner.queryKeyValueMap("SHOW GLOBAL STATUS");
    const varsMap = await queryRunner.queryKeyValueMap("SHOW GLOBAL VARIABLES");

    // 1. InnoDB Buffer Pool Hit Ratio (CRITICAL / WARNING)
    const readRequests = parseFloat(statusMap.Innodb_buffer_pool_read_requests || 1);
    const diskReads = parseFloat(statusMap.Innodb_buffer_pool_reads || 0);
    const hitRatio = Math.max(0, 100 - (diskReads / Math.max(1, readRequests)) * 100);

    if (readRequests > 10000) {
      if (hitRatio < 95.0) {
        issues.push({
          code: 'BUFFER_POOL_HIT_RATIO_CRITICAL',
          title: `Critical Buffer Pool Hit Ratio (${hitRatio.toFixed(2)}% < 95%)`,
          severity: SEVERITY_LEVELS.CRITICAL,
          category: 'Memory & Cache',
          details: `InnoDB served ${(100 - hitRatio).toFixed(2)}% of read requests directly from disk ` +
            `(${diskReads.toLocaleString()} disk reads). Server is severely memory-starved for current dataset.`,
          recommendation: `Increase 'innodb_buffer_pool_size' to allocate 60-75% of physical RAM to MySQL.`,
          fixSql: `-- Increase innodb_buffer_pool_size in my.cnf to fit active working dataset`
        });
      } else if (hitRatio < 99.0) {
        issues.push({
          code: 'BUFFER_POOL_HIT_RATIO_LOW',
          title: `Suboptimal Buffer Pool Hit Ratio (${hitRatio.toFixed(2)}% < 99%)`,
          severity: SEVERITY_LEVELS.WARNING,
          category: 'Memory & Cache',
          details: `Healthy production OLTP databases should sustain >= 99.0% hit ratio. ` +
            `Current hit ratio: ${hitRatio.toFixed(2)}%.`,
          recommendation: `Consider resizing 'innodb_buffer_pool_size' or optimizing query index coverage.`,
          fixSql: `-- Evaluate increasing innodb_buffer_pool_size`
        });
      }
    }

    // 2. Buffer Pool Dirty Page Ratio (WARNING)
    const pagesTotal = parseFloat(statusMap.Innodb_buffer_pool_pages_total || 1);
    const pagesDirty = parseFloat(statusMap.Innodb_buffer_pool_pages_dirty || 0);
    const dirtyRatio = (pagesDirty / Math.max(1, pagesTotal)) * 100;

    if (dirtyRatio > 70.0 && pagesTotal > 1000) {
      issues.push({
        code: 'BUFFER_POOL_DIRTY_PAGES_HIGH',
        title: `High Buffer Pool Dirty Page Ratio (${dirtyRatio.toFixed(1)}% > 70%)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Memory & Disk I/O',
        details: `${pagesDirty.toLocaleString()} out of ${pagesTotal.toLocaleString()} buffer pool pages ` +
          `are modified (dirty). Background page flushing may be falling behind write traffic.`,
        recommendation: `Check storage I/O capacity and consider tuning ` +
          `'innodb_io_capacity' & 'innodb_io_capacity_max'.`,
        fixSql: `SET GLOBAL innodb_io_capacity = 2000; SET GLOBAL innodb_io_capacity_max = 4000;`
      });
    }

    // 3. Redo Log Wait Contention (CRITICAL)
    const logWaits = parseInt(statusMap.Innodb_log_waits || 0, 10);
    if (logWaits > 0) {
      issues.push({
        code: 'INNODB_LOG_WAITS_DETECTED',
        title: `Redo Log Buffer Wait Contention (${logWaits} waits recorded)`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Disk I/O & Logging',
        details: `InnoDB threads were forced to stall and wait for log buffer flushes. ` +
          `Redo log buffer or disk I/O flush rate is a critical bottleneck.`,
        recommendation: `Increase 'innodb_log_buffer_size' (e.g. 32M/64M) or increase redo log file capacity.`,
        fixSql: `SET GLOBAL innodb_log_buffer_size = 64 * 1024 * 1024;`
      });
    }

    // 4. Thread Cache Hit Ratio (WARNING)
    const totalConnections = parseFloat(statusMap.Connections || 1);
    const threadsCreated = parseFloat(statusMap.Threads_created || 0);
    const threadCacheHit = Math.max(0, 100 - (threadsCreated / Math.max(1, totalConnections)) * 100);

    if (totalConnections > 1000 && threadCacheHit < 90.0) {
      issues.push({
        code: 'THREAD_CACHE_MISS_RATIO_HIGH',
        title: `Low Thread Cache Hit Ratio (${threadCacheHit.toFixed(1)}% < 90%)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'CPU & Concurrency',
        details: `MySQL had to create ${threadsCreated.toLocaleString()} new OS threads for incoming connections. ` +
          `Creating OS threads on demand causes high CPU overhead during connection spikes.`,
        recommendation: `Increase 'thread_cache_size' (recommended: 32 - 128 depending on concurrent connections).`,
        fixSql: `SET GLOBAL thread_cache_size = 64;`
      });
    }

    // 5. Linux Flush Method Optimization (WARNING)
    const flushMethod = String(varsMap.innodb_flush_method || '').toUpperCase();
    if (capabilities.flavor === 'mysql' && (flushMethod === 'FSYNC' || flushMethod === '')) {
      issues.push({
        code: 'INNODB_FLUSH_METHOD_DOUBLE_BUFFERING',
        title: `InnoDB Flush Method is '${flushMethod || 'default'}' (Double Buffering Risk on Linux)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Storage & I/O',
        details: `Using fsync causes data pages to be cached twice ` +
          `(both in OS filesystem cache and InnoDB buffer pool).`,
        recommendation: `Set 'innodb_flush_method = O_DIRECT' in my.cnf to bypass OS buffer cache on Linux.`,
        fixSql: `-- Add to my.cnf under [mysqld]:\n-- innodb_flush_method = O_DIRECT`
      });
    }

    // 6. ACID Durability vs High Throughput Settings (INFO)
    const flushTrx = varsMap.innodb_flush_log_at_trx_commit;
    const syncBinlog = varsMap.sync_binlog;
    if (flushTrx === '1' && syncBinlog === '1') {
      issues.push({
        code: 'ACID_DURABILITY_FULL',
        title: `Full ACID Durability Enabled (innodb_flush_log_at_trx_commit=1, sync_binlog=1)`,
        severity: SEVERITY_LEVELS.INFO,
        category: 'Storage & I/O',
        details: `Guarantees zero data loss on power crash, but enforces 2 disk fsyncs per commit. ` +
          `For non-financial high-write workloads, setting innodb_flush_log_at_trx_commit=2 boosts write throughput.`,
        recommendation: `Keep =1 for strict ACID. If write throughput is bottlenecked, consider =2.`,
        fixSql: `-- For write-heavy non-financial systems: SET GLOBAL innodb_flush_log_at_trx_commit = 2;`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  return issues;
}

module.exports = {
  analyzeMemoryAndIO
};
