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
