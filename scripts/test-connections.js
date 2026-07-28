require('dotenv').config();
const connections = require('../src/config/mysql-connections');
const logger = require('../src/utils/logger');

async function main() {
  console.log('Testing MySQL Connections...');
  await connections.initConnections();
  const status = connections.getStatus();
  console.log('Connection status:', status);
  await connections.closeAll();
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
