const logger = require('../utils/logger');
const config = require('../config/config');

const authenticatedUsers = new Set();

/**
 * Check if a Telegram user ID is authorized.
 * Whitelist check against ALLOWED_USER_IDS in .env / config
 */
async function isAuthorized(userId) {
  if (!userId) return false;

  const allowedIds = config.telegram.allowedUserIds;

  // If no allowed user IDs specified in .env, log warning
  if (!allowedIds || allowedIds.length === 0) {
    logger.warn('No ALLOWED_USER_IDS specified in environment variables.');
    return false;
  }

  if (allowedIds.includes(String(userId))) {
    authenticatedUsers.add(userId);
    return true;
  }

  logger.warn(`Unauthorized access attempt from Telegram User ID: ${userId}`);
  return false;
}

module.exports = {
  isAuthorized,
};
