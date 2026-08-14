/**
 * Configuration & my.cnf Tuning Analyzer (Pillar 5).
 * Computes OOM risk, Buffer Pool sizing, File descriptor limits, and my.cnf best practices.
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes database configuration parameters and detects tuning opportunities.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @returns {Promise<Array>} List of configuration issues and tuning recommendations.
 */
async function analyzeConfiguration(queryRunner, capabilities) {
  const issues = [];

  try {
    const varsMap = await queryRunner.queryKeyValueMap("SHOW GLOBAL VARIABLES");

    // 1. OOM Killer Risk Calculator (CRITICAL / WARNING)
    const maxConnections = parseInt(varsMap.max_connections || 151, 10);
    const bufferPoolSize = parseFloat(varsMap.innodb_buffer_pool_size || 134217728);
    const keyBufferSize = parseFloat(varsMap.key_buffer_size || 8388608);
    const logBufferSize = parseFloat(varsMap.innodb_log_buffer_size || 16777216);

    const sortBufferSize = parseFloat(varsMap.sort_buffer_size || 262144);
    const joinBufferSize = parseFloat(varsMap.join_buffer_size || 262144);
    const readBufferSize = parseFloat(varsMap.read_buffer_size || 131072);
    const readRndBufferSize = parseFloat(varsMap.read_rnd_buffer_size || 262144);
    const threadStack = parseFloat(varsMap.thread_stack || 294912);
    const binlogCache = parseFloat(varsMap.binlog_cache_size || 32768);

    const globalBuffers = bufferPoolSize + keyBufferSize + logBufferSize;
    const perThreadBuffers = sortBufferSize + joinBufferSize + readBufferSize +
      readRndBufferSize + threadStack + binlogCache;
    const maxPossibleRam = globalBuffers + (maxConnections * perThreadBuffers);
    const maxRamGb = (maxPossibleRam / 1024 / 1024 / 1024).toFixed(2);
    const perConnMb = (perThreadBuffers / 1024 / 1024).toFixed(2);

    if (parseFloat(perConnMb) > 16.0) {
      issues.push({
        code: 'PER_CONNECTION_BUFFERS_EXCESSIVE',
        title: `High per-connection buffer allocation (${perConnMb} MB per connection)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Memory Sizing',
        details: `Per-thread buffers (sort, join, read_rnd) sum up to ${perConnMb} MB. ` +
          `With max_connections = ${maxConnections}, potential peak RAM is ${maxRamGb} GB!`,
        recommendation: `Keep sort_buffer_size and join_buffer_size <= 2M unless running complex OLAP batch jobs.`,
        fixSql: `SET GLOBAL sort_buffer_size = 2 * 1024 * 1024; SET GLOBAL join_buffer_size = 2 * 1024 * 1024;`
      });
    }

    // 2. Buffer Pool Instances Optimization (WARNING)
    const bufferPoolGb = bufferPoolSize / 1024 / 1024 / 1024;
    const bpInstances = parseInt(varsMap.innodb_buffer_pool_instances || 1, 10);
    if (bufferPoolGb >= 1.0 && bpInstances === 1) {
      issues.push({
        code: 'INNODB_BUFFER_POOL_INSTANCES_LOW',
        title: `Single Buffer Pool Instance for ${bufferPoolGb.toFixed(1)} GB Pool`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Concurrency & Memory',
        details: `Buffer pool size is ${bufferPoolGb.toFixed(1)} GB but configured with only 1 instance. ` +
          `Concurrent queries will contend for the single buffer pool mutex.`,
        recommendation: `Set 'innodb_buffer_pool_instances = 4' or '8' in my.cnf to reduce mutex contention.`,
        fixSql: `-- Add to my.cnf under [mysqld]:\n-- innodb_buffer_pool_instances = 8`
      });
    }

    // 3. Open Files Limit vs Max Connections & Table Open Cache (CRITICAL)
    const openFilesLimit = parseInt(varsMap.open_files_limit || 1024, 10);
    const tableOpenCache = parseInt(varsMap.table_open_cache || 400, 10);
    const requiredOpenFiles = (maxConnections * 5) + (tableOpenCache * 2);

    if (openFilesLimit < requiredOpenFiles) {
      issues.push({
        code: 'OPEN_FILES_LIMIT_INSUFFICIENT',
        title: `open_files_limit (${openFilesLimit}) is lower than recommended (${requiredOpenFiles})`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Operating System & Limits',
        details: `Current open_files_limit (${openFilesLimit}) risks 'Too many open files (OS errno 24)' ` +
          `error when max_connections (${maxConnections}) or table_open_cache (${tableOpenCache}) are utilized.`,
        recommendation: `Increase OS ulimit and set 'open_files_limit = 65535' ` +
          `in /etc/security/limits.conf and my.cnf.`,
        fixSql: `-- Set open_files_limit = 65535 in my.cnf and systemd mysql.service`
      });
    }

    // 4. Binary Log Expiration / Automatic Purge Check (WARNING)
    const binlogExpireSeconds = varsMap.binlog_expire_logs_seconds !== undefined
      ? parseInt(varsMap.binlog_expire_logs_seconds, 10)
      : null;
    const expireLogsDays = varsMap.expire_logs_days !== undefined
      ? parseInt(varsMap.expire_logs_days, 10)
      : null;

    const logBinEnabled = String(varsMap.log_bin || '').toUpperCase() === 'ON' || varsMap.log_bin === '1';

    if (logBinEnabled) {
      const isUnexpired = (binlogExpireSeconds === 0) || (binlogExpireSeconds === null && expireLogsDays === 0);
      if (isUnexpired) {
        issues.push({
          code: 'BINLOG_PURGE_DISABLED',
          title: 'Binary Log Automatic Expiration is Disabled (Disk Space Exhaustion Risk)',
          severity: SEVERITY_LEVELS.WARNING,
          category: 'Storage & Maintenance',
          details: `Binary logs are never automatically deleted and will accumulate indefinitely until disk is full.`,
          recommendation: `Configure binary log retention to 3-7 days (e.g. 604800 seconds).`,
          fixSql: capabilities.isMySQL8Plus
            ? `SET GLOBAL binlog_expire_logs_seconds = 7 * 24 * 60 * 60;`
            : `SET GLOBAL expire_logs_days = 7;`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  return issues;
}

module.exports = {
  analyzeConfiguration
};
