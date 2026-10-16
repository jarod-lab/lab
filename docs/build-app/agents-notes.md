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
