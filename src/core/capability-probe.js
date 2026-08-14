/**
 * Database Capability and Version Probe.
 * Identifies database flavor, version, and performance schema availability.
 */

/**
 * Probes database engine capabilities and version specifics.
 *
 * @param {Object} queryRunner - Safe query runner instance.
 * @returns {Promise<Object>} Probed database capability metadata.
 */
async function probeCapabilities(queryRunner) {
  const result = {
    flavor: 'mysql', // 'mysql' | 'mariadb'
    version: '8.0.0',
    majorVersion: 8,
    minorVersion: 0,
    patchVersion: 0,
    isMySQL8Plus: true,
    isMySQL84Plus: false,
    isMySQL57: false,
    isMariaDB: false,
    hasPerformanceSchema: false,
    hasSysSchema: false,
    isSysAccessible: false,
    isReadOnly: false,
    osName: 'Unknown',
    uptimeSeconds: 0
  };

  try {
    const versionRows = await queryRunner.query('SELECT VERSION() AS ver, @@version_comment AS comment');
    if (versionRows && versionRows.length > 0) {
      const verString = String(versionRows[0].ver || '');
      const commentString = String(versionRows[0].comment || '');

      result.version = verString;
      result.isMariaDB = verString.toLowerCase().includes('mariadb') ||
        commentString.toLowerCase().includes('mariadb');
      result.flavor = result.isMariaDB ? 'mariadb' : 'mysql';

      // Parse major and minor version numbers
      const match = verString.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
      if (match) {
        result.majorVersion = parseInt(match[1], 10);
        result.minorVersion = parseInt(match[2], 10);
        result.patchVersion = match[3] ? parseInt(match[3], 10) : 0;
      }

      if (!result.isMariaDB) {
        result.isMySQL57 = result.majorVersion === 5 && result.minorVersion === 7;
        result.isMySQL8Plus = result.majorVersion >= 8;
        result.isMySQL84Plus = (result.majorVersion === 8 && result.minorVersion >= 4) || result.majorVersion > 8;
      }
    }
  } catch (err) {
    // Fallback to defaults
  }

  // Probe performance_schema
  try {
    const pfsRows = await queryRunner.query("SHOW VARIABLES LIKE 'performance_schema'");
    if (pfsRows && pfsRows.length > 0) {
      result.hasPerformanceSchema = String(pfsRows[0].Value || '').toUpperCase() === 'ON';
    }
  } catch (err) {
    result.hasPerformanceSchema = false;
  }

  // Probe sys schema accessibility
  try {
    const sysRows = await queryRunner.query('SELECT 1 FROM sys.version LIMIT 1');
    if (sysRows && sysRows.length > 0) {
      result.hasSysSchema = true;
      result.isSysAccessible = true;
    }
  } catch (err) {
    result.hasSysSchema = false;
    result.isSysAccessible = false;
  }

  // Probe system uptime & read-only state
  try {
    const statusRows = await queryRunner.query("SHOW GLOBAL STATUS LIKE 'Uptime'");
    if (statusRows && statusRows.length > 0) {
      result.uptimeSeconds = parseInt(statusRows[0].Value || 0, 10);
    }
  } catch (err) {
    // Ignore status probe errors
  }

  return result;
}

module.exports = {
  probeCapabilities
};
