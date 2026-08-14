/**
 * Master Report Exporter.
 * Coordinates generation of HTML, Markdown, SQL remediation, and JSON reports.
 */

const path = require('path');
const { generateHtmlReport } = require('./html-reporter');
const { generateMarkdownReport } = require('./markdown-reporter');
const { generateSqlFixReport } = require('./sql-fix-reporter');
const { generateJsonReport } = require('./json-reporter');

/**
 * Generates all requested report deliverables for an audit result.
 *
 * @param {Object} auditResult - Consolidated audit result object.
 * @param {Object} [options={}] - Reporting options.
 * @param {string} [options.outputDir='./reports'] - Output directory.
 * @param {string} [options.format='all'] - Formats to generate ('all' | 'html' | 'md' | 'sql' | 'json').
 * @returns {Object} Paths of all generated report files.
 */
function exportAllReports(auditResult, options = {}) {
  const outputDir = options.outputDir || './reports';
  const format = (options.format || 'all').toLowerCase();

  const generatedFiles = {};

  if (format === 'all' || format.includes('html')) {
    const htmlPath = path.join(outputDir, 'audit-report.html');
    generateHtmlReport(auditResult, htmlPath);
    generatedFiles.html = htmlPath;
  }

  if (format === 'all' || format.includes('md') || format.includes('markdown')) {
    const mdPath = path.join(outputDir, 'EXECUTIVE_SUMMARY.md');
    generateMarkdownReport(auditResult, mdPath);
    generatedFiles.markdown = mdPath;
  }

  if (format === 'all' || format.includes('sql')) {
    const sqlPath = path.join(outputDir, 'recommendations.sql');
    generateSqlFixReport(auditResult, sqlPath);
    generatedFiles.sql = sqlPath;
  }

  if (format === 'all' || format.includes('json')) {
    const jsonPath = path.join(outputDir, 'audit-report.json');
    generateJsonReport(auditResult, jsonPath);
    generatedFiles.json = jsonPath;
  }

  return generatedFiles;
}

module.exports = {
  exportAllReports,
  generateHtmlReport,
  generateMarkdownReport,
  generateSqlFixReport,
  generateJsonReport
};
