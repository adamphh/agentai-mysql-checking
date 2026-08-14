#!/usr/bin/env node

/**
 * CLI executable entry point for MySQL & MariaDB Performance Audit Engine.
 */

const { main } = require('../src/cli');

main().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
