USE feature_flags_platform;

ALTER TABLE users
  ADD COLUMN end_user_tenant_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN role = 'END_USER' THEN tenant_id ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uq_users_one_end_user_per_tenant (end_user_tenant_id);
