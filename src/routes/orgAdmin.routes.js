const express = require('express');
const pool = require('../db');
const { hashPassword } = require('../auth');
const { verifyToken, checkRole, requireTenant } = require('../middleware/auth.middleware');
const { toBoolean } = require('../utils/booleans');

const router = express.Router();

router.use(verifyToken, checkRole('ORG_ADMIN'), requireTenant);

router.get('/users', async (req, res, next) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, is_active, created_at
       FROM users
       WHERE tenant_id = ?
         AND role = 'END_USER'
       ORDER BY created_at DESC`,
      [req.user.tenant_id]
    );

    return res.json({
      users,
      has_end_users: users.length > 0
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const [existingUsers] = await pool.execute(
      `SELECT id
       FROM users
       WHERE tenant_id = ?
         AND role = 'END_USER'
       LIMIT 1`,
      [req.user.tenant_id]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'This organization already has a shared user account' });
    }

    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'END_USER')`,
      [req.user.tenant_id, name, email, passwordHash]
    );

    return res.status(201).json({
      user: {
        id: result.insertId,
        name,
        email,
        role: 'END_USER',
        is_active: 1
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This organization already has a shared user account, or this email already exists' });
    }

    return next(err);
  }
});

router.get('/feature-flags', async (req, res, next) => {
  try {
    const [flags] = await pool.execute(
      `SELECT id, feature_key, name, description, enabled, created_at, updated_at
       FROM feature_flags
       WHERE tenant_id = ?
       ORDER BY created_at DESC`,
      [req.user.tenant_id]
    );

    return res.json({ flags });
  } catch (err) {
    return next(err);
  }
});

router.post('/feature-flags', async (req, res, next) => {
  try {
    const { feature_key, name, description, enabled } = req.body;

    if (!feature_key || !name) {
      return res.status(400).json({ message: 'feature_key and name are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO feature_flags
         (tenant_id, feature_key, name, description, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.tenant_id,
        feature_key,
        name,
        description || null,
        toBoolean(enabled),
        req.user.user_id
      ]
    );

    return res.status(201).json({
      flag: {
        id: result.insertId,
        tenant_id: req.user.tenant_id,
        feature_key,
        name,
        description: description || null,
        enabled: toBoolean(enabled)
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Feature key already exists in this organization' });
    }

    return next(err);
  }
});

router.put('/feature-flags/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { feature_key, name, description, enabled } = req.body;

    if (!feature_key || !name || typeof enabled === 'undefined') {
      return res.status(400).json({ message: 'feature_key, name, and enabled are required' });
    }

    const [result] = await pool.execute(
      `UPDATE feature_flags
       SET feature_key = ?, name = ?, description = ?, enabled = ?
       WHERE id = ?
         AND tenant_id = ?`,
      [
        feature_key,
        name,
        description || null,
        toBoolean(enabled),
        id,
        req.user.tenant_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Feature flag not found for this organization' });
    }

    return res.json({ message: 'Feature flag updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Feature key already exists in this organization' });
    }

    return next(err);
  }
});

router.patch('/feature-flags/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled === 'undefined') {
      return res.status(400).json({ message: 'enabled is required' });
    }

    const [result] = await pool.execute(
      `UPDATE feature_flags
       SET enabled = ?
       WHERE id = ?
         AND tenant_id = ?`,
      [toBoolean(enabled), id, req.user.tenant_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Feature flag not found for this organization' });
    }

    return res.json({ message: 'Feature flag toggled', enabled: toBoolean(enabled) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/feature-flags/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      `DELETE FROM feature_flags
       WHERE id = ?
         AND tenant_id = ?`,
      [id, req.user.tenant_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Feature flag not found for this organization' });
    }

    return res.json({ message: 'Feature flag deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
