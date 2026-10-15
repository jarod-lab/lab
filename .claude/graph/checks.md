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
