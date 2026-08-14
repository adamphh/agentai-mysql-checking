/**
 * Schema & Index Analyzer (Pillar 1).
 * Inspects indexes, primary/foreign keys, fragmentation, storage engines, and auto-increments.
 * Also collects Top Tables statistics (Size, Rows, Fragmentation, Unused/Invisible Indexes).
 */

const { SEVERITY_LEVELS } = require('../core/scorer');

/**
 * Analyzes schema and index health for the target database.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @param {Object} capabilities - Database capabilities metadata.
 * @param {Object} versionAdapter - Version compatibility adapter.
 * @param {string} [targetDatabase] - Specific database to inspect.
 * @returns {Promise<{issues: Array, tableStats: Object}>} Detected issues and top table statistics.
 */
async function analyzeSchemaAndIndexes(queryRunner, capabilities, versionAdapter, targetDatabase) {
  const issues = [];
  const cleanDb = targetDatabase ? targetDatabase.replace(/[`'\\;]/g, '') : null;
  const dbFilter = cleanDb
    ? `AND table_schema = '${cleanDb}'`
    : `AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')`;

  // 1. Tables without Primary Key (CRITICAL)
  try {
    const noPkSql = `
      SELECT t.table_schema, t.table_name, t.table_rows, t.engine
      FROM information_schema.tables t
      LEFT JOIN information_schema.table_constraints tc
        ON t.table_schema = tc.table_schema
        AND t.table_name = tc.table_name
        AND tc.constraint_type = 'PRIMARY KEY'
      WHERE t.table_type = 'BASE TABLE'
        AND tc.constraint_name IS NULL
        ${dbFilter}
      LIMIT 100
    `;
    const noPkRows = await queryRunner.safeQuery(noPkSql);
    for (const row of noPkRows) {
      issues.push({
        code: 'TABLE_NO_PRIMARY_KEY',
        title: `Table '${row.table_schema}.${row.table_name}' has no Primary Key`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Schema Design',
        details: `Table has ~${row.table_rows || 0} rows without a Primary Key. ` +
          `InnoDB will generate a hidden 6-byte row ID causing lock contention.`,
        recommendation: `Add an explicit PRIMARY KEY (e.g. BIGINT UNSIGNED AUTO_INCREMENT).`,
        fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ` +
          `ADD COLUMN \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY FIRST;`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 2. Foreign Keys without Index on Child Columns (CRITICAL)
  try {
    const unindexedFkSql = `
      SELECT 
        k.table_schema, k.table_name, k.column_name, k.constraint_name,
        k.referenced_table_schema, k.referenced_table_name, k.referenced_column_name
      FROM information_schema.key_column_usage k
      WHERE k.referenced_table_name IS NOT NULL
        ${dbFilter}
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.statistics s
          WHERE s.table_schema = k.table_schema
            AND s.table_name = k.table_name
            AND s.column_name = k.column_name
            AND s.seq_in_index = 1
        )
      LIMIT 100
    `;
    const unindexedFkRows = await queryRunner.safeQuery(unindexedFkSql);
    for (const row of unindexedFkRows) {
      const idxName = `idx_fk_${row.column_name.substring(0, 45)}`;
      issues.push({
        code: 'UNINDEXED_FOREIGN_KEY',
        title: `Unindexed Foreign Key '${row.column_name}' on '${row.table_schema}.${row.table_name}'`,
        severity: SEVERITY_LEVELS.CRITICAL,
        category: 'Index Optimization',
        details: `Foreign key referencing '${row.referenced_table_name}.${row.referenced_column_name}' ` +
          `lacks an index on child column. Updates or deletes on parent will cause full table locks!`,
        recommendation: `Create an index on child column '${row.column_name}' to prevent lock escalation.`,
        fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ` +
          `ADD INDEX \`${idxName}\` (\`${row.column_name}\`), ALGORITHM=INPLACE, LOCK=NONE;`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 3. Redundant / Duplicate Indexes (WARNING)
  try {
    const redundantSql = versionAdapter.getRedundantIndexesQuery();
    if (redundantSql) {
      const redundantRows = await queryRunner.safeQuery(redundantSql);
      for (const row of redundantRows) {
        issues.push({
          code: 'REDUNDANT_INDEX',
          title: `Redundant index '${row.redundant_index_name}' on '${row.table_schema}.${row.table_name}'`,
          severity: SEVERITY_LEVELS.WARNING,
          category: 'Index Optimization',
          details: `Index '${row.redundant_index_name}' (${row.redundant_index_columns}) is a prefix subset of ` +
            `dominant index '${row.dominant_index_name}' (${row.dominant_index_columns}). Wastes RAM and write I/O.`,
          recommendation: `Drop the redundant index after confirming application queries use the dominant index.`,
          fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ` +
            `DROP INDEX \`${row.redundant_index_name}\`;`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 4. Unused Indexes (WARNING)
  const unusedIndexList = [];
  try {
    const unusedSql = versionAdapter.getUnusedIndexesQuery();
    if (unusedSql) {
      const unusedRows = await queryRunner.safeQuery(unusedSql);
      for (const row of unusedRows) {
        if (row.index_name !== 'PRIMARY') {
          unusedIndexList.push({
            table_schema: row.table_schema,
            table_name: row.table_name,
            index_name: row.index_name,
            status: 'Unused (0 Reads)'
          });
          issues.push({
            code: 'UNUSED_INDEX',
            title: `Unused index '${row.index_name}' on '${row.table_schema}.${row.table_name}'`,
            severity: SEVERITY_LEVELS.WARNING,
            category: 'Index Optimization',
            details: `Index '${row.index_name}' has 0 reads since server restart but incurs write overhead.`,
            recommendation: `Verify with query logs before dropping unused index.`,
            fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ` +
              `DROP INDEX \`${row.index_name}\`;`
          });
        }
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 4b. Invisible Indexes (MySQL 8.0+)
  if (capabilities.isMySQL8Plus) {
    try {
      const invisibleSql = `
        SELECT table_schema, table_name, index_name
        FROM information_schema.statistics
        WHERE is_visible = 'NO'
          ${dbFilter}
        GROUP BY table_schema, table_name, index_name
      `;
      const invRows = await queryRunner.safeQuery(invisibleSql);
      for (const row of invRows) {
        unusedIndexList.push({
          table_schema: row.table_schema,
          table_name: row.table_name,
          index_name: row.index_name,
          status: 'Invisible Index'
        });
      }
    } catch (err) {
      // Isolated failure
    }
  }

  // 5. Table Fragmentation & Data Bloat (WARNING)
  try {
    const fragSql = `
      SELECT 
        table_schema, table_name, engine, table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb,
        ROUND(data_free / 1024 / 1024, 2) AS free_mb,
        ROUND((data_free / (data_length + index_length + data_free)) * 100, 2) AS frag_pct
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND engine = 'InnoDB'
        AND (data_length + index_length) > 100 * 1024 * 1024
        AND data_free > 50 * 1024 * 1024
        ${dbFilter}
      ORDER BY data_free DESC
      LIMIT 20
    `;
    const fragRows = await queryRunner.safeQuery(fragSql);
    for (const row of fragRows) {
      if (parseFloat(row.frag_pct) > 20) {
        issues.push({
          code: 'TABLE_FRAGMENTATION',
          title: `Table '${row.table_schema}.${row.table_name}' is heavily fragmented (${row.frag_pct}% free)`,
          severity: SEVERITY_LEVELS.WARNING,
          category: 'Storage & I/O',
          details: `Table size: ${row.total_mb} MB, Wasted disk space: ${row.free_mb} MB. ` +
            `Fragmented pages inflate Buffer Pool memory usage.`,
          recommendation: `Rebuild table during a low-traffic window to reclaim disk and improve cache locality.`,
          fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ENGINE=InnoDB, ALGORITHM=INPLACE;`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 6. Non-InnoDB Storage Engines (WARNING/CRITICAL)
  try {
    const engineSql = `
      SELECT table_schema, table_name, engine, table_rows
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND engine IN ('MyISAM', 'MEMORY')
        ${dbFilter}
      LIMIT 50
    `;
    const engineRows = await queryRunner.safeQuery(engineSql);
    for (const row of engineRows) {
      const isMyIsam = String(row.engine).toUpperCase() === 'MYISAM';
      issues.push({
        code: isMyIsam ? 'MYISAM_ENGINE_DETECTED' : 'MEMORY_ENGINE_DETECTED',
        title: `Table '${row.table_schema}.${row.table_name}' uses legacy '${row.engine}' engine`,
        severity: isMyIsam ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.WARNING,
        category: 'Engine Reliability',
        details: `Table uses ${row.engine}. ` +
          (isMyIsam ? 'MyISAM lacks transaction support and suffers from full table locks.' :
            'MEMORY tables use fixed-length rows and lack crash durability.'),
        recommendation: `Convert table to InnoDB for ACID compliance and row-level locking.`,
        fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ENGINE=InnoDB;`
      });
    }
  } catch (err) {
    // Isolated failure
  }

  // 7. Auto-Increment Saturation (>75%) (CRITICAL)
  try {
    const autoIncSql = `
      SELECT 
        t.table_schema, t.table_name, c.column_name, c.data_type, c.column_type,
        t.auto_increment
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
      WHERE c.extra LIKE '%auto_increment%'
        AND t.auto_increment IS NOT NULL
        ${dbFilter}
    `;
    const autoIncRows = await queryRunner.safeQuery(autoIncSql);
    for (const row of autoIncRows) {
      const currentVal = parseInt(row.auto_increment, 10);
      const dType = String(row.data_type).toLowerCase();
      const isUnsigned = String(row.column_type).toLowerCase().includes('unsigned');

      let maxVal = 2147483647; // default signed INT
      if (dType === 'tinyint') maxVal = isUnsigned ? 255 : 127;
      else if (dType === 'smallint') maxVal = isUnsigned ? 65535 : 32767;
      else if (dType === 'mediumint') maxVal = isUnsigned ? 16777215 : 8388607;
      else if (dType === 'int') maxVal = isUnsigned ? 4294967295 : 2147483647;
      else if (dType === 'bigint') maxVal = isUnsigned ? 18446744073709551615 : 9223372036854775807;

      const pct = (currentVal / maxVal) * 100;
      if (pct >= 75 && dType !== 'bigint') {
        issues.push({
          code: 'AUTO_INCREMENT_CAPACITY_CRITICAL',
          title: `Auto-increment for '${row.table_schema}.${row.table_name}.${row.column_name}' at ${pct.toFixed(1)}%`,
          severity: SEVERITY_LEVELS.CRITICAL,
          category: 'Data Integrity',
          details: `Current value: ${currentVal} / Max: ${maxVal} (${dType}). ` +
            `Reaching saturation will cause all subsequent INSERT statements to fail with duplicate key errors!`,
          recommendation: `Upgrade column type to BIGINT UNSIGNED.`,
          fixSql: `ALTER TABLE \`${row.table_schema}\`.\`${row.table_name}\` ` +
            `MODIFY COLUMN \`${row.column_name}\` BIGINT UNSIGNED AUTO_INCREMENT;`
        });
      }
    }
  } catch (err) {
    // Isolated failure
  }

  // 8. Collect Structured Top Tables Statistics (Size, Rows, Fragmentation)
  const tableStats = {
    topBySize: [],
    topByRows: [],
    topByFragmentation: [],
    unusedIndexes: unusedIndexList
  };

  try {
    // Top by Total Size
    const topSizeSql = `
      SELECT 
        table_schema, table_name, engine, table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb,
        ROUND(data_length / 1024 / 1024, 2) AS data_mb,
        ROUND(index_length / 1024 / 1024, 2) AS index_mb,
        ROUND(data_free / 1024 / 1024, 2) AS free_mb
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        ${dbFilter}
      ORDER BY (data_length + index_length) DESC
      LIMIT 10
    `;
    tableStats.topBySize = await queryRunner.safeQuery(topSizeSql);

    // Top by Row Count
    const topRowsSql = `
      SELECT 
        table_schema, table_name, engine, table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        ${dbFilter}
      ORDER BY table_rows DESC
      LIMIT 10
    `;
    tableStats.topByRows = await queryRunner.safeQuery(topRowsSql);

    // Top by Fragmentation (Data Free)
    const topFragSql = `
      SELECT 
        table_schema, table_name, engine, table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb,
        ROUND(data_free / 1024 / 1024, 2) AS free_mb,
        ROUND((data_free / (data_length + index_length + data_free)) * 100, 2) AS frag_pct
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND data_free > 10 * 1024 * 1024
        ${dbFilter}
      ORDER BY data_free DESC
      LIMIT 10
    `;
    tableStats.topByFragmentation = await queryRunner.safeQuery(topFragSql);
  } catch (err) {
    // Isolated failure
  }

  return {
    issues,
    tableStats
  };
}

module.exports = {
  analyzeSchemaAndIndexes
};
