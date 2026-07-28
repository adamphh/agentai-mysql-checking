require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  mysql: {
    local: {
      host: process.env.MYSQL_LOCAL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_LOCAL_PORT || '3306'),
      user: process.env.MYSQL_LOCAL_USER || 'monitor',
      password: process.env.MYSQL_LOCAL_PASSWORD || '',
      connectionLimit: 10,
    },
    docker: {
      host: process.env.MYSQL_DOCKER_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_DOCKER_PORT || '3306'),
      user: process.env.MYSQL_DOCKER_USER || 'root',
      password: process.env.MYSQL_DOCKER_PASSWORD || '',
      connectionLimit: 10,
    },
    aws: {
      host: process.env.MYSQL_AWS_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_AWS_PORT || '3306'),
      user: process.env.MYSQL_AWS_USER || 'admin',
      password: process.env.MYSQL_AWS_PASSWORD || '',
      connectionLimit: 10,
    },
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUserIds: (process.env.ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
    password: process.env.TELEGRAM_PASSWORD || '',
  },
  monitoring: {
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '30000'),
    timeout: parseInt(process.env.MONITORING_TIMEOUT || '10000'),
    historyDays: parseInt(process.env.HISTORY_DAYS || '7'),
    cleanupHour: parseInt(process.env.CLEANUP_HOUR || '2'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },
};
