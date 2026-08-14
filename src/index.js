/**
 * Programmatic Node.js API for MySQL & MariaDB Performance Audit Engine.
 */

const { createConnectionPool, testConnection } = require('./core/database');
const { QueryRunner } = require('./core/query-runner');
const { probeCapabilities } = require('./core/capability-probe');
const { createVersionAdapter } = require('./core/version-adapter');
const { calculateHealthScore } = require('./core/scorer');
const { runFullAudit } = require('./analyzers');
const {
  exportAllReports,
  generateHtmlReport,
  generateMarkdownReport,
  generateSqlFixReport,
  generateJsonReport
} = require('./reporters');

/**
 * Audits a database programmatically and exports reports.
 *
 * @param {Object} dbConfig - Database connection config.
 * @param {Object} [auditOptions={}] - Audit and report options.
 * @returns {Promise<{auditResult: Object, generatedFiles: Object}>} Audit result and file paths.
 */
async function auditDatabase(dbConfig, auditOptions = {}) {
  const pool = createConnectionPool(dbConfig);
  try {
    const connTest = await testConnection(pool);
    if (!connTest.success) {
      throw new Error(`Database connection failed: ${connTest.error}`);
    }

    const queryRunner = new QueryRunner(pool, { timeout: auditOptions.timeout || 5000 });
    const capabilities = await probeCapabilities(queryRunner);
    const versionAdapter = createVersionAdapter(capabilities);

    const auditResult = await runFullAudit(queryRunner, capabilities, versionAdapter, {
      targetDatabase: dbConfig.database || null,
      quick: auditOptions.quick || false
    });

    const generatedFiles = exportAllReports(auditResult, {
      outputDir: auditOptions.outputDir || './reports',
      format: auditOptions.format || 'all'
    });

    return {
      auditResult,
      generatedFiles
    };
  } finally {
    await pool.end();
  }
}

module.exports = {
  auditDatabase,
  createConnectionPool,
  testConnection,
  QueryRunner,
  probeCapabilities,
  createVersionAdapter,
  calculateHealthScore,
  runFullAudit,
  exportAllReports,
  generateHtmlReport,
  generateMarkdownReport,
  generateSqlFixReport,
  generateJsonReport
};