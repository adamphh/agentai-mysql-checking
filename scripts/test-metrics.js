require('dotenv').config();
const connections = require('../src/config/mysql-connections');
const metricsCollector = require('../src/services/metrics-collector');
const alertDetector = require('../src/services/alert-detector');

async function main() {
  console.log('Testing Metrics Collection...');
  await connections.initConnections();
  const metrics = await metricsCollector.collectMetrics();
  console.log('Collected Metrics:', JSON.stringify(metrics, null, 2));

  const alerts = alertDetector.detectAlerts(metrics);
  console.log('Detected Alerts:', JSON.stringify(alerts, null, 2));

  await connections.closeAll();
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
