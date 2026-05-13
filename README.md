# Multi-Tenant Feature Flag Management System

This scaffold uses Node.js, Express, MySQL, `mysql2`, custom JWT authentication, optional SMTP email, and plain HTML/CSS/JS frontends.

## Tenant Isolation Model

- `organizations.tenant_id` is the tenant identifier.
- `users.tenant_id` and `feature_flags.tenant_id` are foreign keys to `organizations.tenant_id`.
- Organization admin and end-user APIs never accept a client-supplied tenant id.
- Tenant-scoped queries always use the signed JWT payload: `req.user.tenant_id`.
- Feature keys are unique per tenant with `UNIQUE (tenant_id, feature_key)`.
- Each organization has only one shared `END_USER` account. It is created only by that organization's admin.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and update the MySQL credentials and JWT secret.

3. Create the database schema:

   ```bash
   mysql -u root -p < schema.sql
   ```

4. Optional demo data:

   ```bash
   npm run seed
   ```

5. Start the server:

   ```bash
   npm run dev
   ```

6. Open the interfaces:

   - `http://localhost:5000/Super-Admin.html`
   - `http://localhost:5000/Org-Admin.html`
   - `http://localhost:5000/User-View.html`
   - `http://localhost:5000/Reset-Password.html?token=...`

## Existing Database Migration

If you already created the database before the admin reset feature was added, run this once in MySQL Workbench:

```sql
SOURCE migrations/001_add_password_reset_tokens.sql;
```

Or open `migrations/001_add_password_reset_tokens.sql` in Workbench and click the lightning button.

## Demo Credentials

Super admin credentials come from `.env`:

- Email: `super@local.test`
- Password: `super-password`

After running `npm run seed`:

- Organization slug: `acme`
- Org admin: `admin@acme.test` / `admin123`
- End user: `user@acme.test` / `user123`

## Admin Password Setup

When the super admin creates an organization, they enter the organization details and admin email only. The backend creates a one-time admin setup link.

If SMTP is configured in `.env`, the link is emailed to the admin. If SMTP is not configured, the link is printed in the server terminal and returned to the Super Admin page for local testing.

The super admin can also send a fresh link from the organization list with `Send admin reset link`.

## Organization End Users

After an organization admin logs in, the dashboard checks whether any `END_USER` profile exists for that organization. If none exists, it asks the admin to create one.

The org admin creates the end-user name, email, and password. End users cannot create or reset their own password in this scaffold.

Only one shared end-user account is allowed per organization. After it exists, the Org Admin page hides the create-user form.

## API Summary

### Authentication

- `POST /api/auth/super-admin/login`
- `POST /api/auth/login`
- `POST /api/auth/admin-password/reset`

### Super Admin

Requires `SUPER_ADMIN`.

- `GET /api/super-admin/organizations`
- `POST /api/super-admin/organizations`
- `POST /api/super-admin/organizations/:tenantId/admin-reset`
- `PUT /api/super-admin/organizations/:tenantId`
- `DELETE /api/super-admin/organizations/:tenantId`

### Organization Admin

Requires `ORG_ADMIN`. All routes are scoped to `req.user.tenant_id`.

- `GET /api/org-admin/feature-flags`
- `POST /api/org-admin/feature-flags`
- `PUT /api/org-admin/feature-flags/:id`
- `PATCH /api/org-admin/feature-flags/:id/toggle`
- `DELETE /api/org-admin/feature-flags/:id`
- `GET /api/org-admin/users`
- `POST /api/org-admin/users`

### End User

Requires `END_USER`. The lookup is scoped to `req.user.tenant_id`.

- `GET /api/end-user/feature-flags/:featureKey/status`
