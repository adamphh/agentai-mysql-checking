/**
 * Master Performance Audit Runner.
 * Coordinates all 5 diagnostic analyzers and aggregates health score and findings.
 */

const { analyzeSchemaAndIndexes } = require('./schema-index');
const { analyzeLocksAndConcurrency } = require('./lock-wait');
const { analyzeQueryDigest } = require('./query-digest');
const { analyzeMemoryAndIO } = require('./memory-io');
const { analyzeConfiguration } = require('./config-tuner');
const { calculateHealthScore } = require('../core/scorer');

/**
 * Runs a complete 5-pillar database performance audit.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @param {Object} versionAdapter - Version compatibility adapter.
 * @param {Object} [options={}] - Audit options.
 * @param {string} [options.targetDatabase] - Specific database name.
 * @param {boolean} [options.quick=false] - Quick scan mode.
 * @returns {Promise<Object>} Full aggregated audit results and health report.
 */
async function runFullAudit(queryRunner, capabilities, versionAdapter, options = {}) {
  const targetDatabase = options.targetDatabase || null;
  const startTime = Date.now();

  console.log('🔍 [1/5] Analyzing Schema & Index bottlenecks and Top Tables...');
  let schemaIssues = [];
  let tableStats = { topBySize: [], topByRows: [], topByFragmentation: [], unusedIndexes: [] };
  try {
    const schemaRes = await analyzeSchemaAndIndexes(queryRunner, capabilities, versionAdapter, targetDatabase);
    if (schemaRes && schemaRes.issues) {
      schemaIssues = schemaRes.issues;
      tableStats = schemaRes.tableStats || tableStats;
    } else if (Array.isArray(schemaRes)) {
      schemaIssues = schemaRes;
    }
  } catch (err) {
    console.warn('⚠️ Schema analyzer encountered error:', err.message);
  }

  console.log('🔒 [2/5] Analyzing Concurrency, Locks & Wait events...');
  let lockIssues = [];
  try {
    lockIssues = await analyzeLocksAndConcurrency(queryRunner, capabilities, versionAdapter);
  } catch (err) {
    console.warn('⚠️ Lock analyzer encountered error:', err.message);
  }

  console.log('⏱️ [3/5] Analyzing Query Performance & Statement Digest...');
  let queryIssues = [];
  try {
    queryIssues = await analyzeQueryDigest(queryRunner, capabilities, versionAdapter);
  } catch (err) {
    console.warn('⚠️ Query digest analyzer encountered error:', err.message);
  }

  console.log('💾 [4/5] Analyzing InnoDB Memory, Workload & I/O Engine...');
  let memoryIssues = [];
  let ioTelemetry = {
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
    diagnostics: { status: 'HEALTHY', summary: '', recommendation: '' }
  };
  try {
    const memRes = await analyzeMemoryAndIO(queryRunner, capabilities);
    if (memRes && memRes.issues) {
      memoryIssues = memRes.issues;
      ioTelemetry = memRes.telemetry || ioTelemetry;
    } else if (Array.isArray(memRes)) {
      memoryIssues = memRes;
    }
  } catch (err) {
    console.warn('⚠️ Memory/IO analyzer encountered error:', err.message);
  }

  console.log('⚙️ [5/5] Analyzing Database Configuration & my.cnf tuning...');
  let configIssues = [];
  try {
    configIssues = await analyzeConfiguration(queryRunner, capabilities);
  } catch (err) {
    console.warn('⚠️ Config tuner analyzer encountered error:', err.message);
  }

  const pillarFindings = {
    schema: schemaIssues,
    lock: lockIssues,
    query: queryIssues,
    memory: memoryIssues,
    config: configIssues
  };

  const healthScore = calculateHealthScore(pillarFindings);
  const durationMs = Date.now() - startTime;

  return {
    databaseInfo: {
      flavor: capabilities.flavor,
      version: capabilities.version,
      hasPerformanceSchema: capabilities.hasPerformanceSchema,
      hasSysSchema: capabilities.hasSysSchema,
      uptimeSeconds: capabilities.uptimeSeconds,
      targetDatabase: targetDatabase || 'ALL DATABASES'
    },
    auditMetadata: {
      timestamp: new Date().toISOString(),
      durationMs,
      quickMode: options.quick || false
    },
    healthScore,
    tableStats,
    ioTelemetry,
    findings: pillarFindings,
    allIssues: [
      ...schemaIssues.map((i) => ({ ...i, pillar: 'schema' })),
      ...lockIssues.map((i) => ({ ...i, pillar: 'lock' })),
      ...queryIssues.map((i) => ({ ...i, pillar: 'query' })),
      ...memoryIssues.map((i) => ({ ...i, pillar: 'memory' })),
      ...configIssues.map((i) => ({ ...i, pillar: 'config' }))
    ]
  };
}

module.exports = {
  runFullAudit
};
