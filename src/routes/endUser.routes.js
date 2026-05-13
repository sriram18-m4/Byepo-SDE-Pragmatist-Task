const express = require('express');
const pool = require('../db');
const { verifyToken, checkRole, requireTenant } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken, checkRole('END_USER'), requireTenant);

router.get('/feature-flags/:featureKey/status', async (req, res, next) => {
  try {
    const { featureKey } = req.params;

    const [rows] = await pool.execute(
      `SELECT feature_key, enabled
       FROM feature_flags
       WHERE tenant_id = ?
         AND feature_key = ?
       LIMIT 1`,
      [req.user.tenant_id, featureKey]
    );

    const flag = rows[0];

    if (!flag) {
      return res.json({
        feature_key: featureKey,
        exists: false,
        enabled: false
      });
    }

    return res.json({
      feature_key: flag.feature_key,
      exists: true,
      enabled: Boolean(flag.enabled)
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
