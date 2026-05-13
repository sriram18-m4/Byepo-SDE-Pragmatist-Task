require('dotenv').config();

const pool = require('../src/db');
const { hashPassword } = require('../src/auth');

async function seed() {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const orgAdminPassword = await hashPassword('admin123');
  const endUserPassword = await hashPassword('user123');

  await pool.execute(
    `INSERT INTO organizations (tenant_id, name, slug, is_active)
     VALUES (?, 'Acme Retail', 'acme', 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active)`,
    [tenantId]
  );

  await pool.execute(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
     VALUES (?, 'Ava Admin', 'admin@acme.test', ?, 'ORG_ADMIN', 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), is_active = VALUES(is_active)`,
    [tenantId, orgAdminPassword]
  );

  await pool.execute(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
     VALUES (?, 'Eli Enduser', 'user@acme.test', ?, 'END_USER', 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), is_active = VALUES(is_active)`,
    [tenantId, endUserPassword]
  );

  await pool.execute(
    `INSERT INTO feature_flags (tenant_id, feature_key, name, description, enabled)
     VALUES
       (?, 'new_checkout', 'New Checkout', 'Switches users to the new checkout flow.', 1),
       (?, 'beta_search', 'Beta Search', 'Enables the experimental search experience.', 0)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), enabled = VALUES(enabled)`,
    [tenantId, tenantId]
  );

  console.log('Seeded Acme Retail demo tenant.');
  console.log('Org admin: org=acme, email=admin@acme.test, password=admin123');
  console.log('End user:  org=acme, email=user@acme.test, password=user123');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
