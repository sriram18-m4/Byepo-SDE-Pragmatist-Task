const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'development_only_replace_me';
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });
}

function verifyJwt(token) {
  return jwt.verify(token, getJwtSecret());
}

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  signToken,
  verifyJwt,
  hashPassword,
  comparePassword
};
