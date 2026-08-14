/**
 * Standalone Interactive HTML Report Generator with Multi-Tab Navigation.
 * Generates an offline-ready single-file dashboard integrating Overview, Workload & I/O Telemetry,
 * Top Tables Analytics, Executive Summary, SQL Remediation, Scoring Methodology, and Raw JSON.
 */

const fs = require('fs');
const path = require('path');

/**
 * Escapes HTML entities to prevent XSS.
 *
 * @param {string} str - Raw string.
 * @returns {string} Escaped HTML string.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates a standalone HTML performance audit dashboard with integrated tabs.
 *
 * @param {Object} auditResult - Consolidated audit result object.
 * @param {string} outputPath - Output file path for the HTML report.
 * @returns {string} The written HTML file path.
 */
function generateHtmlReport(auditResult, outputPath) {
  const {
    databaseInfo,
    auditMetadata,
    healthScore,
    allIssues,
    tableStats = {},
    ioTelemetry = {}
  } = auditResult;

  const { score, grade, statusText, color, breakdown, summary } = healthScore;

  const topBySize = tableStats.topBySize || [];
  const topByRows = tableStats.topByRows || [];
  const topByFrag = tableStats.topByFragmentation || [];
  const unusedIdxs = tableStats.unusedIndexes || [];

  const wl = ioTelemetry.workload || {
    statement: { selects: 0, writes: 0, total: 0, readPct: 100, writePct: 0 },
    row: { rowsRead: 0, rowsWritten: 0, total: 0, readPct: 100, writePct: 0 },
    profile: 'READ_HEAVY'
  };
  const mem = ioTelemetry.memory || {
    bufferPoolMb: 0,
    bufferPoolGb: 0,
    readRequests: 0,
    diskReads: 0,
    memoryHitRatio: 100,
    diskReadRatio: 0,
    dirtyPagesPct: 0,
    redoLogWaits: 0
  };
  const diag = ioTelemetry.diagnostics || {
    status: 'HEALTHY',
    summary: 'Hiệu suất bộ nhớ tối ưu.',
    recommendation: 'Duy trì cấu hình hiện tại.'
  };

  const criticalIssues = allIssues.filter((i) => i.severity === 'CRITICAL');
  const warningIssues = allIssues.filter((i) => i.severity === 'WARNING');

  // Build SQL script content for SQL Tab
  const sqlLines = [
    `-- ==============================================================================`,
    `-- DATABASE PERFORMANCE REMEDIATION SCRIPT`,
    `-- Database: ${databaseInfo.targetDatabase} (${databaseInfo.flavor.toUpperCase()} ${databaseInfo.version})`,
    `-- Generated: ${new Date(auditMetadata.timestamp).toISOString()}`,
    `-- ==============================================================================\n`
  ];

  const p1 = allIssues.filter((i) => i.fixSql && i.fixSql.includes('ADD INDEX'));
  const p2 = allIssues.filter((i) => i.fixSql && (i.fixSql.includes('DROP INDEX') || i.fixSql.includes('ENGINE=')));
  const p3 = allIssues.filter((i) => i.fixSql && i.fixSql.startsWith('SET GLOBAL'));

  sqlLines.push(`-- === PHASE 1: ZERO-DOWNTIME ONLINE DDL (Thực thi ngay) ===`);
  if (p1.length === 0) sqlLines.push(`-- Không có thao tác Online DDL nào.`);
  else p1.forEach((i) => sqlLines.push(`-- [${i.severity}] ${i.title}\n${i.fixSql}\n`));

  sqlLines.push(`\n-- === PHASE 2: MAINTENANCE WINDOW REQUIRED (Bảo trì cấu trúc) ===`);
  if (p2.length === 0) sqlLines.push(`-- Không có thao tác bảo trì nào.`);
  else p2.forEach((i) => sqlLines.push(`-- [${i.severity}] ${i.title}\n${i.fixSql}\n`));

  sqlLines.push(`\n-- === PHASE 3: DYNAMIC RUNTIME CONFIGURATION (SET GLOBAL) ===`);
  if (p3.length === 0) sqlLines.push(`-- Không có cấu hình dynamic nào.`);
  else p3.forEach((i) => sqlLines.push(`-- [${i.severity}] ${i.title}\n${i.fixSql}\n`));

  const fullSqlText = sqlLines.join('\n');
  const jsonRawText = JSON.stringify(auditResult, null, 2);

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MySQL &amp; MariaDB Performance Audit &amp; Health Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --critical: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --success: #10b981;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body { background: var(--bg); color: var(--text-main); line-height: 1.5; padding: 20px 16px; }
    .container { max-width: 1200px; margin: 0 auto; }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header h1 { font-size: 22px; font-weight: 700; color: #fff; }
    .meta-badge {
      background: #334155;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13px;
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .meta-badge strong { color: #fff; }

    /* Top Navigation Tabs */
    .nav-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid var(--card-border);
      margin-bottom: 24px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: transparent;
      color: var(--text-muted);
      border: none;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px 8px 0 0;
      transition: all 0.2s;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
    .tab-btn.active {
      color: var(--primary);
      background: var(--card-bg);
      border-bottom: 2px solid var(--primary);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Grid & Cards */
    .hero-grid { display: grid; grid-template-columns: 320px 1fr; gap: 20px; margin-bottom: 20px; }
    @media (max-width: 860px) { .hero-grid { grid-template-columns: 1fr; } }
    
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 20px; }
    
    .score-card {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .score-ring {
      width: 130px;
      height: 130px;
      border-radius: 50%;
      border: 8px solid ${color};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 12px 0;
      background: rgba(0,0,0,0.2);
    }
    .score-value { font-size: 38px; font-weight: 800; color: ${color}; line-height: 1; }
    .score-max { font-size: 13px; color: var(--text-muted); }
    .score-grade { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .score-status {
      font-size: 11px;
      letter-spacing: 1px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (max-width: 600px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
    .stat-box {
      background: rgba(15, 23, 42, 0.6);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .stat-box:hover { border-color: var(--primary); transform: translateY(-2px); }
    .stat-num { font-size: 22px; font-weight: 700; }
    .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }

    .pillar-list { display: flex; flex-direction: column; gap: 10px; }
    .pillar-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 6px;
    }
    .pillar-item:hover { background: rgba(255,255,255,0.03); }
    .pillar-header { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
    .progress-track { width: 100%; height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }

    /* Workload & I/O Widget Bar */
    .telemetry-summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    @media (max-width: 768px) { .telemetry-summary-grid { grid-template-columns: 1fr; } }
    .telemetry-widget {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .telemetry-widget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
    }
    .split-progress {
      width: 100%;
      height: 12px;
      background: #334155;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
    }
    .split-fill-left { height: 100%; transition: width 0.3s ease; }
    .split-fill-right { height: 100%; transition: width 0.3s ease; }

    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .filter-btn {
      background: #334155;
      color: var(--text-main);
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: #475569; }
    .filter-btn.active { background: var(--primary); color: #0f172a; }
    .search-input {
      background: #1e293b;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      flex: 1;
      min-width: 220px;
    }

    .issue-list { display: flex; flex-direction: column; gap: 12px; }
    .issue-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .issue-card.critical { border-left: 5px solid var(--critical); }
    .issue-card.warning { border-left: 5px solid var(--warning); }
    .issue-card.info { border-left: 5px solid var(--info); }
    
    .issue-header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      gap: 12px;
      background: rgba(255,255,255,0.01);
    }
    .issue-header:hover { background: rgba(255,255,255,0.03); }
    .issue-title-group { display: flex; align-items: center; gap: 10px; flex: 1; }
    .badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
    .badge.critical { background: rgba(239, 68, 68, 0.2); color: var(--critical); }
    .badge.warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .badge.info { background: rgba(59, 130, 246, 0.2); color: var(--info); }
    .badge.engine { background: rgba(56, 189, 248, 0.15); color: var(--primary); }
    .badge.healthy { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    
    .issue-title { font-weight: 600; font-size: 14px; color: #fff; }
    .issue-body {
      padding: 14px 18px 18px;
      display: block;
      font-size: 13px;
      color: #cbd5e1;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .issue-body.closed { display: none; }
    
    .sql-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 12px;
      margin-top: 10px;
      position: relative;
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .copy-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      background: #334155;
      color: #fff;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .copy-btn:hover { background: var(--primary); color: #000; }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }
    .data-table th, .data-table td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
    }
    .data-table th { background: rgba(15, 23, 42, 0.8); color: var(--primary); font-weight: 600; }
    .data-table tr:hover td { background: rgba(255,255,255,0.02); }

    .doc-section { margin-bottom: 24px; }
    .doc-section h2 {
      font-size: 17px;
      color: #fff;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .doc-section p, .doc-section li { font-size: 14px; color: #cbd5e1; line-height: 1.6; }
    .doc-section ul { padding-left: 20px; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div>
        <h1>⚡ MySQL &amp; MariaDB Performance Audit Dashboard</h1>
        <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
          Database: <strong>${escapeHtml(databaseInfo.targetDatabase)}</strong> | 
          Engine: <strong>${escapeHtml(databaseInfo.flavor.toUpperCase())} ${escapeHtml(databaseInfo.version)}</strong>
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="meta-badge">📅 <strong>${new Date(auditMetadata.timestamp).toLocaleString()}</strong></span>
        <span class="meta-badge">⏱️ <strong>${auditMetadata.durationMs}ms</strong></span>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab(this, 'tab-overview')">📊 Tổng quan &amp; Vấn đề</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-workload-io')">🧠 Tải Đọc/Ghi &amp; I/O</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-tables')">🗄️ Top Bảng &amp; Lưu trữ</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-executive')">📋 Báo cáo Sếp (Executive)</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-sql')">🛠️ Mã lệnh SQL Fix</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-methodology')">📈 Cách tính điểm</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-json')">📦 Dữ liệu JSON</button>
    </div>

    <!-- TAB 1: OVERVIEW & ISSUES -->
    <div id="tab-overview" class="tab-content active">
      <div class="hero-grid">
        <div class="card score-card">
          <div class="score-status">${escapeHtml(statusText)}</div>
          <div class="score-ring">
            <div class="score-value">${score}</div>
            <div class="score-max">/ 100</div>
          </div>
          <div class="score-grade" style="color: ${color};">Xếp loại: ${grade}</div>
        </div>

        <div class="card">
          <div class="stats-grid">
            <div class="stat-box" onclick="filterBySeverityDirect('ALL')">
              <div class="stat-num" style="color: #fff;">${summary.totalIssues}</div>
              <div class="stat-label">Tổng số lỗi</div>
            </div>
            <div class="stat-box" onclick="filterBySeverityDirect('CRITICAL')">
              <div class="stat-num" style="color: var(--critical);">${summary.criticalIssues}</div>
              <div class="stat-label">Nghiêm trọng</div>
            </div>
            <div class="stat-box" onclick="filterBySeverityDirect('WARNING')">
              <div class="stat-num" style="color: var(--warning);">${summary.warningIssues}</div>
              <div class="stat-label">Cảnh báo</div>
            </div>
            <div class="stat-box" onclick="filterBySeverityDirect('INFO')">
              <div class="stat-num" style="color: var(--info);">${summary.infoIssues}</div>
              <div class="stat-label">Khuyến nghị</div>
            </div>
          </div>

          <div class="pillar-list">
            ${renderPillarBar('1. Schema & Index (25%)', breakdown.schema, 'schema')}
            ${renderPillarBar('2. Locks & Concurrency (20%)', breakdown.lock, 'lock')}
            ${renderPillarBar('3. Query Digest & Workload (25%)', breakdown.query, 'query')}
            ${renderPillarBar('4. Memory & I/O Engine (15%)', breakdown.memory, 'memory')}
            ${renderPillarBar('5. Config & my.cnf Tuning (15%)', breakdown.config, 'config')}
          </div>
        </div>
      </div>

      <!-- Quick Workload & I/O Summary Bar -->
      <div class="telemetry-summary-grid">
        <div class="telemetry-widget" onclick="switchTabByName('tab-workload-io')" style="cursor: pointer;">
          <div class="telemetry-widget-header">
            <span>🔄 Tải Đọc / Ghi (Workload Ratio)</span>
            <strong style="color: var(--primary);">${wl.statement.readPct}% Đọc | ${wl.statement.writePct}% Ghi</strong>
          </div>
          <div class="split-progress">
            <div class="split-fill-left" style="width: ${wl.statement.readPct}%; background: var(--primary);"></div>
            <div class="split-fill-right" style="width: ${wl.statement.writePct}%; background: var(--warning);"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
            <span>SELECT: ${wl.statement.selects.toLocaleString()} lệnh</span>
            <span>DML Ghi: ${wl.statement.writes.toLocaleString()} lệnh</span>
          </div>
        </div>

        <div class="telemetry-widget" onclick="switchTabByName('tab-workload-io')" style="cursor: pointer;">
          <div class="telemetry-widget-header">
            <span>⚡ Đọc từ RAM vs Đọc Ổ đĩa (Cache Hit)</span>
            <strong style="color: ${mem.memoryHitRatio >= 99 ? 'var(--success)' : 'var(--critical)'};">
              ${mem.memoryHitRatio}% RAM | ${mem.diskReadRatio}% Disk
            </strong>
          </div>
          <div class="split-progress">
            <div class="split-fill-left" style="width: ${mem.memoryHitRatio}%; background: var(--success);"></div>
            <div class="split-fill-right" style="width: ${mem.diskReadRatio}%; background: var(--critical);"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
            <span>Buffer Pool: ${mem.bufferPoolGb} GB</span>
            <span>Đọc từ Disk: ${mem.diskReads.toLocaleString()} lần</span>
          </div>
        </div>
      </div>

      <!-- Controls bar -->
      <div class="controls-bar">
        <div class="controls">
          <button class="filter-btn active" id="btn-filter-all" onclick="filterIssues(this, 'ALL')">
            Tất cả (${allIssues.length})
          </button>
          <button class="filter-btn" id="btn-filter-critical" onclick="filterIssues(this, 'CRITICAL')">
            Critical (${summary.criticalIssues})
          </button>
          <button class="filter-btn" id="btn-filter-warning" onclick="filterIssues(this, 'WARNING')">
            Warning (${summary.warningIssues})
          </button>
          <button class="filter-btn" id="btn-filter-info" onclick="filterIssues(this, 'INFO')">
            Info (${summary.infoIssues})
          </button>
          <button class="filter-btn" onclick="toggleAllAccordions()">
            ↕️ Đóng/Mở Tất cả
          </button>
        </div>
        <input type="text" class="search-input" placeholder="🔍 Tìm kiếm lỗi, bảng, câu lệnh SQL..."
          oninput="searchIssues(this.value)">
      </div>

      <!-- Issue list container -->
      <div class="issue-list" id="issueContainer">
        ${allIssues.length === 0 ? `
          <div class="card" style="text-align: center; color: var(--success); padding: 40px;">
            🎉 Tuyệt vời! Không phát hiện điểm nghẽn hiệu năng nào.
          </div>
        ` : allIssues.map((issue, idx) => renderIssueCard(issue, idx)).join('\n')}
      </div>
    </div>

    <!-- TAB 2: WORKLOAD & I/O TELEMETRY (DEEP INSIGHTS) -->
    <div id="tab-workload-io" class="tab-content">
      <div class="card" style="margin-bottom: 20px;">
        <div class="doc-section">
          <h2>📊 1. Phân Tích Hồ Sơ Tải Đọc / Ghi (Read vs Write Workload Breakdown)</h2>
          <p style="margin-bottom: 12px;">
            Nhận diện bản chất luồng công việc của hệ thống (OLTP Read-Heavy vs Write-Heavy) 
            để định hướng chiến lược mở rộng và đầu tư phần cứng:
          </p>
          <table class="data-table">
            <tr>
              <th>Cấp độ Phân tích (Level)</th>
              <th>Tổng lượt Đọc (Read)</th>
              <th>Tổng lượt Ghi (Write)</th>
              <th>Tỷ lệ Đọc / Ghi (%)</th>
              <th>Đặc trưng Tải (Profile)</th>
            </tr>
            <tr>
              <td><strong>Cấp Câu lệnh (Statement Level)</strong></td>
              <td>${wl.statement.selects.toLocaleString()} SELECT</td>
              <td>${wl.statement.writes.toLocaleString()} INSERT/UPDATE/DELETE</td>
              <td>
                <strong style="color: var(--primary);">${wl.statement.readPct}% Đọc</strong> / 
                <strong style="color: var(--warning);">${wl.statement.writePct}% Ghi</strong>
              </td>
              <td><span class="badge ${wl.profile === 'READ_HEAVY' ? 'info' : 'warning'}">${wl.profile}</span></td>
            </tr>
            <tr>
              <td><strong>Cấp Dòng Dữ liệu (Row Level - InnoDB)</strong></td>
              <td>${wl.row.rowsRead.toLocaleString()} Rows Read</td>
              <td>${wl.row.rowsWritten.toLocaleString()} Rows Written</td>
              <td>
                <strong style="color: var(--primary);">${wl.row.readPct}% Đọc</strong> / 
                <strong style="color: var(--warning);">${wl.row.writePct}% Ghi</strong>
              </td>
              <td><span class="badge engine">InnoDB Row Engine</span></td>
            </tr>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div class="doc-section">
          <h2>⚡ 2. Hiệu Suất Bộ Nhớ RAM &amp; Tỷ Lệ Đọc Ổ Đĩa (Buffer Pool &amp; Disk I/O)</h2>
          <table class="data-table">
            <tr>
              <th>Chỉ số Telemetry</th><th>Giá trị Đo lường</th><th>Ngưỡng Tiêu chuẩn</th><th>Đánh giá</th>
            </tr>
            <tr>
              <td><strong>Dung lượng InnoDB Buffer Pool (RAM)</strong></td>
              <td><strong>${mem.bufferPoolGb} GB (${mem.bufferPoolMb} MB)</strong></td>
              <td>60% - 75% RAM máy chủ</td>
              <td><span class="badge healthy">Active</span></td>
            </tr>
            <tr>
              <td><strong>Tỷ lệ Đọc từ RAM (Buffer Pool Hit Ratio)</strong></td>
              <td>
                <strong style="color: ${mem.memoryHitRatio >= 99 ? 'var(--success)' : 'var(--critical)'};">
                  ${mem.memoryHitRatio}%
                </strong>
              </td>
              <td>&gt;= 99.0% (Lý tưởng: &gt;= 99.5%)</td>
              <td>
                <span class="badge ${mem.memoryHitRatio >= 99 ? 'healthy' : 'critical'}">
                  ${mem.memoryHitRatio >= 99 ? 'TỐI ƯU (RAM HIT)' : 'NGHẼN DISK I/O'}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Tỷ lệ Đọc vật lý từ Ổ đĩa (Physical Disk Miss)</strong></td>
              <td>
                <strong style="color: ${mem.diskReadRatio <= 1 ? 'var(--success)' : 'var(--critical)'};">
                  ${mem.diskReadRatio}% (${mem.diskReads.toLocaleString()} lần)
                </strong>
              </td>
              <td>&lt; 1.0% (Lý tưởng: &lt; 0.1%)</td>
              <td>
                <span class="badge ${mem.diskReadRatio <= 1 ? 'healthy' : 'critical'}">
                  ${mem.diskReadRatio <= 1 ? 'Ổn định' : 'Cần tối ưu'}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Tỷ lệ Trang Bẩn Chờ Ghi (Dirty Pages Ratio)</strong></td>
              <td><strong>${mem.dirtyPagesPct}%</strong></td>
              <td>&lt; 70.0%</td>
              <td>
                <span class="badge ${mem.dirtyPagesPct <= 70 ? 'healthy' : 'warning'}">
                  ${mem.dirtyPagesPct <= 70 ? 'Flush Kịp thời' : 'Flush Chậm'}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Nghẽn Chờ Ghi Redo Log (Innodb_log_waits)</strong></td>
              <td><strong>${mem.redoLogWaits} sự kiện chờ</strong></td>
              <td>0 waits</td>
              <td>
                <span class="badge ${mem.redoLogWaits === 0 ? 'healthy' : 'critical'}">
                  ${mem.redoLogWaits === 0 ? 'Không nghẽn' : 'Bị nghẽn Redo'}
                </span>
              </td>
            </tr>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="doc-section">
          <h2>🔍 3. Chẩn Đoán Nguyên Nhân Gốc Rễ &amp; Khuyến Nghị Tối Ưu I/O</h2>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 14px;
            border-radius: 8px; border: 1px solid var(--card-border);">
            <p style="font-size: 14px; margin-bottom: 8px;">
              <strong>Trạng thái:</strong> 
              <span class="badge ${diag.status === 'HEALTHY'
                ? 'healthy' : diag.status === 'WARNING' ? 'warning' : 'critical'}">
                ${diag.status}
              </span>
              <span style="margin-left: 6px; color: #fff;">${escapeHtml(diag.summary)}</span>
            </p>
            <p style="color: var(--text-muted); font-size: 13px;">
              <strong>Khuyến nghị:</strong> ${escapeHtml(diag.recommendation)}
            </p>
          </div>

          <h3 style="color: #fff; font-size: 15px; margin-top: 16px; margin-bottom: 8px;">
            📌 Tại sao Đọc từ Disk lại nguy hiểm và Hướng xử lý:
          </h3>
          <ul>
            <li>
              <strong>Độ trễ chênh lệch:</strong> Truy xuất RAM chỉ mất ~100ns,
              trong khi SSD mất ~100µs (chậm hơn 1.000 lần) và HDD mất ~10ms.
            </li>
            <li>
              <strong>Triệt tiêu Full Table Scan:</strong> Quét toàn bộ bảng
              làm tràn RAM (Cache Pollution), hất văng dữ liệu nóng ra ngoài.
            </li>
            <li>
              <strong>Cân đối Kích thước Buffer Pool:</strong> Hãy tăng
              <code>innodb_buffer_pool_size</code> lên mức 60% - 75% tổng RAM máy chủ.
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 3: TOP TABLES & STORAGE INSIGHTS -->
    <div id="tab-tables" class="tab-content">
      <div class="card" style="margin-bottom: 20px;">
        <div class="doc-section">
          <h2>📦 Top 10 Bảng có Dung lượng Lớn Nhất (Total Storage Size)</h2>
          <table class="data-table">
            <tr>
              <th>#</th><th>Bảng (Table)</th><th>Engine</th><th>Số bản ghi (Rows)</th>
              <th>Dữ liệu (Data)</th><th>Index</th><th>Tổng dung lượng</th><th>Dung lượng trống (Free)</th>
            </tr>
            ${topBySize.length === 0
              ? '<tr><td colspan="8">Không có dữ liệu bảng.</td></tr>'
              : topBySize.map((t, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td><strong>${escapeHtml(t.table_schema)}.${escapeHtml(t.table_name)}</strong></td>
                <td><span class="badge engine">${escapeHtml(t.engine || 'InnoDB')}</span></td>
                <td>${parseInt(t.table_rows || 0, 10).toLocaleString()}</td>
                <td>${t.data_mb} MB</td>
                <td>${t.index_mb} MB</td>
                <td><strong style="color: var(--primary);">${t.total_mb} MB</strong></td>
                <td>${t.free_mb} MB</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div class="doc-section">
          <h2>📊 Top 10 Bảng có Nhiều Bản Ghi Nhất (Highest Row Count)</h2>
          <table class="data-table">
            <tr>
              <th>#</th><th>Bảng (Table)</th><th>Engine</th><th>Số bản ghi ước tính (Rows)</th><th>Tổng dung lượng</th>
            </tr>
            ${topByRows.length === 0
              ? '<tr><td colspan="5">Không có dữ liệu bảng.</td></tr>'
              : topByRows.map((t, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td><strong>${escapeHtml(t.table_schema)}.${escapeHtml(t.table_name)}</strong></td>
                <td><span class="badge engine">${escapeHtml(t.engine || 'InnoDB')}</span></td>
                <td>
                  <strong style="color: var(--warning);">
                    ${parseInt(t.table_rows || 0, 10).toLocaleString()}
                  </strong>
                </td>
                <td>${t.total_mb} MB</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div class="doc-section">
          <h2>🧹 Top 10 Bảng Phân Mảnh &amp; Lãng Phí Ổ Đĩa Nhất (Most Fragmented Tables)</h2>
          <table class="data-table">
            <tr>
              <th>#</th><th>Bảng (Table)</th><th>Tổng dung lượng</th><th>Dung lượng lãng phí (Free)</th>
              <th>Tỷ lệ phân mảnh (%)</th><th>Đề xuất xử lý</th>
            </tr>
            ${topByFrag.length === 0
              ? '<tr><td colspan="6">✅ Không phát hiện bảng nào bị phân mảnh nghiêm trọng.</td></tr>'
              : topByFrag.map((t, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td><strong>${escapeHtml(t.table_schema)}.${escapeHtml(t.table_name)}</strong></td>
                <td>${t.total_mb} MB</td>
                <td><strong style="color: var(--critical);">${t.free_mb} MB</strong></td>
                <td><span class="badge warning">${t.frag_pct}%</span></td>
                <td><code>ALTER TABLE \`${escapeHtml(t.table_name)}\` ENGINE=InnoDB;</code></td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>

      <div class="card">
        <div class="doc-section">
          <h2>🔍 Danh Sách Index Không Sử Dụng hoặc Bị Ẩn (Unused &amp; Invisible Indexes)</h2>
          <table class="data-table">
            <tr>
              <th>#</th><th>Bảng</th><th>Tên Index</th><th>Trạng thái &amp; Tác động</th><th>Hành động đề xuất</th>
            </tr>
            ${unusedIdxs.length === 0
              ? '<tr><td colspan="5">✅ Không phát hiện Index thừa hoặc bị ẩn.</td></tr>'
              : unusedIdxs.map((idxItem, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td><strong>${escapeHtml(idxItem.table_schema)}.${escapeHtml(idxItem.table_name)}</strong></td>
                <td><code>${escapeHtml(idxItem.index_name)}</code></td>
                <td><span class="badge warning">${escapeHtml(idxItem.status)}</span></td>
                <td>
                  <code>ALTER TABLE \`${escapeHtml(idxItem.table_name)}\`
                  DROP INDEX \`${escapeHtml(idxItem.index_name)}\`;</code>
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 4: EXECUTIVE SUMMARY (FOR BOSS) -->
    <div id="tab-executive" class="tab-content">
      <div class="card">
        <div class="doc-section">
          <h2>1. Đánh giá Tổng quan Điểm Sức Khỏe</h2>
          <table class="data-table">
            <tr><th>Chỉ số</th><th>Kết quả</th><th>Đánh giá</th></tr>
            <tr>
              <td><strong>Điểm Sức Khỏe Tổng Thể</strong></td>
              <td><strong style="color: ${color}; font-size: 16px;">${score} / 100</strong></td>
              <td><strong>Xếp loại: ${grade} (${statusText})</strong></td>
            </tr>
            <tr>
              <td><strong>Tổng số Điểm nghẽn</strong></td>
              <td>${summary.totalIssues} mục</td>
              <td>${summary.criticalIssues} Nghiêm trọng, ${summary.warningIssues} Cảnh báo</td>
            </tr>
            <tr>
              <td><strong>Môi trường Database</strong></td>
              <td>${escapeHtml(databaseInfo.flavor.toUpperCase())} ${escapeHtml(databaseInfo.version)}</td>
              <td>Uptime: ${(databaseInfo.uptimeSeconds / 86400).toFixed(1)} ngày</td>
            </tr>
          </table>
        </div>

        <div class="doc-section">
          <h2>2. Bảng Điểm Chi Tiết 5 Trụ Cột Hiệu Năng</h2>
          <table class="data-table">
            <tr>
              <th>Trụ cột Chẩn đoán</th><th>Trọng số</th><th>Điểm Đạt</th><th>Tỷ lệ</th><th>Lỗi (C / W)</th>
            </tr>
            <tr>
              <td><strong>1. Schema &amp; Index Optimization</strong></td>
              <td>25 pts</td><td><strong>${breakdown.schema.score}</strong></td>
              <td>${breakdown.schema.percentage}%</td>
              <td>${breakdown.schema.criticalCount} C / ${breakdown.schema.warningCount} W</td>
            </tr>
            <tr>
              <td><strong>2. Concurrency, Locks &amp; Waits</strong></td>
              <td>20 pts</td><td><strong>${breakdown.lock.score}</strong></td>
              <td>${breakdown.lock.percentage}%</td>
              <td>${breakdown.lock.criticalCount} C / ${breakdown.lock.warningCount} W</td>
            </tr>
            <tr>
              <td><strong>3. Query Digest &amp; Workload</strong></td>
              <td>25 pts</td><td><strong>${breakdown.query.score}</strong></td>
              <td>${breakdown.query.percentage}%</td>
              <td>${breakdown.query.criticalCount} C / ${breakdown.query.warningCount} W</td>
            </tr>
            <tr>
              <td><strong>4. Memory &amp; I/O Engine</strong></td>
              <td>15 pts</td><td><strong>${breakdown.memory.score}</strong></td>
              <td>${breakdown.memory.percentage}%</td>
              <td>${breakdown.memory.criticalCount} C / ${breakdown.memory.warningCount} W</td>
            </tr>
            <tr>
              <td><strong>5. Configuration &amp; my.cnf Tuning</strong></td>
              <td>15 pts</td><td><strong>${breakdown.config.score}</strong></td>
              <td>${breakdown.config.percentage}%</td>
              <td>${breakdown.config.criticalCount} C / ${breakdown.config.warningCount} W</td>
            </tr>
          </table>
        </div>

        <div class="doc-section">
          <h2>3. Điểm Nghẽn Nghiêm Trọng Cần Khắc Phục Ngay</h2>
          ${criticalIssues.length === 0 ? '<p>✅ Không có lỗi nghiêm trọng.</p>' : `
            <ul>
              ${criticalIssues.map((i) => `
                <li style="margin-bottom: 8px;">
                  <strong style="color: var(--critical);">[${escapeHtml(i.category)}] ${escapeHtml(i.title)}:</strong>
                  ${escapeHtml(i.details)} (<em>Khuyến nghị: ${escapeHtml(i.recommendation)}</em>)
                </li>
              `).join('')}
            </ul>
          `}
        </div>

        <div class="doc-section">
          <h2>4. Dự Báo Lợi Ích Sau Tối Ưu (Projected ROI)</h2>
          <ul>
            <li>
              <strong>Thời gian phản hồi truy vấn (Query Latency):</strong> Dự kiến giảm <strong>40% - 70%</strong>.
            </li>
            <li><strong>Hiện tượng nghẽn khóa (Lock Contention):</strong> Triệt tiêu rủi ro Table Lock.</li>
            <li>
              <strong>Hiệu suất Bộ nhớ &amp; Ổ đĩa (I/O):</strong> Tăng Hit Ratio lên <strong>&gt;= 99.5%</strong>.
            </li>
            <li><strong>Độ an toàn hệ thống:</strong> Triệt tiêu rủi ro tràn số Auto-Increment và OOM Killer.</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 5: SQL FIX SCRIPT -->
    <div id="tab-sql" class="tab-content">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2>🛠️ Script Khắc phục Hiệu năng (recommendations.sql)</h2>
          <button class="filter-btn active" onclick="copyFullSql()">📋 Copy Toàn bộ Script SQL</button>
        </div>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 12px;">
          Tất cả câu lệnh tạo index đều gắn kèm <code>ALGORITHM=INPLACE, LOCK=NONE</code> đảm bảo Zero-Downtime.
        </p>
        <div class="sql-box" style="max-height: 550px; overflow-y: auto;">
          <pre id="fullSqlContainer">${escapeHtml(fullSqlText)}</pre>
        </div>
      </div>
    </div>

    <!-- TAB 6: SCORING METHODOLOGY -->
    <div id="tab-methodology" class="tab-content">
      <div class="card">
        <div class="doc-section">
          <h2>📈 Phương Pháp &amp; Thuật Toán Chấm Điểm Sức Khỏe Database</h2>
          <p>
            Hệ thống áp dụng mô hình <strong>Weighted 5-Pillar Health Scoring</strong> 
            với thang điểm chuẩn <strong>100 điểm</strong> chia theo 5 trụ cột tối ưu cốt lõi:
          </p>
          <table class="data-table">
            <tr><th>Trụ cột Chẩn đoán</th><th>Trọng số</th><th>Ý nghĩa &amp; Yếu tố đo lường</th></tr>
            <tr>
              <td><strong>1. Schema &amp; Index</strong></td>
              <td><strong>25 điểm (25%)</strong></td>
              <td>Index trùng lặp/dư thừa, Index không dùng, FK thiếu Index, Bảng thiếu PK, Phân mảnh (data_free).</td>
            </tr>
            <tr>
              <td><strong>2. Concurrency &amp; Locks</strong></td>
              <td><strong>20 điểm (20%)</strong></td>
              <td>Giao dịch treo lâu (&gt;30s), Row Lock waits contention, Deadlocks log, Mutex wait events.</td>
            </tr>
            <tr>
              <td><strong>3. Query Digest &amp; Workload</strong></td>
              <td><strong>25 điểm (25%)</strong></td>
              <td>Top Slow Digests, Scan Efficiency ROWS_EXAMINED / ROWS_SENT, Full Table Scans, Disk Temp Tables.</td>
            </tr>
            <tr>
              <td><strong>4. Memory &amp; I/O Engine</strong></td>
              <td><strong>15 điểm (15%)</strong></td>
              <td>Tỷ lệ trúng Buffer Pool (&gt;99%), Dirty page flush rate, Redo Log waits, O_DIRECT flush method.</td>
            </tr>
            <tr>
              <td><strong>5. Config &amp; my.cnf Tuning</strong></td>
              <td><strong>15 điểm (15%)</strong></td>
              <td>Nguy cơ Linux OOM Killer (Max Theoretical RAM vs RAM máy chủ), Sizing Buffer Pool.</td>
            </tr>
          </table>
        </div>

        <div class="doc-section">
          <h2>Quy Tắc Khấu Trừ Điểm &amp; Cơ Chế Trần (Cap Limits)</h2>
          <ul>
            <li><strong>Lỗi Nghiêm trọng (CRITICAL):</strong> Khấu trừ cơ sở <strong>-6.0 điểm</strong>.</li>
            <li><strong>Lỗi Cảnh báo (WARNING):</strong> Khấu trừ cơ sở <strong>-2.5 điểm</strong>.</li>
            <li><strong>Lỗi Khuyến nghị (INFO):</strong> Khấu trừ cơ sở <strong>-0.5 điểm</strong>.</li>
            <li>
              <strong>Cơ chế giảm phạt lũy tiến:</strong> Lỗi lặp lại giảm dần mức trừ (100% -&gt; 60% -&gt; 20%) 
              để tránh bị trừ âm điểm phi lý.
            </li>
            <li><strong>Chặn dưới từng Trụ cột (Pillar Cap):</strong> Điểm mỗi trụ cột không bao giờ bị âm.</li>
          </ul>
        </div>

        <div class="doc-section">
          <h2>Thang Xếp Loại Sức Khỏe (Health Grade Scale)</h2>
          <table class="data-table">
            <tr><th>Thang điểm</th><th>Xếp loại</th><th>Màu sắc</th><th>Trạng thái &amp; Đánh giá</th></tr>
            <tr>
              <td><strong>90 - 100 điểm</strong></td><td><strong>Grade A+</strong></td><td>Xanh lá</td>
              <td><strong>Xuất sắc (Excellent):</strong> Vận hành tối ưu, không có lỗi nghiêm trọng.</td>
            </tr>
            <tr>
              <td><strong>80 - 89 điểm</strong></td><td><strong>Grade B</strong></td><td>Xanh dương</td>
              <td><strong>Tốt (Good):</strong> Hiệu năng ổn định, chỉ tồn tại cảnh báo nhỏ.</td>
            </tr>
            <tr>
              <td><strong>65 - 79 điểm</strong></td><td><strong>Grade C</strong></td><td>Vàng cam</td>
              <td><strong>Cần tối ưu (Fair):</strong> Xuất hiện nghẽn ở Index hoặc I/O.</td>
            </tr>
            <tr>
              <td><strong>50 - 64 điểm</strong></td><td><strong>Grade D</strong></td><td>Cam đậm</td>
              <td><strong>Rủi ro cao (High Risk):</strong> Thường xuyên nghẽn khóa, thiếu Index.</td>
            </tr>
            <tr>
              <td><strong>&lt; 50 điểm</strong></td><td><strong>Grade F</strong></td><td>Đỏ</td>
              <td><strong>Nghẽn nghiêm trọng (Critical):</strong> Nguy cơ sập dịch vụ hoặc tràn đĩa!</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 7: RAW JSON -->
    <div id="tab-json" class="tab-content">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2>📦 Dữ liệu JSON Cấu trúc (Raw Metrics)</h2>
          <button class="filter-btn active" onclick="copyJson()">📋 Copy JSON</button>
        </div>
        <div class="sql-box" style="max-height: 550px; overflow-y: auto;">
          <pre id="rawJsonContainer">${escapeHtml(jsonRawText)}</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    function switchTab(btn, tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const activeContent = document.getElementById(tabId);
      if (activeContent) activeContent.classList.add('active');
    }

    function switchTabByName(tabId) {
      const btns = document.querySelectorAll('.tab-btn');
      const contents = document.querySelectorAll('.tab-content');
      btns.forEach(b => {
        if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(tabId)) {
          btns.forEach(x => x.classList.remove('active'));
          b.classList.add('active');
        }
      });
      contents.forEach(c => c.classList.remove('active'));
      const activeContent = document.getElementById(tabId);
      if (activeContent) activeContent.classList.add('active');
    }

    function toggleAccordion(id) {
      const body = document.getElementById('body-' + id);
      if (body) body.classList.toggle('closed');
    }

    let allExpanded = true;
    function toggleAllAccordions() {
      allExpanded = !allExpanded;
      document.querySelectorAll('.issue-body').forEach(b => {
        if (allExpanded) b.classList.remove('closed');
        else b.classList.add('closed');
      });
    }

    function filterIssues(btn, sev) {
      document.querySelectorAll('.controls-bar .filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('#tab-overview .issue-card').forEach(c => {
        if (sev === 'ALL' || c.dataset.severity === sev) {
          c.style.display = 'block';
        } else {
          c.style.display = 'none';
        }
      });
    }

    function filterBySeverityDirect(sev) {
      const targetBtn = document.getElementById('btn-filter-' + sev.toLowerCase());
      filterIssues(targetBtn, sev);
    }

    function filterByPillar(pillarKey) {
      document.querySelectorAll('#tab-overview .issue-card').forEach(c => {
        if (c.dataset.pillar === pillarKey) {
          c.style.display = 'block';
        } else {
          c.style.display = 'none';
        }
      });
    }

    function searchIssues(query) {
      const term = query.toLowerCase();
      document.querySelectorAll('#tab-overview .issue-card').forEach(c => {
        const text = c.innerText.toLowerCase();
        c.style.display = text.includes(term) ? 'block' : 'none';
      });
    }

    function copySql(id) {
      const el = document.getElementById('sql-' + id);
      if (el) {
        navigator.clipboard.writeText(el.innerText);
        alert('Đã copy câu lệnh SQL vào clipboard!');
      }
    }

    function copyFullSql() {
      const el = document.getElementById('fullSqlContainer');
      if (el) {
        navigator.clipboard.writeText(el.innerText);
        alert('Đã copy toàn bộ mã lệnh recommendations.sql!');
      }
    }

    function copyJson() {
      const el = document.getElementById('rawJsonContainer');
      if (el) {
        navigator.clipboard.writeText(el.innerText);
        alert('Đã copy toàn bộ dữ liệu JSON!');
      }
    }
  </script>
</body>
</html>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

function renderPillarBar(title, pillar, pillarKey = '') {
  const pct = pillar ? pillar.percentage : 100;
  const score = pillar ? pillar.score : 0;
  const max = pillar ? pillar.maxScore : 0;
  let barColor = 'var(--success)';
  if (pct < 60) barColor = 'var(--critical)';
  else if (pct < 80) barColor = 'var(--warning)';

  return `
    <div class="pillar-item" onclick="filterByPillar('${escapeHtml(pillarKey)}')">
      <div class="pillar-header">
        <span>${escapeHtml(title)}</span>
        <span>${score} / ${max} pts (${pct}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${pct}%; background: ${barColor};"></div>
      </div>
    </div>
  `;
}

function renderIssueCard(issue, idx) {
  const sevClass = (issue.severity || 'INFO').toLowerCase();
  const pillarKey = escapeHtml(issue.pillar || '');
  return `
    <div class="issue-card ${sevClass}" data-severity="${escapeHtml(issue.severity)}" data-pillar="${pillarKey}">
      <div class="issue-header" onclick="toggleAccordion(${idx})">
        <div class="issue-title-group">
          <span class="badge ${sevClass}">${escapeHtml(issue.severity)}</span>
          <span class="issue-title">${escapeHtml(issue.title)}</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(issue.category || '')} ▾</span>
      </div>
      <div class="issue-body" id="body-${idx}">
        <p><strong>Tác động &amp; Chi tiết:</strong> ${escapeHtml(issue.details)}</p>
        <p style="margin-top: 6px;"><strong>Khuyến nghị tối ưu:</strong> ${escapeHtml(issue.recommendation)}</p>
        ${issue.fixSql ? `
          <div class="sql-box">
            <button class="copy-btn" onclick="copySql(${idx})">Copy SQL</button>
            <span id="sql-${idx}">${escapeHtml(issue.fixSql)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

module.exports = {
  generateHtmlReport
};
