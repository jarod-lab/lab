# Database and auth

- App tables go in `packages/db/src/schema.ts`. Auth tables (`user`, `session`, `account`,
  `verification`) are generated into `src/auth-schema.ts`. Regenerate them with
  `pnpm --filter @starter/auth generate` after changing auth options or plugins.
- New migration: `pnpm --filter @starter/db db:generate`, then commit the SQL in
  `packages/db/drizzle/`.
- Applying migrations (`db:migrate`, `drizzle-kit push`) is denied for agents. Ask the user to run
  them, or to run `scripts/release.mjs` in a deploy.

## Migrations

- `0001_agent_auth` adds the API key, JWKS and OAuth tables (apikey, jwks, oauth_*).
- `0002_organizations` adds organization, member, invitation, `session.active_organization_id` and
  the example `project` table.
- `0003_agent_distribution` (the user runs it) adds `audit_event`, `usage_daily`, `idempotency_key`,
  `signup_attempt` and the device grant's `device_code` table. The first three cascade from
  `organization`. `signup_attempt` is keyed by IP and email domain, not by org.
- `0004_auth_plugins` (passkey, two_factor, admin fields), `0005_sso_scim_stripe`, `0006_agent_runs`
  (agent, run, run_step, approval, steer_message; tenant tables), `0007_session_login_method`,
  `0008_sso_domain_verification` and `0009_steer_message_org_index`.
- `0010_notifications` adds better-inbox's `notification` table. The table is generated into
  `auth-schema.ts`, and the migration appends two custom statements: the
  `(user_id, organization_id, created_at)` index, and a cascading foreign key from
  `organization_id` to `organization`. better-inbox's schema option can't declare either. Neither
  is in the Drizzle snapshot, so `db:generate` leaves them alone; `drizzle-kit push` would drop
  them. `organization_id` is nullable: a personal notice (account security, removal from an org)
  belongs to the user, not to a tenant. It is the one customer-data column allowed to be null. See
  `docs/notifications.md`.
- Migrations `0003` through `0010` are not applied until the user runs them.
