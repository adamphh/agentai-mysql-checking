require('dotenv').config();
const historyManager = require('../src/services/history-manager');

async function main() {
  console.log('Running Manual History Cleanup...');
  await historyManager.cleanupOldFiles();
  console.log('Cleanup finished.');
  process.exit(0);
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
