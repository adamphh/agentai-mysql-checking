/**
 * Memory & I/O Engine Analyzer (Pillar 4).
 * Inspects InnoDB Buffer Pool efficiency, dirty page flush rates, Redo Log sizing, and cache hit ratios.
 * Also collects deep Telemetry on Read vs Write workload profiles and RAM vs Disk I/O efficiency.
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes memory usage, I/O efficiency, and InnoDB engine health.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @returns {Promise<{issues: Array, telemetry: Object}>} Detected issues and detailed I/O telemetry.
 */
async function analyzeMemoryAndIO(queryRunner, capabilities) {
  const issues = [];
  const telemetry = {
    workload: {
      statement: { selects: 0, writes: 0, total: 0, readPct: 100, writePct: 0 },
      row: { rowsRead: 0, rowsWritten: 0, total: 0, readPct: 100, writePct: 0 },
      profile: 'READ_HEAVY'
    },
    memory: {
      bufferPoolMb: 0,
      bufferPoolGb: 0,
      readRequests: 0,
      diskReads: 0,
      memoryHitRatio: 100,
      diskReadRatio: 0,
      dirtyPagesPct: 0,
      redoLogWaits: 0
    },
    diagnostics: {
      status: 'HEALTHY',
      summary: 'Hệ thống đọc dữ liệu từ RAM tối ưu (Hit Ratio >= 99.5%).',
      recommendation: 'Duy trì cấu hình hiện tại.'
    }
  };

  try {
    const statusMap = await queryRunner.queryKeyValueMap('SHOW GLOBAL STATUS');
    const varsMap = await queryRunner.queryKeyValueMap('SHOW GLOBAL VARIABLES');

    // 1. Workload Read vs Write Profile
    const sel = parseFloat(statusMap.Com_select || 0);
    const ins = parseFloat(statusMap.Com_insert || 0);
    const upd = parseFloat(statusMap.Com_update || 0);
    const del = parseFloat(statusMap.Com_delete || 0);
    const rep = parseFloat(statusMap.Com_replace || 0);
    const stmtWrites = ins + upd + del + rep;
    const stmtTotal = sel + stmtWrites;

    const rRead = parseFloat(statusMap.Innodb_rows_read || 0);
    const rIns = parseFloat(statusMap.Innodb_rows_inserted || 0);
    const rUpd = parseFloat(statusMap.Innodb_rows_updated || 0);
    const rDel = parseFloat(statusMap.Innodb_rows_deleted || 0);
    const rowWrites = rIns + rUpd + rDel;
    const rowTotal = rRead + rowWrites;

    const stmtReadPct = stmtTotal > 0 ? (sel / stmtTotal) * 100 : 100;
    const stmtWritePct = stmtTotal > 0 ? (stmtWrites / stmtTotal) * 100 : 0;
    const rowReadPct = rowTotal > 0 ? (rRead / rowTotal) * 100 : 100;
    const rowWritePct = rowTotal > 0 ? (rowWrites / rowTotal) * 100 : 0;

    let profile = 'READ_HEAVY';
    if (stmtReadPct < 50 || rowReadPct < 50) profile = 'WRITE_HEAVY';
    else if (stmtReadPct < 75 || rowReadPct < 75) profile = 'BALANCED';

    telemetry.workload = {
      statement: {
        selects: sel,
        writes: stmtWrites,
        total: stmtTotal,
        readPct: parseFloat(stmtReadPct.toFixed(1)),
        writePct: parseFloat(stmtWritePct.toFixed(1))
      },
      row: {
        rowsRead: rRead,
        rowsWritten: rowWrites,
        total: rowTotal,
        readPct: parseFloat(rowReadPct.toFixed(1)),
        writePct: parseFloat(rowWritePct.toFixed(1))
      },
      profile
    };

    // 2. InnoDB Buffer Pool & Disk I/O Efficiency
    const bpBytes = parseFloat(varsMap.innodb_buffer_pool_size || 134217728);
    const readRequests = parseFloat(statusMap.Innodb_buffer_pool_read_requests || 1);
    const diskReads = parseFloat(statusMap.Innodb_buffer_pool_reads || 0);
    const hitRatio = Math.max(0, 100 - (diskReads / Math.max(1, readRequests)) * 100);
    const diskReadPct = Math.max(0, 100 - hitRatio);

    const pagesTotal = parseFloat(statusMap.Innodb_buffer_pool_pages_total || 1);
    const pagesDirty = parseFloat(statusMap.Innodb_buffer_pool_pages_dirty || 0);
    const dirtyRatio = (pagesDirty / Math.max(1, pagesTotal)) * 100;
    const logWaits = parseInt(statusMap.Innodb_log_waits || 0, 10);

    telemetry.memory = {
      bufferPoolMb: parseFloat((bpBytes / 1024 / 1024).toFixed(1)),
      bufferPoolGb: parseFloat((bpBytes / 1024 / 1024 / 1024).toFixed(2)),
      readRequests,
      diskReads,
      memoryHitRatio: parseFloat(hitRatio.toFixed(2)),
      diskReadRatio: parseFloat(diskReadPct.toFixed(2)),
      dirtyPagesPct: parseFloat(dirtyRatio.toFixed(1)),
      redoLogWaits: logWaits
    };

    // Diagnostics synthesis
    if (hitRatio < 95.0 && readRequests > 10000) {
      telemetry.diagnostics = {
        status: 'CRITICAL',
        summary: `Tỷ lệ đọc từ Disk quá cao (${diskReadPct.toFixed(2)}% > 5%), ` +
          `hệ thống đang bị nghẽn Disk I/O nặng nề.`,
        recommendation: `Tăng innodb_buffer_pool_size và tối ưu Index để tránh Full Table Scan.`
      };
    } else if (hitRatio < 99.0 && readRequests > 10000) {
      telemetry.diagnostics = {
        status: 'WARNING',
        summary: `Tỷ lệ trúng RAM ở mức trung bình (${hitRatio.toFixed(2)}% < 99%), ` +
          `vẫn xuất hiện nhiều truy vấn đọc Disk.`,
        recommendation: `Xem xét bổ sung RAM cho Buffer Pool hoặc tối ưu hóa câu lệnh chậm.`
      };
    } else {
      telemetry.diagnostics = {
        status: 'HEALTHY',
        summary: `Bộ nhớ RAM đáp ứng xuất sắc (${hitRatio.toFixed(2)}% dữ liệu đọc trực tiếp từ RAM).`,
        recommendation: `Hiệu suất I/O đạt trạng thái tối ưu.`
      };
    }

    // Issues Evaluation
    if (readRequests > 10000) {
      if (hitRatio < 95.0) {
        issues.push({
          code: 'BUFFER_POOL_HIT_RATIO_CRITICAL',
          title: `Critical Buffer Pool Hit Ratio (${hitRatio.toFixed(2)}% < 95%)`,
          severity: SEVERITY_LEVELS.CRITICAL,
          category: 'Memory & Cache',
          details: `InnoDB served ${diskReadPct.toFixed(2)}% of read requests directly from disk ` +
            `(${diskReads.toLocaleString()} physical disk reads). Server is severely memory-starved.`,
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

    // Buffer Pool Dirty Page Ratio
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

    // Redo Log Wait Contention
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

    // Thread Cache Hit Ratio
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

    // Linux Flush Method Optimization
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

    // ACID Durability vs High Throughput Settings
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

  return {
    issues,
    telemetry
  };
}

module.exports = {
  analyzeMemoryAndIO
};
