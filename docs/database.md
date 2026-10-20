# Database and auth

- App tables go in `packages/db/src/schema.ts`. Auth tables (`user`, `session`, `account`,
  `verification`) are generated into `src/auth-schema.ts`. Regenerate them with
  `pnpm --filter @starter/auth generate` after changing auth options or plugins.
- New migration: `pnpm --filter @starter/db db:generate`, then commit the SQL in
  `packages/db/drizzle/`.
- Applying migrations (`db:migrate`, `drizzle-kit push`) is denied for agents. Ask the user to run
  them, or to run `scripts/release.mjs` in a deploy.
- Each git worktree made with `pnpm wt` has its own database, `starter_wt_<name>`, with that
  branch's migrations applied. `pnpm wt reset-db` rebuilds it. Agents run these; the main database
  stays the user's. See `docs/tooling.md` (Worktrees).

## Migrations

- `0001_agent_auth` adds the API key, JWKS and OAuth tables (apikey, jwks, oauth_*).
- `0002_organizations` adds organization, member, invitation, `session.active_organization_id` and
  the example `project` table.
- `0003_agent_distribution` adds `audit_event`, `usage_daily`, `idempotency_key`,
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
- `0011_auth_hardening` adds:
  - `rate_limit`, the counts for the auth rate limits (`packages/auth/src/rate-limit.ts`);
  - composite indexes for the OAuth grant check (`oauth_consent` and `oauth_refresh_token`, by
    client, organization and user; `grantStands` in `packages/auth/src/principal.ts`), declared in
    `withGrantIndexes()` in `packages/auth/src/index.ts` so `auth generate` keeps them. A plain
    `CREATE INDEX` blocks writes while it builds; on a large table, run
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS` by hand before applying 0011. The single-column
    `clientId` indexes on those tables are now redundant;
  - `member.source`: `"scim"` for a membership the directory created, else null. SCIM
    deprovisioning removes only those (`packages/auth/src/scim-projection.ts`).
- `0013_notification_email` adds better-inbox 0.6's email delivery: `notification.seen_at`, the
  `notification_delivery` queue (indexed by status and due time, and by person, type and channel
  for throttling; declared in `withDeliveryIndexes()` so `auth generate` keeps them) and
  `inbox_presence` (when each person's bell last polled). See `docs/notifications.md`.
<!-- template:start -->
- Migrations `0003` through `0011` are not applied until the user runs them.
<!-- template:end -->

## Cleanup

`pnpm --filter @starter/api-app cleanup` (`apps/api/src/cleanup.ts`, `apps/api/src/data/cleanup.ts`)
deletes, in batches of 1000: signup attempts older than 25 hours (the window is coupled by hand to
`signup.ts`), expired idempotency keys, and expired `device-org:` verification rows. It is
cross-tenant and takes no proof, and only the entry calls it, never a request. Schedule it hourly;
it exits 1 on failure.
