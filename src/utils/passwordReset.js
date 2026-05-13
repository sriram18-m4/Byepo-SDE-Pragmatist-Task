const crypto = require('crypto');

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createResetExpiry() {
  const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function createResetLink(token) {
  const fallbackBaseUrl = `http://localhost:${process.env.PORT || 5000}`;
  const baseUrl = (process.env.APP_BASE_URL || fallbackBaseUrl).replace(/\/$/, '');
  return `${baseUrl}/Reset-Password.html?token=${encodeURIComponent(token)}`;
}

module.exports = {
  createResetToken,
  hashResetToken,
  createResetExpiry,
  createResetLink
};
