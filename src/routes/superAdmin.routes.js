const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { hashPassword } = require('../auth');
const { verifyToken, checkRole } = require('../middleware/auth.middleware');
const { toBoolean } = require('../utils/booleans');
const {
  createResetToken,
  hashResetToken,
  createResetExpiry,
  createResetLink
} = require('../utils/passwordReset');
const { sendAdminSetupEmail } = require('../mailer');

const router = express.Router();

router.use(verifyToken, checkRole('SUPER_ADMIN'));

router.get('/organizations', async (req, res, next) => {
  try {
    const [organizations] = await pool.execute(
      `SELECT
         organizations.id,
         organizations.tenant_id,
         organizations.name,
         organizations.slug,
         organizations.is_active,
         organizations.created_at,
         MAX(CASE WHEN users.role = 'ORG_ADMIN' THEN users.name END) AS admin_name,
         MAX(CASE WHEN users.role = 'ORG_ADMIN' THEN users.email END) AS admin_email,
         COUNT(DISTINCT users.id) AS user_count,
         COUNT(DISTINCT feature_flags.id) AS flag_count
       FROM organizations
       LEFT JOIN users
         ON users.tenant_id = organizations.tenant_id
       LEFT JOIN feature_flags
         ON feature_flags.tenant_id = organizations.tenant_id
       GROUP BY
         organizations.id,
         organizations.tenant_id,
         organizations.name,
         organizations.slug,
         organizations.is_active,
         organizations.created_at
       ORDER BY organizations.created_at DESC`
    );

    return res.json({ organizations });
  } catch (err) {
    return next(err);
  }
});

router.post('/organizations', async (req, res, next) => {
  const connection = await pool.getConnection();

  try {
    const {
      name,
      slug,
      admin_name,
      admin_email
    } = req.body;

    if (!name || !slug || !admin_name || !admin_email) {
      return res.status(400).json({
        message: 'name, slug, admin_name, and admin_email are required'
      });
    }

    const tenantId = crypto.randomUUID();
    const temporaryPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await hashPassword(temporaryPassword);
    const resetToken = createResetToken();
    const resetLink = createResetLink(resetToken);

    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO organizations (tenant_id, name, slug)
       VALUES (?, ?, ?)`,
      [tenantId, name, slug]
    );

    const [adminResult] = await connection.execute(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'ORG_ADMIN')`,
      [tenantId, admin_name, admin_email, passwordHash]
    );

    await connection.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [adminResult.insertId, hashResetToken(resetToken), createResetExpiry()]
    );

    await connection.commit();

    let emailDelivery;
    try {
      emailDelivery = await sendAdminSetupEmail({
        to: admin_email,
        name: admin_name,
        organizationName: name,
        resetLink
      });
    } catch (emailErr) {
      emailDelivery = {
        sent: false,
        resetLink,
        error: emailErr.message
      };
    }

    return res.status(201).json({
      organization: {
        tenant_id: tenantId,
        name,
        slug,
        is_active: 1
      },
      admin_setup: emailDelivery
    });
  } catch (err) {
    await connection.rollback();

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Organization slug or admin email already exists for this tenant' });
    }

    return next(err);
  } finally {
    connection.release();
  }
});

router.put('/organizations/:tenantId', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { name, slug, is_active } = req.body;

    if (!name || !slug || typeof is_active === 'undefined') {
      return res.status(400).json({ message: 'name, slug, and is_active are required' });
    }

    const [result] = await pool.execute(
      `UPDATE organizations
       SET name = ?, slug = ?, is_active = ?
       WHERE tenant_id = ?`,
      [name, slug, toBoolean(is_active), tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    return res.json({ message: 'Organization updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Organization slug already exists' });
    }

    return next(err);
  }
});

router.post('/organizations/:tenantId/admin-reset', async (req, res, next) => {
  const connection = await pool.getConnection();

  try {
    const { tenantId } = req.params;
    const [rows] = await connection.execute(
      `SELECT
         users.id AS user_id,
         users.name AS admin_name,
         users.email AS admin_email,
         organizations.name AS organization_name
       FROM users
       INNER JOIN organizations
         ON organizations.tenant_id = users.tenant_id
       WHERE users.tenant_id = ?
         AND users.role = 'ORG_ADMIN'
       LIMIT 1`,
      [tenantId]
    );

    const admin = rows[0];

    if (!admin) {
      return res.status(404).json({ message: 'Organization admin not found' });
    }

    const resetToken = createResetToken();
    const resetLink = createResetLink(resetToken);

    await connection.beginTransaction();

    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ?
         AND used_at IS NULL`,
      [admin.user_id]
    );

    await connection.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [admin.user_id, hashResetToken(resetToken), createResetExpiry()]
    );

    await connection.commit();

    let emailDelivery;
    try {
      emailDelivery = await sendAdminSetupEmail({
        to: admin.admin_email,
        name: admin.admin_name,
        organizationName: admin.organization_name,
        resetLink
      });
    } catch (emailErr) {
      emailDelivery = {
        sent: false,
        resetLink,
        error: emailErr.message
      };
    }

    return res.json({
      message: 'Admin password setup link created',
      admin_setup: emailDelivery
    });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
});

router.delete('/organizations/:tenantId', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const [result] = await pool.execute(
      `DELETE FROM organizations
       WHERE tenant_id = ?`,
      [tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    return res.json({ message: 'Organization deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
