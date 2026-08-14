/**
 * Structured JSON Report Generator.
 * Exports machine-readable audit metrics for CI/CD pipelines and external monitoring systems.
 */

const fs = require('fs');
const path = require('path');

/**
 * Generates a JSON report file.
 *
 * @param {Object} auditResult - Consolidated audit result object.
 * @param {string} outputPath - Output file path for the JSON file.
 * @returns {string} The written JSON file path.
 */
function generateJsonReport(auditResult, outputPath) {
  const jsonString = JSON.stringify(auditResult, null, 2);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonString, 'utf8');
  return outputPath;
}

module.exports = {
  generateJsonReport
};
