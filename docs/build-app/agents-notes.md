# Notes for AGENTS.md (lead folds these in at node Z)

## Auth plugins (N1)
- passkey (rpID = base URL host, origin = base URL, rpName = app name), twoFactor (TOTP, backup codes,
  trusted devices; redirect `/two-factor`, keeps the query so OAuth resumes), magicLink (Wraps SES),
  lastLoginMethod, haveIBeenPwned (`PASSWORD_COMPROMISED`; `createAuth({ passwordBreachCheck })` defaults false,
  server.ts turns it on; tests stub fetch to api.pwnedpasswords.com), admin (`adminRoles: ["admin"]`, promote
  by DB only), GitHub/Google (env-gated, both values required). No `bearer` (session tokens must not pass as API
  credentials; no client needs it).
- Impersonation: refused on /oauth2/authorize, /oauth2/continue, /oauth2/consent, /device/approve,
  /api-key/create, /api-key/update (`guards.ts`); principal grants are read-only (`IMPERSONATION_GRANTS`).
- Reserved org slugs: `reserved-slugs.ts` (`RESERVED_ORG_SLUGS`), enforced in organizationHooks, exported to the client.
- OAuth resume: every step that resumes an authorization carries `oauth_query`; magic link callbackURL holds it
  (`resume.ts`). Social sign-in can't claim an unverified provisional account (requireLocalEmailVerified) — by design.
- Generated auth schema is unformatted: run `pnpm format` after `pnpm --filter @starter/auth generate`.

## Web (N0)
- Devtools: `src/devtools.tsx`, lazy behind `import.meta.env.DEV && MODE !== "test"`; never in dist.
- Query keys: `qk.org(orgId)…` for every org-scoped query.

## UI (N4)
- Shell components in `packages/ui/src/dplus/shell` (`@starter/ui/dplus/shell/<name>`), presentational, links
  via `renderLink`/`ShellLinkProvider`. DangerAction doesn't confirm; containers add typed-name confirmation.

## e2e (E0)
- `e2e.config.ts`, `e2e/*.e2e.ts`, desktop 1280x720 + phone 390x844. `AI_GATEWAY_API_KEY` read by the runner from
  process env. No dark-mode emulation (override matchMedia in init scripts), no WebAuthn, TOTP computed in test.
  Run artifacts in `.e2e/` (gitignored). Chromium via `pnpm exec e2e-web install chromium`.

## Shell (N5+P1)
- `/$org` = org slug; `OrgGate` sets the active org by id before org content renders. Unknown slug → not-found in
  the shell; reserved slugs → notFound. `/settings/agents` redirects to `/<slug>/settings/agents`. Return param `next`.
- Product calls send `X-Organization-Id` (`lib/org-header.ts`); better-auth org calls pass `organizationId` explicitly.
- Theme: `lib/theme.ts`, key `starter.theme`; boot script inline from `src/theme-boot.js`.
- Hotkeys: Ctrl/Cmd+K palette, G H/G A/G O, `?` shortcuts; ignored while typing.
- apps/api `static.ts` serves `/:org{slug}` paths (reserved slugs fall through to the JSON 404);
  `static.test.ts` checks every route in `routeTree.gen.ts`; turbo hashes the route tree for api-app tests.
- e2e stack: `scripts/e2e-stack.mjs` starts apps/api then vite; needs DATABASE_URL, BETTER_AUTH_SECRET in env.

## Auth plugins B (N2)
- sso/scim/stripe: owner-only resources `sso`, `scim`, `subscription` (OAUTH_EXCLUDED; admin has none),
  enforced by `owner-only.ts` and `scim-token.ts` (`POST /api/auth/scim/generate-token`). SCIM users aren't
  projected into the org yet; no list/revoke of SCIM tokens.
- Stripe: test mode only (`sk_test_` enforced in env and createAuth); mounted only with STRIPE_SECRET_KEY and
  STRIPE_WEBHOOK_SECRET; plans from STRIPE_PLANS JSON. Stripe plugin last in the plugin list.
- Magic link + 2FA: the link opens `/two-factor?callbackURL=…`, not a session. Social/SSO sign-ins don't ask TOTP.
- DEV_MAIL_SINK (dev/e2e only, refused in production): auth emails go to memory, not SES; `GET /api/dev/mail?to=`.
- drizzleAdapter uses `transaction: true` (scim); hooks use `getCurrentAdapter`.

## Org General (P2)
- Editable by `organization:update` (owner/admin) via `client.organization.checkRolePermission`; danger zone
  `organization:delete` (owner). Transfer = target → owner, then caller → admin, both with organizationId.
- `metadata.defaultInviteRole` holds the invite default (merged on save; better-auth replaces metadata wholesale).
- Deleting an org leaves its API keys (reference_id, no FK); they stop working.

## Agent runs (N3)
- Workspace agents at `/v1/workspace-agents` (`/v1/agents` = connected agents = credentials). Ops: list/get/create/
  update/delete_agent, start_run, list_runs, get_run, update_run, append_run_step, update_run_step,
  request_approval, decide_approval, undo_approval, steer_run, defer_run, get_inbox, list_member_security,
  reset_member_two_factor, list_api_keys.
- Catalog: agent CRUD, run {create,read,update,approve,steer}, member:read, twoFactor:reset (owner only). Members
  can't delete agents. Viewer reads only. `run:approve` and `twoFactor:reset` are OAUTH_EXCLUDED; approvals come
  from a person in a session only.
- Approval window: decision effective 30s later (approve or deny); undo before then returns it to pending
  (`undoneAt`). Agents see pending until effective. Clock injected (`now` on createOperations/createTestApp).
- `ORGANIZATION_HEADER` (`X-Organization-Id`, `@starter/api`): resolvePrincipal answers 409 on a mismatch.
- create_api_key refuses owner-only resources and run:approve; stores createdBy in key metadata.
- `scripts/seed-demo-run.mjs` drives a demo run to "needs you" with an API key via the SDK.

## Account (A1)
- `account-plugin.ts`: deletion refused (`OWNS_ORGANIZATION`) while the user owns a non-personal org or one
  with other members; confirmation email first. Unlink refused (`LAST_SIGN_IN_METHOD`) unless a password,
  passkey or other account remains (magic link not counted).
- Email change: link to the new address, notice to the old one (`notices.ts`). No native cancel.
- Sessions carry `loginMethod` + `loginTwoFactor` (`login-method.ts`); `user.twoFactorEnabledAt` stamped on enable.
- `GET /api/auth/security/summary` (`security-summary.ts`): passwordChangedAt, twoFactorEnabled(+At), backupCodesRemaining.

## Members / API keys pages (P3, P4)
- Members security from `GET /v1/members/security`; invitations/roles/removal via better-auth with `organizationId`.
  Resend = inviteMember `resend: true`. Role matrix computed with `checkRolePermission`.
- API keys list `GET /v1/api-keys` (apiKey:read: members+; viewers see the view-only notice), revoke via
  `revoke_agent_access` with `key_<id>`. The secret is shown once and lives only in React state.
- e2e helpers in `e2e/support/`; invitation emails from `GET /api/dev/mail?to=`.

## Agents settings (P7)
- `/:org/settings/agents` with `?view=permissions|guardrails|budgets|connected` and `?agent=<id>`; Connected =
  the older keys/OAuth clients page. Autonomy is per agent (no org default). Sidebar pinned agents come from
  list_agents, only when the session's active org is the page's org (else 409). `router-link.tsx` passes a
  `?query` in href as router search. validateSearch keys must be optional.

## Profile / Security (P5+P6)
- `/account` → `/account/profile`; `/account/security`; `/two-factor` (takes `next`/`callbackURL`, same-origin only,
  resumes OAuth when the query has `client_id`). `signIn` returns `/two-factor` + query on `twoFactorRedirect`.
- Plugin endpoints the client doesn't declare (passkey list/rename/delete, security summary) go through
  `client.$fetch` with a method/path table test (`account-api.test.ts`). Errors map through `accountErrorMessage`.
- Session-management calls need a fresh session (`freshAge`); the UI says "Sign in again".

## Run view (P8)
- `/:org/runs/:runId`; org home lists runs (`?status=`); inbox count via get_inbox → topbar links to
  `/<slug>?status=needs_you`. Server clock skew from the response Date header (`lib/server-clock.ts`); the undo
  countdown is effectiveAt − skewed now. Markdown via react-markdown (no raw HTML); code tokenized with
  sugar-high's `parse` into React spans (`.run-code` token colours in app.css map to semantic tokens).

## Billing (P9)
- `lib/billing/`: `BillingAdapter` with `fixtureBillingAdapter` ([SAMPLE DATA], [PRICE]; mutations throw
  "Billing isn't connected yet") and `createStripeBillingAdapter` (better-auth stripe client). Chosen from
  `signInMethods().stripe` (true only with ≥1 plan). Usage ("requests today") is real, from `/v1/whoami`.
- app.css `@source`s both `packages/ui/src/components/ui` and `packages/ui/src/dplus`.

## Auth pages (P10)
- Sign-in loads `GET /api/auth/sign-in-methods` (password only until it loads); magic link / social / SSO
  callbacks return to /sign-in with the OAuth query and resume. Breached password identified by
  PASSWORD_COMPROMISED. Two-factor uses input-otp; trust device posts through `$fetch` (typed client omits it).
- jsdom: input-otp needs `document.elementFromPoint` stubbed.

## Admin (P12)
- `/admin` (not an org route): admins only, by the session's `role` (`admin`) and no impersonation. Everyone else
  gets "Not available"; the server refuses the calls anyway. Signed out → `/sign-in?next=/admin`.
- Promote by DB only: `update "user" set role = 'admin' where email = …`. Keep 2FA off on that account for e2e.
- Actions go through the admin client (`lib/admin-api.ts`); impersonation starts with `queryClient.clear()` and a
  client navigation to `/`. `ImpersonationBanner` (mounted in `__root.tsx`) shows across the app while
  `session.impersonatedBy` is set; Stop returns to `/admin`.
- Rows: the Impersonate action is disabled for admins and for the caller's own row; Ban is disabled on the caller's row.
