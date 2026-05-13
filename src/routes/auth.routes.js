const express = require('express');
const pool = require('../db');
const { comparePassword, hashPassword, signToken } = require('../auth');
const { hashResetToken } = require('../utils/passwordReset');

const router = express.Router();

router.post('/super-admin/login', (req, res) => {
  const { email, password } = req.body;
  const expectedEmail = process.env.SUPER_ADMIN_EMAIL || 'super@local.test';
  const expectedPassword = process.env.SUPER_ADMIN_PASSWORD || 'super-password';

  if (email !== expectedEmail || password !== expectedPassword) {
    return res.status(401).json({ message: 'Invalid super admin credentials' });
  }

  const token = signToken({
    role: 'SUPER_ADMIN',
    email,
    name: 'Super Admin'
  });

  return res.json({
    token,
    user: {
      role: 'SUPER_ADMIN',
      email,
      name: 'Super Admin'
    }
  });
});

router.post('/login', async (req, res, next) => {
  try {
    const { organization_slug, email, password } = req.body;

    if (!organization_slug || !email || !password) {
      return res.status(400).json({
        message: 'organization_slug, email, and password are required'
      });
    }

    const [rows] = await pool.execute(
      `SELECT
         users.id,
         users.tenant_id,
         users.name,
         users.email,
         users.password_hash,
         users.role,
         users.is_active,
         organizations.name AS organization_name,
         organizations.slug AS organization_slug,
         organizations.is_active AS organization_is_active
       FROM users
       INNER JOIN organizations
         ON organizations.tenant_id = users.tenant_id
       WHERE organizations.slug = ?
         AND users.email = ?
       LIMIT 1`,
      [organization_slug, email]
    );

    const user = rows[0];

    if (!user || !user.is_active || !user.organization_is_active) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken({
      user_id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
      name: user.name,
      organization_slug: user.organization_slug
    });

    return res.json({
      token,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization_name: user.organization_name,
        organization_slug: user.organization_slug
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/admin-password/reset', async (req, res, next) => {
  const connection = await pool.getConnection();

  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const tokenHash = hashResetToken(token);
    const [rows] = await connection.execute(
      `SELECT
         password_reset_tokens.id AS reset_token_id,
         users.id AS user_id,
         users.role
       FROM password_reset_tokens
       INNER JOIN users
         ON users.id = password_reset_tokens.user_id
       WHERE password_reset_tokens.token_hash = ?
         AND password_reset_tokens.used_at IS NULL
         AND password_reset_tokens.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    const resetRequest = rows[0];

    if (!resetRequest || resetRequest.role !== 'ORG_ADMIN') {
      return res.status(400).json({ message: 'Invalid or expired admin setup link' });
    }

    const passwordHash = await hashPassword(password);

    await connection.beginTransaction();

    await connection.execute(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`,
      [passwordHash, resetRequest.user_id]
    );

    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = ?`,
      [resetRequest.reset_token_id]
    );

    await connection.commit();

    return res.json({ message: 'Admin password has been set. You can now sign in.' });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
});

module.exports = router;
