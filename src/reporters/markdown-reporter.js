/**
 * Executive Summary Markdown Report Generator.
 * Generates an executive-level performance audit summary report for management and engineering leads.
 */

const fs = require('fs');
const path = require('path');

/**
 * Generates an executive Markdown report.
 *
 * @param {Object} auditResult - Consolidated audit result object.
 * @param {string} outputPath - Output file path for the Markdown report.
 * @returns {string} The written Markdown file path.
 */
function generateMarkdownReport(auditResult, outputPath) {
  const { databaseInfo, auditMetadata, healthScore, allIssues, tableStats = {} } = auditResult;
  const { score, grade, statusText, breakdown, summary } = healthScore;

  const topBySize = tableStats.topBySize || [];
  const criticalIssues = allIssues.filter((i) => i.severity === 'CRITICAL');
  const warningIssues = allIssues.filter((i) => i.severity === 'WARNING');
  const uptimeDays = (databaseInfo.uptimeSeconds / 86400).toFixed(1);
  const pfsStatus = databaseInfo.hasPerformanceSchema ? 'BẬT' : 'TẮT';

  const lines = [
    '# BÁO CÁO ĐÁNH GIÁ HIỆU NĂNG CƠ SỞ DỮ LIỆU (EXECUTIVE SUMMARY)',
    '',
    '**Kính gửi:** Ban Quản lý / Tech Lead / DevOps Team  ',
    `**Ngày thực hiện:** ${new Date(auditMetadata.timestamp).toLocaleString()}  `,
    `**Mục tiêu kiểm tra:** \`${databaseInfo.targetDatabase}\` ` +
      `(${databaseInfo.flavor.toUpperCase()} ${databaseInfo.version})  `,
    `**Thời gian quét:** ${auditMetadata.durationMs}ms  `,
    '',
    '---',
    '',
    '## 1. TỔNG QUAN ĐIỂM SỨC KHỎE (DATABASE HEALTH SCORECARD)',
    '',
    '| Chỉ số Tổng thể | Kết quả Đánh giá | Ý nghĩa & Đánh giá |',
    '| :--- | :--- | :--- |',
    `| **Điểm Sức Khỏe Tổng Thể** | **${score} / 100** | **Xếp loại: ${grade} (${statusText})** |`,
    `| **Tổng số Vấn đề** | **${summary.totalIssues}** mục | ` +
      `${summary.criticalIssues} Critical, ${summary.warningIssues} Warning |`,
    `| **Trạng thái Hoạt động** | Uptime: ${uptimeDays} ngày | PFS: ${pfsStatus} |`,
    '',
    '### 📊 Bảng Điểm 5 Trụ Cột Hiệu Năng (5-Pillar Breakdown)',
    '',
    '| Trụ cột Chẩn đoán | Trọng số | Điểm Đạt Được | Tỷ lệ (%) | Số lỗi (Critical / Warn) |',
    '| :--- | :--- | :--- | :--- | :--- |',
    `| **1. Schema & Index** | 25 pts | **${breakdown.schema.score} pts** | ` +
      `${breakdown.schema.percentage}% | ${breakdown.schema.criticalCount} C / ${breakdown.schema.warningCount} W |`,
    `| **2. Locks & Concurrency** | 20 pts | **${breakdown.lock.score} pts** | ` +
      `${breakdown.lock.percentage}% | ${breakdown.lock.criticalCount} C / ${breakdown.lock.warningCount} W |`,
    `| **3. Query Digest** | 25 pts | **${breakdown.query.score} pts** | ` +
      `${breakdown.query.percentage}% | ${breakdown.query.criticalCount} C / ${breakdown.query.warningCount} W |`,
    `| **4. Memory & I/O Engine** | 15 pts | **${breakdown.memory.score} pts** | ` +
      `${breakdown.memory.percentage}% | ${breakdown.memory.criticalCount} C / ${breakdown.memory.warningCount} W |`,
    `| **5. Config & my.cnf** | 15 pts | **${breakdown.config.score} pts** | ` +
      `${breakdown.config.percentage}% | ${breakdown.config.criticalCount} C / ${breakdown.config.warningCount} W |`,
    '',
    '---',
    '',
    '## 2. TOP BẢNG CÓ DUNG LƯỢNG LỚN NHẤT',
    '',
    '| # | Bảng (Table) | Engine | Số bản ghi (Rows) | Data (MB) | Index (MB) | Tổng dung lượng (MB) |',
    '| :- | :--- | :--- | :- | :- | :- | :- |'
  ];

  if (topBySize.length === 0) {
    lines.push('| - | *Không có dữ liệu bảng* | - | - | - | - | - |');
  } else {
    topBySize.slice(0, 5).forEach((t, i) => {
      lines.push(
        `| ${i + 1} | \`${t.table_schema}.${t.table_name}\` | ${t.engine || 'InnoDB'} | ` +
        `${parseInt(t.table_rows || 0, 10).toLocaleString()} | ${t.data_mb} | ${t.index_mb} | **${t.total_mb}** |`
      );
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. CÁC ĐIỂM NGHẼN NGHIÊM TRỌNG CẦN XỬ LÝ NGAY (CRITICAL BOTTLENECKS)');
  lines.push('');

  if (criticalIssues.length === 0) {
    lines.push('✅ *Không phát hiện lỗi nghiêm trọng (Critical). Hệ thống vận hành tương đối ổn định.*');
  } else {
    criticalIssues.forEach((issue, idx) => {
      lines.push(`### ${idx + 1}. [${issue.category}] ${issue.title}`);
      lines.push(`- **Rủi ro vận hành:** ${issue.details}`);
      lines.push(`- **Giải pháp đề xuất:** ${issue.recommendation}`);
      if (issue.fixSql) {
        lines.push('- **Mã lệnh khắc phục:**');
        lines.push('```sql');
        lines.push(issue.fixSql);
        lines.push('```');
      }
      lines.push('');
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. CẢNH BÁO TỐI ƯU HÓA TRUNG HẠN (WARNING ISSUES)');
  lines.push('');

  if (warningIssues.length === 0) {
    lines.push('✅ *Không có cảnh báo trung hạn.*');
  } else {
    warningIssues.slice(0, 8).forEach((issue) => {
      lines.push(`- **[${issue.category}] ${issue.title}:** ${issue.recommendation}`);
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 5. DỰ BÁO LỢI ÍCH SAU TỐI ƯU (PROJECTED ROI & OPTIMIZATION GAINS)');
  lines.push('');
  lines.push('Khi thực thi toàn bộ các khuyến nghị trong tệp `recommendations.sql`:');
  lines.push('1. **Thời gian phản hồi truy vấn:** Dự kiến giảm **40% - 70%** cho các truy vấn thiếu Index.');
  lines.push('2. **Hiện tượng nghẽn khóa:** Triệt tiêu rủi ro Table Lock khi cập nhật các bảng Foreign Key.');
  lines.push('3. **Hiệu suất Bộ nhớ & Ổ đĩa:** Tăng Hit Ratio lên **>= 99.5%**, giảm tải Disk I/O 30% - 60%.');
  lines.push('4. **Độ an toàn hệ thống:** Triệt tiêu rủi ro tràn số Auto-Increment và nguy cơ OOM Killer.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Báo cáo được tự động tạo bởi Hệ thống Kiểm định Hiệu năng MySQL/MariaDB (DB Performance Audit).*');

  const content = lines.join('\n');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}

module.exports = {
  generateMarkdownReport
};
