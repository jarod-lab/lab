# Checks

| node | requirement | verdict | evidence |
|---|---|---|---|
| B0 | full chain green on main@53a0710 before any change | pass | lint, typecheck, test:coverage, baseline, format:check, build all exit 0 (scratchpad b0.log) |
| N2 | errors/api/mcp typecheck, lint, tests + coverage (uncached) | pass | `turbo --force` 9/9 tasks; api 44, errors 8, mcp 16 tests; branch c34f8f3 |
| N2 | apps/api green except openapi snapshot | unresolved→M1 | node report: 1/22 contract tests fail on snapshot only; M1 regenerates and reviews diff |
| N3 | web typecheck, lint, tests + coverage, build (uncached) | pass | `turbo --force` 11/11 tasks; 84 tests; dist = index.html + assets/; branch 74087c1 |
| N3 | real-browser OAuth round trip | unresolved | Chrome extension not connected for the node; covered later by N8 over HTTP only |
| N1 | auth/db/api-app typecheck, lint, tests + coverage (uncached) | pass | `turbo --force` 15/15; auth 49, db 8, api-app 83 (incl. device-flow.test.ts); branch 9398f6a |
| N1 | oauth-flow.test.ts, principal.test.ts, openapi.json unchanged | pass | `git diff --stat agent-graph...9398f6a -- <those files>` empty |
| N1 | migration 0003 generated, not applied | pass | `0003_ambiguous_ezekiel.sql` on branch; user runs db:migrate |
| M1 | merge N1+N2+N3, lockfile via pnpm install, openapi.json regenerated | pass | merges 3631b56, 67ac0a8, 1f58e99; openapi diff +140/-0 (additive: Idempotency-Key, 429/Retry-After, hint/docs) |
| M1 | full chain uncached | fail→N1 correction #1 | auth device.test.ts + signup.test.ts time out (30s) under full parallel run; pass alone (49/49) |
| N1 fix#1 | full parallel test:coverage passes twice; signup 429 sets retry-after header | pass | node report: 2 forced runs 13/13; diff 6863886..99c678d test-only + interval option (prod default 5s unchanged) |
| N3b | ui tokens generated; client plugins; dev proxy; sign-out; web/ui tests | pass | `.bg-card{` in storybook-static iframe CSS and web dist CSS; web+ui coverage forced 2/2; branch fb04aeb |
| N3b | API_URL (vite dev proxy) in packages/env + .env.example | unresolved→M2 | node didn't own env; add to .env.example after N4 merge |
| N4 | hooks, CORS, static, new ops, openapi regenerated; full chain | pass | node: api-app 150 passed / 1 skipped (signup's MCP contract, REST-only by design); branch a6215ca |
| M2 | merge N1fix+N3b+N4, API_URL in env + .env.example, full chain uncached | pass | TURBO_FORCE: lint/typecheck/test:coverage 13/13, baseline, format, build 2/2; contract snapshot matches |
| N4 | revoking an OAuth client stops its tokens immediately | fail→N4b | JWT access tokens have no row; resolvePrincipal only checks signature + membership (up to 3600s) |
| N4 | API-key 429 carries Retry-After | fail→N4b | principal.ts drops better-auth tryAgainIn |
