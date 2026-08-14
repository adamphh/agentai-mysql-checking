/**
 * Query & Workload Digest Analyzer (Pillar 3).
 * Inspects statement digest metrics, slow query patterns, scan efficiency, and disk temporary tables.
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes workload query digests and execution efficiency.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @param {Object} versionAdapter - Version compatibility adapter.
 * @returns {Promise<Array>} List of detected query performance issues.
 */
async function analyzeQueryDigest(queryRunner, capabilities, versionAdapter) {
  const issues = [];

  // 1. Inspect Top Statement Digests from sys / performance_schema
  try {
    const digestSql = versionAdapter.getStatementDigestQuery(15);
    if (digestSql) {
      const rows = await queryRunner.safeQuery(digestSql);
      for (const row of rows) {
        const queryText = row.query || '';
        const execCount = parseInt(row.exec_count || 0, 10);
        const rowsExamined = parseInt(row.rows_examined || 0, 10);
        const rowsSent = parseInt(row.rows_sent || 1, 10);
        const totalLat = row.total_latency || row.total_latency_sec || 'N/A';
        const avgLat = row.avg_latency || row.avg_latency_sec || 'N/A';

        // Check Scan Efficiency: ROWS_EXAMINED vs ROWS_SENT ratio
        const scanRatio = rowsExamined / Math.max(1, rowsSent);
        if (rowsExamined > 50000 && scanRatio > 500) {
          issues.push({
            code: 'QUERY_INEFFICIENT_SCAN_RATIO',
            title: `Inefficient Query Scan: Examined ${rowsExamined.toLocaleString()} rows to return ${rowsSent} rows`,
            severity: SEVERITY_LEVELS.CRITICAL,
            category: 'Query Optimization',
            details: `Query Pattern: ${queryText.substring(0, 120)}...\n` +
              `Execution count: ${execCount}, Scan Ratio: ${Math.round(scanRatio)}:1 ` +
              `(Avg Latency: ${avgLat}, Total: ${totalLat}).`,
            recommendation: `Add composite covering index matching WHERE and ORDER BY clauses to reduce row scans.`,
            fixSql: `-- EXPLAIN ANALYZE ${queryText.substring(0, 100)};`
          });
        }

        // Check Full Table Scans in frequent queries
        const fullScan = parseInt(row.full_scan || row.no_index_used_count || 0, 10);
        if (fullScan > 50 && execCount > 100) {
          issues.push({
            code: 'QUERY_FULL_TABLE_SCAN_STORM',
            title: `Frequent Full Table Scan: ${fullScan} scans in ${execCount} executions`,
            severity: SEVERITY_LEVELS.CRITICAL,
            category: 'Query Optimization',
            details: `Query Pattern: ${queryText.substring(0, 120)}...\n` +
              `Total latency: ${totalLat}. Causes massive buffer pool page churn.`,
            recommendation: `Ensure indexed lookup is used instead of scanning the full table.`,
            fixSql: `-- EXPLAIN ${queryText.substring(0, 100)};`
          });
        }

        // Check Temporary Tables on Disk
        const tmpDiskTables = parseInt(row.tmp_disk_tables || 0, 10);
        if (tmpDiskTables > 100) {
          issues.push({
            code: 'QUERY_SPILLING_TMP_DISK_TABLES',
            title: `Query created ${tmpDiskTables} temporary tables on disk`,
            severity: SEVERITY_LEVELS.WARNING,
            category: 'Memory & Disk I/O',
            details: `Query Pattern: ${queryText.substring(0, 120)}...\n` +
              `Disk temp tables trigger synchronous I/O writes.`,
            recommendation: `Increase 'tmp_table_size' / 'max_heap_table_size' or optimize query columns.`,
            fixSql: `SET GLOBAL tmp_table_size = 64 * 1024 * 1024; SET GLOBAL max_heap_table_size = 64 * 1024 * 1024;`
          });
        }
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 2. Global Status Workload Analysis (Fallback & Global Check)
  try {
    const statusMap = await queryRunner.queryKeyValueMap(
      "SHOW GLOBAL STATUS WHERE Variable_name IN (" +
      "'Questions', 'Slow_queries', 'Select_scan', 'Select_full_join', 'Created_tmp_tables', " +
      "'Created_tmp_disk_tables', 'Sort_merge_passes')"
    );

    const questions = parseInt(statusMap.Questions || 1, 10);
    const slowQueries = parseInt(statusMap.Slow_queries || 0, 10);
    const selectScan = parseInt(statusMap.Select_scan || 0, 10);
    const selectFullJoin = parseInt(statusMap.Select_full_join || 0, 10);
    const tmpTables = parseInt(statusMap.Created_tmp_tables || 1, 10);
    const tmpDiskTables = parseInt(statusMap.Created_tmp_disk_tables || 0, 10);
    const sortMergePasses = parseInt(statusMap.Sort_merge_passes || 0, 10);

    // Full Join without Index
    if (selectFullJoin > 50) {
      issues.push({
        code: 'GLOBAL_FULL_JOINS_DETECTED',
        title: `High number of unindexed table joins detected (${selectFullJoin} joins)`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Query Optimization',
        details: `Server performed ${selectFullJoin} joins without indexes on join keys (Cartesian product risk).`,
        recommendation: `Add indexes to all JOIN ON foreign key and reference columns.`,
        fixSql: `-- Check tables involved in multi-table queries without foreign key indexes`
      });
    }

    // High disk temporary table ratio
    const diskTmpRatio = (tmpDiskTables / Math.max(1, tmpTables)) * 100;
    if (diskTmpRatio > 25 && tmpDiskTables > 500) {
      issues.push({
        code: 'GLOBAL_HIGH_TMP_DISK_RATIO',
        title: `High Disk Temporary Table Ratio (${diskTmpRatio.toFixed(1)}% on disk)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Memory & Disk I/O',
        details: `${tmpDiskTables.toLocaleString()} out of ${tmpTables.toLocaleString()} temporary tables ` +
          `were written to disk because they exceeded in-memory limits or contained BLOB/TEXT columns.`,
        recommendation: `Tune 'tmp_table_size' and 'max_heap_table_size', avoid SELECT * on large text columns.`,
        fixSql: `SET GLOBAL tmp_table_size = 64 * 1024 * 1024; SET GLOBAL max_heap_table_size = 64 * 1024 * 1024;`
      });
    }

    // Sort merge passes (sort buffer overflow)
    if (sortMergePasses > 500) {
      issues.push({
        code: 'GLOBAL_SORT_MERGE_PASSES_HIGH',
        title: `Frequent sort buffer disk merges (${sortMergePasses.toLocaleString()} passes)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Memory & Disk I/O',
        details: `Sorting operations exceeded 'sort_buffer_size' and had to create temporary merge files on disk.`,
        recommendation: `Add indexes supporting ORDER BY clauses or adjust 'sort_buffer_size' cautiously.`,
        fixSql: `SET GLOBAL sort_buffer_size = 4 * 1024 * 1024;`
      });
    }

    // Slow query ratio
    const slowRatio = (slowQueries / Math.max(1, questions)) * 100;
    if (slowRatio > 1.0 && slowQueries > 100) {
      issues.push({
        code: 'GLOBAL_SLOW_QUERY_RATIO_HIGH',
        title: `High Slow Query Ratio (${slowRatio.toFixed(2)}% of total queries exceed long_query_time)`,
        severity: SEVERITY_LEVELS.WARNING,
        category: 'Query Optimization',
        details: `${slowQueries.toLocaleString()} slow queries recorded out of ${questions.toLocaleString()} queries.`,
        recommendation: `Enable slow query log with 'long_query_time = 1' and inspect slow log entries.`,
        fixSql: `SET GLOBAL slow_query_log = 'ON'; SET GLOBAL long_query_time = 1.0;`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  return issues;
}

module.exports = {
  analyzeQueryDigest
};
