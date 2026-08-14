/**
 * Command-Line Interface (CLI) for MySQL & MariaDB Performance Audit Engine.
 */

try {
  require('dotenv').config();
} catch (err) {
  // Ignore if dotenv is not installed
}
const path = require('path');
const { createConnectionPool, testConnection } = require('./core/database');
const { QueryRunner } = require('./core/query-runner');
const { probeCapabilities } = require('./core/capability-probe');
const { createVersionAdapter } = require('./core/version-adapter');
const { runFullAudit } = require('./analyzers');
const { exportAllReports } = require('./reporters');

/**
 * Parses CLI command line arguments.
 *
 * @param {Array<string>} argv - Argument vector.
 * @returns {Object} Parsed configuration object.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const config = {
    host: process.env.DB_HOST || process.env.MYSQL_LOCAL_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || process.env.MYSQL_LOCAL_PORT || 3306, 10),
    user: process.env.DB_USER || process.env.MYSQL_LOCAL_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_LOCAL_PASSWORD || '',
    database: process.env.DB_NAME || '',
    outputDir: './reports',
    format: 'all',
    quick: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--host') config.host = args[++i];
    else if (arg.startsWith('--host=')) config.host = arg.split('=')[1];
    else if (arg === '-P' || arg === '--port') config.port = parseInt(args[++i], 10);
    else if (arg.startsWith('--port=')) config.port = parseInt(arg.split('=')[1], 10);
    else if (arg === '-u' || arg === '--user') config.user = args[++i];
    else if (arg.startsWith('--user=')) config.user = arg.split('=')[1];
    else if (arg === '-p' || arg === '--password') config.password = args[++i];
    else if (arg.startsWith('--password=')) config.password = arg.split('=')[1];
    else if (arg === '-d' || arg === '--database') config.database = args[++i];
    else if (arg.startsWith('--database=')) config.database = arg.split('=')[1];
    else if (arg === '-o' || arg === '--output-dir') config.outputDir = args[++i];
    else if (arg.startsWith('--output-dir=')) config.outputDir = arg.split('=')[1];
    else if (arg === '-f' || arg === '--format') config.format = args[++i];
    else if (arg.startsWith('--format=')) config.format = arg.split('=')[1];
    else if (arg === '-q' || arg === '--quick') config.quick = true;
    else if (arg === '--help') config.help = true;
  }

  return config;
}

/**
 * Prints CLI help instructions.
 */
function printHelp() {
  console.log(`
⚡ MySQL & MariaDB Performance Audit & Diagnostic Engine
Usage: node bin/db-audit.js [options]

Options:
  -h, --host <host>          Database host (default: 127.0.0.1)
  -P, --port <port>          Database port (default: 3306)
  -u, --user <user>          Database username (default: root)
  -p, --password <password>  Database password
  -d, --database <database>  Target database name to audit
  -o, --output-dir <dir>     Output directory for reports (default: ./reports)
  -f, --format <formats>     Report formats: all, html, md, sql, json (default: all)
  -q, --quick                Run quick audit (skip intensive table fragmentation checks)
  --help                     Show this help message
  `);
}

/**
 * Main CLI execution entry point.
 */
async function main() {
  const config = parseArgs(process.argv);

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\n================================================================');
  console.log('⚡ MySQL & MariaDB Performance Audit & Diagnostics Engine');
  console.log('================================================================');
  console.log(`📡 Connecting to ${config.host}:${config.port} (User: ${config.user})...`);

  const pool = createConnectionPool(config);
  const connTest = await testConnection(pool);

  if (!connTest.success) {
    console.error(`❌ Connection failed: ${connTest.error}`);
    console.error('💡 Please verify your database credentials and ensure the MySQL server is running.\n');
    await pool.end();
    process.exit(1);
  }

  console.log('✅ Connection established successfully.');
  const queryRunner = new QueryRunner(pool, { timeout: 5000 });

  console.log('🔎 Probing database engine version and capabilities...');
  const capabilities = await probeCapabilities(queryRunner);
  console.log(`📊 Detected: ${capabilities.flavor.toUpperCase()} ${capabilities.version}` +
    ` (Performance Schema: ${capabilities.hasPerformanceSchema ? 'ON' : 'OFF'}, ` +
    `sys schema: ${capabilities.hasSysSchema ? 'Accessible' : 'Unavailable'})`);

  const versionAdapter = createVersionAdapter(capabilities);

  console.log('\n🚀 Starting 5-Pillar Comprehensive Performance Audit...');
  const auditResult = await runFullAudit(queryRunner, capabilities, versionAdapter, {
    targetDatabase: config.database || null,
    quick: config.quick
  });

  const { score, grade, statusText, summary } = auditResult.healthScore;

  console.log('\n================================================================');
  console.log(`🏁 AUDIT COMPLETE! Health Score: ${score}/100 [Grade: ${grade} - ${statusText}]`);
  console.log(`📋 Total Findings: ${summary.totalIssues} ` +
    `(${summary.criticalIssues} Critical, ${summary.warningIssues} Warnings, ${summary.infoIssues} Info)`);
  console.log('================================================================');

  console.log('\n📁 Generating deliverable reports...');
  const generatedFiles = exportAllReports(auditResult, {
    outputDir: path.resolve(process.cwd(), config.outputDir),
    format: config.format
  });

  for (const [type, filePath] of Object.entries(generatedFiles)) {
    console.log(`  📄 [${type.toUpperCase()}] ${filePath}`);
  }

  console.log('\n✨ All reports generated successfully! Ready for executive presentation.\n');
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('💥 Fatal audit error:', err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  main
};
