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
- `0010_auth_hardening` adds `rate_limit`, the counts for the auth rate limits
  (`packages/auth/src/rate-limit.ts`).
- `0011_grant_check_indexes` adds composite indexes for the OAuth grant check (`oauth_consent` and
  `oauth_refresh_token`, by client, organization and user; `grantStands` in
  `packages/auth/src/principal.ts`). They are declared in `withGrantIndexes()` in
  `packages/auth/src/index.ts`, so `auth generate` keeps them. A plain `CREATE INDEX` blocks writes
  while it builds; on a large table, run `CREATE INDEX CONCURRENTLY IF NOT EXISTS` by hand before
  applying 0011. The single-column `clientId` indexes on those tables are now redundant.
- `0012_member_source` adds `member.source`: `"scim"` for a membership the directory created, else
  null. SCIM deprovisioning removes only those (`packages/auth/src/scim-projection.ts`).
- Migrations `0003` through `0012` are not applied until the user runs them.

## Cleanup

`pnpm --filter @starter/api-app cleanup` (`apps/api/src/cleanup.ts`, `apps/api/src/data/cleanup.ts`)
deletes, in batches of 1000: signup attempts older than 25 hours (the window is coupled by hand to
`signup.ts`), expired idempotency keys, and expired `device-org:` verification rows. It is
cross-tenant and takes no proof, and only the entry calls it, never a request. Schedule it hourly;
it exits 1 on failure.
