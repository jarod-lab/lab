# Checks

| node | requirement | verdict | evidence |
|---|---|---|---|
| N0 | QueryClient in router context, org-scoped keys | pass | `pnpm --filter @starter/web test:coverage`: 101 passed; typecheck, lint exit 0 (commit 6ae77ca) |
| N0 | devtools dev-only | pass | `grep -rl -E "TanStackDevtools\|@tanstack/[a-z-]*devtools" apps/web/dist` → NO_DEVTOOLS_IN_DIST |
| E0 | e2e configured, smoke passes desktop + phone | pass | `pnpm e2e`: 2 passed (commit 4d97424) |
| E0 | email / WebAuthn / TOTP answered | pass | email: no inbox → dev mail sink needed (N5); WebAuthn: no virtual authenticator → passkeys tested at API level + JS stub; TOTP: compute in test |
| N4 | shell components, stories, a11y, coverage | pass | ui test:coverage 196 passed, 98% stmts; typecheck/lint clean; storybook build ok; app-shell.tsx deleted |
| N1 | plugins wired, flows tested over HTTP | pass | auth 56 passed; api-app 205 passed (auth-flows +21); typechecks clean (commit 263dab3) |
| N1 | OAuth resume via magic link + 2FA; claim via magic link ends sk_ key; impersonation refused; HIBP; reserved slugs | pass | tests in apps/api/src/auth-flows.test.ts |
| N1 | migration generated, not applied | pass | packages/db/drizzle/0004_auth_plugins.sql |
| N1 | magic link must not bypass 2FA | fail → N2 | N1 report: 2FA user signs in by link with full session |
| N1 | passkey sign-in / device-approve impersonation over HTTP | unresolved | WebAuthn untestable over HTTP; device-approve guard untested |
| N5+P1 | shell, org switcher, /new, hotkeys, theme on real data | pass (unit) | web test:coverage 154 passed, 93.9% stmts; typecheck/lint/build ok (commit d176e5a) |
| N5+P1 | apps/api serves every web route | pass | static.test.ts derives paths from routeTree.gen.ts; turbo hashes routeTree for api-app tests |
| N5+P1 | e2e app-shell journey | unresolved | `e2e list` ok; needs Postgres + migrations 0003+ (E1) |
| N5+P1 | visual check vs OrgSwitcher/Sidebar/Topbar boards | unresolved | needs running stack (E1) |
| N2 | sso/scim/stripe wired, owner-only, tested over HTTP | pass | auth 67 passed; api-app 20 files 221 passed (full run); typechecks clean (commit 3f75437) |
| N2 | magic link no longer bypasses 2FA | pass | auth-flows: link → /two-factor, no session until TOTP |
| N2 | device approve refused while impersonating | pass | auth-flows test, 403 IMPERSONATED_SESSION_NOT_ALLOWED |
| N2 | dev mail sink | pass | dev-mail.test.ts (enabled returns link; disabled 404) |
| N2 | migration 0005 generated, not applied | pass | packages/db/drizzle/0005_sso_scim_stripe.sql |
| N2 | social/SSO sign-in skip TOTP | unresolved (accepted) | IdP/provider handles MFA; documented |
| P2 | Org General: owner/viewer, save/discard, transfer, delete (typed), leave | pass (unit) | web test:coverage 177 passed; ui 197 passed (commit below) |
| P2 | e2e org-general + visual | unresolved | needs stack (E1); viewer e2e needs P3 invites |
| P4 | API keys: list (table), create (secret once), revoke | pass (unit) | web test:coverage 204 passed |
| P4 | board columns prefix/expires/created-by; read-only table for members | fail → P4b after N3 | needs `list_api_keys` (apiKey:read) with prefix/expiresAt/createdBy; requested from N3 |
| P4 | e2e api-keys + visual | unresolved | needs stack (E1) |
| N3 | agents/runs/approvals/steer/defer ops, proofs, catalog, 409 org header, list_api_keys, member security | pass | auth 67, auth-proofs 5, sdk 39, api 54, api-app 22 files 335 passed; repo typecheck + lint 15/15 (commit 1ad261c) |
| N3 | migration 0006 generated, not applied | pass | packages/db/drizzle/0006_agent_runs.sql |
| N3 | seed-demo-run.mjs against a live server | unresolved | needs stack (E1) |
| A1 | change email (+ old-address notice), delete account (confirm, owner block), linking (last way in), session login method, security summary | pass | auth 81 passed; api-app 356 passed; typechecks clean (commit aa9fb29) |
| A1 | migration 0007 generated, not applied | pass | packages/db/drizzle/0007_session_login_method.sql |
| A1 | change-email cancel | unresolved (accepted) | not native in better-auth 1.7.7; UI hides its pending state only |
| P3 | Members: invite, roles, remove, 2FA column, last active, reset 2FA, invitations, role matrix from catalog | pass (unit) | web 261 passed (commit 331f5bc) |
| P4b | API keys read-only list for members, prefix/creator/expiry, picker aligned | pass (unit) | same run |
| P3 | role matrix row "API keys and billing" split (billing owner-only in the catalog) | deviation | board says admin has billing; catalog makes subscription owner-only (N2) |
| P3/P4 | e2e members, api-keys, org-general viewer | unresolved | needs stack (E1) |
| P7 | Agents settings: list w/ status, pin (sidebar), create, rename, autonomy + always-ask, delete w/ run count, viewer, empty, error | pass (unit) | web 342 passed (P7 run), commit 72d20ca |
| P7 | Budgets & footprint pill edits energyBudgetWh; one h1 on the Connected view | fail → P7b | report: budgets is [PLACEHOLDER] though update_agent supports it; Connected view has two h1s |
| P7 | Guardrails pill | unresolved (accepted) | no guardrails in the API → [PLACEHOLDER] view |
| N0 | devtools gate grep | refined | `@tanstack/devtools-event-client` (form-core dep) ships in dist; gate = no `TanStackDevtools`/`@tanstack/react-devtools`/panel code |
| P5+P6 | Profile + Security + /two-factor | pass (unit) | 93 tests in their files pass; committed (route tree lands with P8) |
| P5+P6 | server gaps: enabled-provider list, provider username, pending email record, passkey last used | unresolved | enabled-provider list → S1 (needed by P10 too); others accepted as better-auth limits |
| P5+P6 | e2e profile, security | unresolved | needs stack (E1) |
| S1 | GET /api/auth/sign-in-methods + client helper + personalSlug export | pass | auth 87 passed; auth-flows 71 passed (commit 9beea74) |
| P8 | run view: steps, live polling, approval + server-clock undo countdown, viewer read-only, steer, defer, footprint, markdown summary w/ highlighting, org home run list, inbox count | pass (unit) | web 420 passed (P8 run); baseline 0 errors |
| P7b | budgets edits energyBudgetWh; one h1 on Connected | pass (unit) | same run |
| P8 | polling throttled with Pacer; sidebar "N running" | fail → P8b | uses react-query refetchInterval; running count not wired |
| P8 | e2e run-view + visual | unresolved | needs stack (E1) |
| P8b | Pacer-throttled polling (pause hidden, stop done/failed); sidebar N running | pass (unit) | use-run-polling.test.tsx, inbox.test.tsx; web 465 passed |
| P9 | Billing: BillingAdapter (fixture + stripe), [SAMPLE DATA]/[PRICE], owner-only changes, invoices table, real requests-today usage | pass (unit) | billing 31 tests; web 465 passed |
| P9 | stripe without plans fell into an error state | pass (fixed by lead) | sign-in-methods reports stripe only with ≥1 plan (sign-in-methods.test.ts) |
| P9 | board says owners+admins see billing; catalog makes subscription owner-only | deviation | admin read-only, matches N2 catalog |
| lead | Tailwind didn't scan packages/ui/src/dplus | pass (fixed) | app.css `@source ".../dplus"`; commit ccb67ac |
| P10 | auth pages restyled per Auth board, methods from sign-in-methods, Last used, magic link, SSO, breached message, OTP 2FA, invitation | pass (unit) | web 465 passed; onboarding + oauth-flow 19 passed (commit f51e235) |
| P10 | "Forgot password?" | fail → P10b | no request-reset UI |
| P10 | passkey on sign-up; inviter name | unresolved (accepted) | better-auth 1.7.7: passkey needs a session; getInvitation has no inviter name |
| P10b | Forgot password inline on /sign-in, no account enumeration | pass (unit) | web 468 passed; onboarding+oauth 19 passed |
| P11 | org Security: SSO providers (OIDC/SAML add, delete), SCIM token once, owner-only, honest gaps | pass (unit) | 33 tests in its files |
| P11 | SSO domain verification | fail → P11b | `sso()` had no domainVerification: providers unverified yet usable (domain takeover risk) |
| P11b | SSO domain verification on; unverified providers can't sign in; owner-only verification endpoints; web Verify domain flow | pass | auth 87; auth-flows 74; web 540 passed. Migration 0008_sso_domain_verification (not applied) |
| P11b | DNS success path | unresolved | plugin's dynamic DNS import can't be mocked; refusal path tested |
| P11b | admins can read SSO provider config via /sso/providers, /sso/get-provider | unresolved (low) | writes are owner-only; reads follow the plugin's admin rule — raise at Z |
| P12 | /admin: users table (search by email, paging, status word), ban (reason, duration, consequence), unban, impersonate + banner with Stop, sign out everywhere, role with confirmation; Not available for non-admins and while impersonating | pass (unit) | admin-page, admin container, banner, admin-api (method/path table) tests; web 540 passed; coverage 87.7/79.9/86.6/89.8 |
| P12 | static route test (`/admin`, `/admin/*` served) | pass | api-app static.test.ts 8 passed |
| P12 | lint, baseline, format, tsc, build | pass | oxlint clean; baseline 0 errors; tsc clean; build ok; devtools panel names absent from dist (event-client string only, as N0 refined) |
| P12 | `e2e list` (admin desktop + phone) | pass | runs without E2E_ADMIN_* set; signed-out + non-admin cases always run, admin journey skips with a message |
| P12 | e2e admin (run against the stack) | unresolved | needs stack (E1) and an admin account (README "Admin account") |
