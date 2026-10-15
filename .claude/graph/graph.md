# Agent-first distribution graph

## Inputs

- **Task:** close the gaps that stop an agent from finding, onboarding to, using and being trusted with a
  product built from this starter (see the six tiers in the originating conversation).
- **Output:** code on the local integration branch `agent-graph` (never `main`, never pushed), plus
  `.claude/graph/{graph,checks,progress}.md`.
- **Checks:** per-node checks below, and the full chain on the merged branch:
  `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm baseline && pnpm format:check && pnpm build`.
- **Sources:** CLAUDE.md, `.claude/skills/agent-api`, gdp-ts and better-auth skills, installed
  `better-auth` / `@better-auth/oauth-provider` sources (device grant: `oauth-provider/dist/index.mjs`).
- **Scope:** this repo only. No publishing, pushing, deploying, spending, or applying migrations.
- **Limit:** 3 attempts per node, 4 waves. If the limit is hit, stop with a partial status.

## Out of scope (needs the user; recorded, not run)

| Item | Why | What we leave behind |
|---|---|---|
| MCP registry, Claude connectors directory, Smithery submissions | publishing | generated `server.json` + checklist in docs |
| Publishing `skills/starter` (`npx skills add`) | publishing | parity test keeps it publishable |
| Stripe billing | spending/external account | usage metering + quotas only |
| Platform deploy (Fly/Render/etc.) | spending | Dockerfile + release-migrate script |
| LLM onboarding eval | model credential + spend | deterministic HTTP onboarding journey test |
| llms.txt on a marketing domain | no marketing app here | note in docs |
| Applying migration `0003` | denied for agents | user runs `db:migrate` |

## Design decisions (fixed before running)

- **Headless login = OAuth device grant (RFC 8628)**, from `@better-auth/oauth-provider` + better-auth's
  `deviceAuthorization` plugin. It issues normal OAuth JWTs (aud/azp/org/scope), so `resolvePrincipal` is
  unchanged and session tokens still never pass as bearers. NOT the plugin's own `/device/token`
  (that returns a session token). The `org` claim must come from the approving session's active org.
- **Web pages are served by `apps/api` from the API origin** (better-auth cookies live there). `apps/web`
  builds to `apps/web/dist`; `apps/api` serves it when `WEB_DIST_DIR` is set (dev: proxied/served likewise).
- **CORS** only on bearer surfaces (`/mcp`, `/.well-known/*`, `/openapi.json`, `/llms*.txt`, `/v1/*`),
  `credentials: false`, never on `/api/auth/*`. A test asserts both.
- **Idempotency:** `Idempotency-Key` header (REST) / optional `idempotencyKey` arg (MCP, injected by the
  registry for non-readOnly ops). Stored per org+key with request hash; replay returns the stored
  response; same key with a different body is `CONFLICT`.
- **Pagination:** opaque `cursor` + `limit` in, `nextCursor` out; helper in `packages/api`.
- **Errors:** `{ code, message, hint?, docs? }`. FORBIDDEN names the missing permission and the OAuth
  scope / key permission that would cover it. 429 sets `Retry-After` and `RateLimit-*` headers.
- **Audit:** every non-readOnly invocation records org, actor (user/apiKey), OAuth `clientId`, operation,
  outcome, requestId. Operations: `list_audit_events`, `list_connected_agents` (OAuth consents + keys),
  `revoke_agent_access`.
- **Metering:** per org, per day, per operation counters; plan limits from config; `whoami` returns usage
  and limits; over quota is `RATE_LIMITED` with a hint.
- **Web stack (user):** TanStack Start in SPA mode (`spa.enabled`), static output in `apps/web/dist`,
  served by `apps/api`. If SPA mode can't produce a servable static build, the node stops and reports
  instead of standing up a second origin.
- **Provisional signup (user: build it, gated).** Lives in N1 (auth module) + N4 (route/op). It is rate-limited per IP and per
  email domain, creates an unverified user + personal org, sends one claim email, and the resulting
  credential is the device-grant token with a low quota until claimed.

## Nodes

All editing nodes run in a git worktree off the current `agent-graph` head, with
`mise trust && mise install && pnpm install`, and commit their work on a node branch.

| id | node | reads | owns (only it edits) | check |
|---|---|---|---|---|
| B0 | **code**: baseline | repo | `.claude/graph/checks.md` | full chain on `main`, recorded |
| N1 | auth + schema | auth pkg, db pkg, better-auth device docs | `packages/auth/src/index.ts` (+ new auth modules), `auth.cli.ts`, `packages/db/src/{schema,auth-schema}.ts`, `packages/db/drizzle/0003_*`, `apps/api/src/data/{audit,usage,idempotency}.ts`, `packages/auth/src/signup.ts` + test | `@starter/auth` + `@starter/db` tests; device grant end-to-end in a new `apps/api/src/device-flow.test.ts` yields a JWT `resolvePrincipal` accepts with the right `org`; `oauth-flow.test.ts`, `principal.test.ts` unchanged and green; migration applies in PGlite |
| N2 | registry core | `packages/api`, `packages/mcp`, `packages/errors` | `packages/api/src/{operation,pagination,openapi}.ts`, `packages/mcp/src/*`, `packages/errors/src/*` (NOT `llms.ts`) | package tests + coverage; invoke hooks (before/after) for audit/metering/idempotency; error `hint`; idempotencyKey injection; pagination helper |
| N3 | web pages (TanStack Start, SPA) | `packages/ui`, auth client, better-auth endpoints | `apps/web/**` | pages: sign-in, sign-up, consent (org switcher), select-organization, accept-invitation/:id, device, reset-password, claim, settings/agents; a11y tests via `expectNoA11yViolations`; semantic tokens only; `apps/web/dist` builds; coverage ≥ thresholds |
| N3b | web follow-ups | N3 report | `packages/ui/src/styles.css`, `packages/auth/src/client.ts`, `apps/web/**` | ui defines card/muted/destructive/border/input/ring tokens (verified missing; `grep -c -- --card styles.css` = 0) and web drops its workaround; `createClient` includes `oauthProviderClient`; vite dev proxy; sign-out on device + accept-invitation; Storybook build still renders |
| N4 | app wiring | N1, N2 outputs | `apps/api/src/{app,operations,server}.ts`, `packages/env/**`, `.env.example`, new app tests | CORS test (bearer-only, never `/api/auth`); idempotency replay/conflict tests; 429 headers; audit + metering + new ops; static web serving; `list_projects` paginated; gated `POST /v1/signup` (per-IP + per-domain limits, abuse tests) |
| N4b | auth revocation | N4 report | `packages/auth/src/principal.ts` + `principal.test.ts` (additions only) | an OAuth JWT stops working once its client's grant for the org is revoked (live refresh token or consent required for azp+org); API-key 429 → RATE_LIMITED with retry-after header; oauth-flow + device-flow green |
| N5 | discovery + skill | N4 registry | `packages/api/src/llms.ts`, `server.json` generator + committed `server.json`, `skills/starter/**`, parity test | install snippets (Claude Code, Cursor, VS Code, Codex, device-grant curl) in llms.txt and `/`; `server.json` validates against the MCP registry schema; parity test (scopes, error codes, op names vs openapi.json) |
| N6 | SDK + CLI | committed `openapi.json` | `packages/sdk/**`, `packages/cli/**` | typed SDK generated from openapi.json (script, not hand-written); CLI `login` (device grant), `whoami`, generic `call <op> --json`; tests with a fake server; coverage |
| N7 | deploy + CI | N3 dist path, N4 env | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/release.mjs`, `.github/workflows/ci.yml` | `docker build` succeeds if docker is available (else unresolved); CI job diffs `openapi.json` against base for breaking changes (oasdiff) |
| N8 | onboarding journey | everything merged | `apps/api/src/onboarding.test.ts` | over HTTP only: discover from `/llms.txt` + well-known → device grant → `create_api_key` → `create_project` with idempotency → audit shows it |
| N9 | docs | merged branch | `CLAUDE.md`, `AGENTS.md`, `README.md`, `.claude/skills/agent-api/**` | docs describe what was built; the "Not yet" list matches reality |
| M* | **code**: merge | node branches | `agent-graph` | `git merge`; `pnpm install` for lockfile; `pnpm --filter @starter/api-app test -u` for openapi.json; full chain |

## Edges and waves

```
B0 ─► wave 1: N1 ∥ N2 ∥ N3 ─► M1 ─► wave 2: N4 ∥ N3b ─► M2 ─► wave 3: N4b ∥ N5 ∥ N6 ∥ N7 ─► M3 ─► wave 4: N8 ─► N9 ─► M4
```

- N4 consumes N1 (tables, data fns, device grant) and N2 (hooks, pagination, hints).
- N3 depends only on better-auth's endpoint shapes, so it runs in wave 1; its static-serving hook lands in N4.
- N5, N6, N7 consume the post-N4 `openapi.json` / env; they share no files.
- Gate on every merge: the full chain, plus `oauth-flow.test.ts` and `principal.test.ts` with no diff
  unless the node's report justifies it.

## Code nodes (never routed through a model)

B0 baseline run · M1–M4 merges · lockfile via `pnpm install` · `openapi.json` via `test -u` ·
migration via `drizzle-kit generate` · auth schema via `pnpm --filter @starter/auth generate` ·
SDK types via the generator script · full check chain.

## Learning edges (rules proven by accepted results)

- Run every gate with `turbo --force` (or TURBO_FORCE=true): a cached api-app test PASS replayed after
  `packages/api` changed (found by N2).
- `invoke`'s `after` hook does not see FORBIDDEN/BAD_REQUEST or `before`-thrown errors; audit of denied
  attempts must be done by the caller (N2 decision, accepted). N4 audits before-hook refusals itself.
- OAuth JWT access tokens leave no DB row; "revoked" must be checked against refresh tokens/consents (N4).
- Cap vitest workers per package (`maxWorkers` = cores/4 in vitest.base): turbo runs all packages at
  once, and default per-core workers oversubscribed PGlite past 30s timeouts (M3; auth/signup 47s→11s).
- Device-grant clients have no consent row; list them from `oauth_refresh_token` (N4).
