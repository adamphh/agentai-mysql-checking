/**
 * Phased SQL Fix Script Generator.
 * Generates production-safe recommendations.sql grouped into 4 execution phases with rollback commands.
 */

const fs = require('fs');
const path = require('path');

/**
 * Generates a phased SQL remediation script.
 *
 * @param {Object} auditResult - Consolidated audit result object.
 * @param {string} outputPath - Output file path for the SQL file.
 * @returns {string} The written SQL file path.
 */
function generateSqlFixReport(auditResult, outputPath) {
  const { allIssues, databaseInfo } = auditResult;

  const phase1OnlineDdl = [];
  const phase2Maintenance = [];
  const phase3DynamicConfig = [];
  const phase4PersistentConfig = [];

  for (const issue of allIssues) {
    if (!issue.fixSql || issue.fixSql.startsWith('-- Check') || issue.fixSql.startsWith('-- Enforce')) {
      continue;
    }

    const sql = issue.fixSql.trim();
    if (sql.includes('ADD INDEX') || (sql.includes('ALTER TABLE') && sql.includes('ALGORITHM=INPLACE'))) {
      phase1OnlineDdl.push({ issue, sql });
    } else if (sql.includes('DROP INDEX') || sql.includes('ENGINE=InnoDB') || sql.includes('PRIMARY KEY')) {
      phase2Maintenance.push({ issue, sql });
    } else if (sql.startsWith('SET GLOBAL')) {
      phase3DynamicConfig.push({ issue, sql });
    } else {
      phase4PersistentConfig.push({ issue, sql });
    }
  }

  let content = `-- ==============================================================================
-- DATABASE PERFORMANCE REMEDIATION SCRIPT (AUTO-GENERATED)
-- Database: ${databaseInfo.targetDatabase} (${databaseInfo.flavor.toUpperCase()} ${databaseInfo.version})
-- Generated at: ${new Date().toISOString()}
-- ==============================================================================
-- LƯU Ý QUAN TRỌNG TRƯỚC KHI THỰC THI:
-- 1. Luôn kiểm tra và test trên môi trường Staging/UAT trước khi áp dụng Production.
-- 2. Đọc kỹ từng Phase thực thi bên dưới để đảm bảo không làm gián đoạn dịch vụ.
-- ==============================================================================

`;

  // PHASE 1: Online DDL
  content += `\n-- ==============================================================================
-- PHASE 1: ZERO-DOWNTIME ONLINE DDL (Thực thi ngay mà không khóa bảng)
-- ==============================================================================\n`;
  if (phase1OnlineDdl.length === 0) {
    content += `-- Không có thao tác Online DDL nào cần thực hiện.\n`;
  } else {
    for (const item of phase1OnlineDdl) {
      content += `\n-- [${item.issue.severity}] ${item.issue.title}\n`;
      content += `${item.sql}\n`;
    }
  }

  // PHASE 2: Maintenance Window
  content += `\n-- ==============================================================================
-- PHASE 2: MAINTENANCE WINDOW REQUIRED (Cần chạy trong khung giờ bảo trì/ít tải)
-- ==============================================================================\n`;
  if (phase2Maintenance.length === 0) {
    content += `-- Không có thao tác bảo trì cấu trúc nào cần thực hiện.\n`;
  } else {
    for (const item of phase2Maintenance) {
      content += `\n-- [${item.issue.severity}] ${item.issue.title}\n`;
      content += `-- Ghi chú: ${item.issue.details}\n`;
      content += `${item.sql}\n`;
    }
  }

  // PHASE 3: Dynamic Runtime Config
  content += `\n-- ==============================================================================
-- PHASE 3: DYNAMIC RUNTIME CONFIGURATION (Có hiệu lực ngay, không cần khởi động lại)
-- ==============================================================================\n`;
  if (phase3DynamicConfig.length === 0) {
    content += `-- Không có tham số runtime động nào cần điều chỉnh.\n`;
  } else {
    for (const item of phase3DynamicConfig) {
      content += `\n-- [${item.issue.severity}] ${item.issue.title}\n`;
      content += `${item.sql}\n`;
    }
  }

  // PHASE 4: Persistent Server Config
  content += `\n-- ==============================================================================
-- PHASE 4: PERSISTENT CONFIGURATION (Cần thêm vào /etc/mysql/my.cnf dưới [mysqld])
-- ==============================================================================\n`;
  if (phase4PersistentConfig.length === 0) {
    content += `-- Không có cấu hình my.cnf nào cần ghi đè.\n`;
  } else {
    for (const item of phase4PersistentConfig) {
      content += `\n-- [${item.issue.severity}] ${item.issue.title}\n`;
      content += `${item.sql}\n`;
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}

module.exports = {
  generateSqlFixReport
};
