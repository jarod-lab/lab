# starter

Turborepo + pnpm 11 monorepo, TypeScript. `apps/api` is a reference Hono API; add more apps under `apps/`.

## Setup

```bash
mise trust && mise install   # Node 24, pnpm 11, gitleaks (a fresh clone is untrusted until you do this)
pnpm install
pnpm init-project <name> [owner] [--domain <domain>]  # template only: renames scope, DB, display and MCP registry names
cp .env.example .env         # mise loads it; BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d db      # optional local Postgres; tests don't need it
```

## Layout

- `apps/api` — Hono on Node (`@hono/node-server`, run with `tsx`). `createApp` in `app.ts` serves REST, `/mcp`,
  `/openapi.json`, `/llms.txt`, `/llms-full.txt`, `/.well-known/mcp/server.json`, `/health`, OAuth discovery under
  `/.well-known/` and better-auth at `/api/auth/*`. With `WEB_DIST_DIR` set it also serves the web app's pages.
  Operations live in `src/operations.ts`; invoke hooks (metering, idempotency, audit) in `src/hooks.ts`; tenant data in
  `src/data/`. `server.ts` only wires env, the DB and the listener (excluded from coverage)
- `apps/web` — `@starter/web`: TanStack Start in SPA mode (sign-in, consent, device, agents settings). `vite build` writes
  `apps/web/dist`, which apps/api serves from its origin. Dev: `vite dev` proxies `/api`, `/v1`, `/mcp`, `/.well-known`
  to `API_URL`
- `packages/api` — operation registry: `defineOperation`, `defineRegistry`, `invoke` (scopes → input → handler →
  output validation), `openApiDocument`, `llmsTxt`, `llmsFullTxt`, `serverJson`, pagination helpers. Framework-agnostic
- `packages/sdk` — `@starter/sdk`: typed client generated from `apps/api/openapi.json` (`src/schema.gen.ts`), with
  retries, idempotency keys, `StarterError`, `paginate`
- `packages/cli` — `@starter/cli`, binary `starter`: `login` (device grant), `logout`, `whoami`, `ops`, `call <operation>`
- `packages/mcp` — `createMcpHandler({ operations, authenticate, resourceMetadataUrl })`: stateless Streamable HTTP
  MCP server as a Web handler; `protectedResourceMetadata` (RFC 9728)
- `packages/ui` — shadcn/ui components + Storybook; use `cn` from `cn`, never clsx/tailwind-merge
- `packages/db` — Drizzle ORM (Postgres), committed migrations in `drizzle/`, test helper `@starter/db/testing`. App tables
  include `audit_event`, `usage_daily`, `idempotency_key` and `signup_attempt` (see Database and auth)
- `packages/auth` — better-auth: `createAuth({ db, secret, baseURL, emailFrom })`, `createClient()`; Wraps plugin for contact
  sync and SES auth emails; organizations (personal org on signup); org-owned API keys (`sk_`); OAuth 2.1 + jwt plugin.
  `access.ts` is the permission catalog (`statements`) and roles; it's imported by the browser client, so it may only
  import better-auth's access modules. `permissions.ts` re-exports it and adds grant math and OAuth scope grants.
  `resolvePrincipal(auth, headers, { audience })` turns an API key, OAuth token or session into a `Principal`.
  `device.ts` is the device grant, `signup.ts` provisional signup
- `skills/starter` — template skill shipped to customers' agents (not one for this repo; those are in `.claude/skills`)
- `packages/auth-proofs` — gdp-ts proofs: branded ids in `lib/ids.ts`, trusted provers in `proofs/` (`callerActsFor`,
  `projectInOrg`), compile-time misuse cases in `mistakes.types.ts`. Tenant data functions take proofs as arguments
- `packages/logger` — pino with secret redaction: `createLogger({ name })`
- `packages/errors` — `AppError` (with `hint`, `docs`, `headers`)/`ErrorCode`, `Result` (`ok`/`err`/`attempt`), `reportError` + `setErrorReporter`
- `packages/observability` — `observe(handler, { logger })` wraps a Web `Request`/`Response` handler (request id, access log, error handling); `createHealthHandler(checks)`
- `packages/env` — the only place env vars are read (validated with Zod)
- `packages/config` — shared tsconfig and Vitest base config
- `scripts/` — `init-project.mjs`, `generate-stories.mjs`, `release.mjs` (the release step: applies migrations from `DATABASE_URL`)
- `Dockerfile`, `.dockerignore`, `docker-compose.yml` — the API image (runs apps/api with tsx, `WEB_DIST_DIR` set to the
  built web app); compose's `migrate` service runs `scripts/release.mjs` before `api` starts
- `server.json` — the committed MCP registry record (placeholder origin; the live one is `/.well-known/mcp/server.json`)

## Before you call a change done

Run each of these (pnpm does not chain script names, so `pnpm lint typecheck` only runs `lint`):

```bash
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm baseline && pnpm format:check && pnpm build
```

After an API change, first run `pnpm --filter @starter/api-app test -u` and `pnpm --filter @starter/sdk generate`.
CI runs the same, plus gitleaks over history, commitlint over PR commits, an oasdiff breaking-change check on
`apps/api/openapi.json` (pull requests only) and a Docker build. `pnpm format` fixes formatting.

## Rules

- **Commits:** Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`, `perf`, `build`, `style`, `revert`).
  Header and every body line must be 100 characters or fewer, or commitlint rejects it. PR titles follow the same format.
  Dependabot commits (signed off by `dependabot[bot]`) are exempt, since it writes "Bump x from a to b".
- **Hooks:** pre-commit runs gitleaks, baseline and a format check; commit-msg runs commitlint. Never use `--no-verify`.
  If gitleaks flags a test fixture, add `// gitleaks:allow` on that line. Don't allowlist whole files.
- **Logging:** use `@starter/logger`, never `console.*` or pino directly (baseline errors on both). Throw
  `AppError`; never send an `INTERNAL` message to a client, use `error.toPublic()`. Register Sentry once at
  startup with `setErrorReporter`.
- **Observability:** wrap every route handler in `observe` from `@starter/observability` and expose a health route with
  `createHealthHandler`. It reports only 5xx or non-exposed errors; 4xx are logged. Server-error logs include only
  allowlisted request headers (`safeHeaders`), never the full set. No error-tracking SDK is installed yet:
  until an app registers one with `setErrorReporter`, reported errors go nowhere (only the logs).
- **Accessibility:** oxlint's `jsx-a11y` rules are errors everywhere except the vendored `packages/ui/src/components` and
  `src/hooks` (see `overrides` in `.oxlintrc.json`). Test app UI with `expectNoA11yViolations(html)` from `@starter/ui/a11y`
  (axe-core; the test file needs `// @vitest-environment jsdom`, and an app needs `jsdom` as its own devDependency). jsdom can't check colour contrast or landmarks, so those
  rules are off. The shadcn demos are not swept: about half have axe violations in shadcn's own demo content.
  Storybook's a11y panel is a dev aid only; nothing fails CI on it.
- **Env:** add every variable to `packages/env` and `.env.example`; read it from there, not `process.env` (baseline
  `use-starter-env`; its exceptions are listed in `baseline.toml`). Never read or edit `.env` (denied in settings).
- **Authorization:** declare what an operation needs in its `permissions` (enforced by `invoke`), and guard tenant data
  with gdp-ts proofs (see the gdp-ts and agent-api skills). Don't hand-roll role or ownership checks in handlers.
- **UI:** semantic tokens and dark-mode variants only, no raw colors like `bg-white` (baseline `shadcn-strict`).
  `@shadcn/lint` is registered with no rules enabled; add rules in `.oxlintrc.json`.
- **Formatting and lint:** Biome formats only (no semicolons, 100 columns); Oxlint lints. Biome skips `.claude/` and lockfiles.
- **pnpm 11:** dependency build scripts must be approved in `pnpm-workspace.yaml` (`allowBuilds`). pnpm maintains
  `minimumReleaseAgeExclude` itself for very new releases; don't hand-edit it.
- **Vendored shadcn code:** `packages/ui/src/components/ui/` (60 components) and `src/hooks/` come from the shadcn CLI, style
  **`base-sera`** (Base UI primitives via `@base-ui/react`, lucide icons, sharp corners), set in `packages/ui/components.json`.
  Add or update with `cd packages/ui && npx shadcn@latest add <name> --overwrite`, never by hand-writing a clone. They get smoke
  tests (`all.test.tsx`, `examples.test.tsx`), not coverage thresholds. Base UI uses a `render` prop where Radix used `asChild`.
  `npx shadcn@latest apply` does not work here (it needs a detected framework); change `style` in `components.json` and `add`
  the components instead. The registry's `form` is an empty stub for this style, so forms use `Field`/`FieldGroup`.
  `styles.css` must keep `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"`: without them Tailwind silently drops the
  `data-open:`/`data-closed:` variants and the `animate-in`/`animate-out` utilities, and typecheck won't notice. Rebuild Storybook and
  check the CSS if you touch them. baseline allows `bg-black/20` (the overlay scrim used by dialog, sheet and drawer).
  `sonner` pulls in `next-themes` for theming; it works without Next but needs a theme provider to follow dark mode.
- **Stories:** every component has a story that renders shadcn's own example for `base-sera` (`src/components/<name>-example.tsx`,
  installed with `npx shadcn@latest add <name>-example --overwrite`). After adding examples run `pnpm stories`: it writes missing
  `ui/<name>.stories.tsx` files (never overwriting existing ones) and sanitizes the demos. The demos assume Next, so it points
  `next/image` and `next/link` at `components/example-compat.tsx`, and it applies three exact-string patches for
  `noUncheckedIndexedAccess`. `message` and `message-scroller` have no example (their demos need the Vercel AI SDK) and `direction`
  has none upstream. `examples.test.tsx` server-renders every example. Demos are excluded from baseline and coverage.
  `add` may also flip `"use client"` directives in existing components; that is harmless here.
- **Vendored skills** in `.claude/skills` are third-party; don't edit them. Refresh with `npx skills update`.
  Exception: `.claude/skills/agent-api` is ours (not in `skills-lock.json`); keep it current when the API setup changes.

## Agent-native API

Load the `agent-api` skill before adding or changing an operation, permission, role, OAuth scope, tenant
table, or anything in `apps/api`, `packages/api`, `packages/mcp`, `packages/auth-proofs`, `packages/sdk`, `packages/cli`
or `resolvePrincipal`.

- **One registry, many surfaces.** Operations are defined in `apps/api/src/operations.ts` with the typed
  `defineOperation` (`operationsFor<Catalog>()`). Never hand-write a REST route, MCP tool or OpenAPI entry: they are
  generated. Write `description` for an agent, give `examples` (contract tests require one; `error` documents an
  expected failure), `permissions` and `hints`. Input is params + query + JSON body merged; `z.coerce` for GET numbers.
- **Every request acts in one organization.** `ctx.caller` has `organizationId`, `actor` (user or apiKey) and `grants`.
  Signup creates a personal org; sessions use their active org; API keys belong to an org; OAuth tokens carry an
  `org` claim chosen at consent or device approval. Membership is checked live on every request.
- **Permissions.** One catalog (`statements` in `packages/auth/src/access.ts`) drives roles (owner, admin, member,
  viewer), API-key permissions, OAuth scope grants and operations. Effective access = role ∩ credential, and a
  request needs a single grant covering all of it (better-auth's multi-role rule; `permissions.test.ts` checks parity
  with `hasPermission` for every role and action). `invoke` enforces `op.permissions`; MCP hides tools a caller can't use (calling one by name
  still returns FORBIDDEN with the hint, not "unknown tool").
- **OAuth scopes** are coarse (`read`, `write`, `admin` in `OAUTH_SCOPE_GRANTS`), each an explicit permission set.
  `OAUTH_EXCLUDED` lists what no token may ever do (org deletion, role editing); a test checks every action is one or
  the other. `openid`/`profile`/`email`/`offline_access` grant nothing.
- **API keys** are org-owned, start with no permissions, and are created through `create_api_key`, which requires a
  user actor and refuses permissions beyond the caller's own grants (better-auth only accepts key permissions
  server-side). Rate limited per key (default 600/min, `apiKeyRateLimit`); over the limit is 429. better-auth's default
  is 10 per day, so never drop the override. Keys of a deleted organization stop working.
- **Tenant data.** Every customer-data table has `organizationId` (see `project` in `packages/db/src/schema.ts`). Data
  functions take a `Named` org id plus `CallerActsFor` (and `ProjectInOrg`-style proofs for rows), and still filter by
  org in SQL. Another org's row answers NOT_FOUND, never FORBIDDEN. `pnpm lint` runs the gdp-ts rules: only
  `proofs/` may mint proofs.
- **The contract.** `apps/api/openapi.json` is a committed snapshot (`contract.test.ts`); Biome skips it. After an
  intended API change run `pnpm --filter @starter/api-app test -u` and review the diff as a public API change.
- **Errors** reach agents as `{ error: { code, message, hint?, docs? } }` (REST, plus the error's headers such as
  `Retry-After`) or an `isError` tool result (MCP), via `toPublic()`. Only 5xx and unexposed errors are reported.
- **OAuth.** Tokens are JWTs: aud = the resource, `azp`, `org`, space-separated `scope`, iss = `${baseURL}/api/auth`;
  `resolvePrincipal` requires all of them, and the jwt plugin's `set-auth-jwt` header is off so session JWTs can't
  pass. A web app must provide `/sign-in`, `/consent` (show the org being granted, with a switcher that calls
  `organization/set-active` before accepting), `/select-organization` (only when the session has no valid active
  org; then POST `/oauth2/continue` with `{ postLogin: true }`) and `/accept-invitation/:id` (the link in invitation
  emails: sign in or up as the invited address, then `organization/accept-invitation`). They exist, in `apps/web`.
  `nativeLoopbackRegistration` and `clientRegistrationDefaultResources` keep self-registering MCP clients working.
  `oauth-flow.test.ts` covers the flow.
- **URLs.** `apps/api` uses `PORTLESS_URL` (set by portless under `pnpm dev`) or else `BETTER_AUTH_URL`; the OAuth
  issuer, audiences and llms.txt links derive from it. The server needs Postgres with every migration applied: the
  OAuth provider seeds its resources at boot and exits if it can't.
- **Request logging:** `apps/api` has its own request-id and access-log middleware.
- **Device grant.** better-auth's `oauthDeviceAuthorization` (`packages/auth/src/device.ts`). `POST /api/auth/device/code`;
  a person approves at `/device`, and the approving session's active org (which must be one they belong to) is recorded
  at approval, then read when the token is issued. The client polls `/api/auth/oauth2/token` with the `device_code`
  grant. The result is an ordinary OAuth JWT, so `resolvePrincipal` is unchanged. The plugin's `/device/token` is
  disabled. Clients must register the `device_code` grant and should ask for `offline_access` (for a refresh token).
  The MCP resource metadata advertises `offline_access` in `scopes_supported`, so clients that request exactly
  those get a refresh token and keep working after the approving web session signs out.
  `starter login` (`packages/cli`, the `starter` bin) is the reference client.
- **Provisional signup.** `POST /v1/signup` with `{ email, name? }` and no credential (REST only, not an MCP tool). It
  creates an unverified user, a personal org and an `sk_` key with project permissions, and sends one claim email.
  Limits: 5 attempts per IP per hour, 20 per email domain per day. Until an owner verifies the email the org gets
  `UNCLAIMED_ORG_DAILY_REQUEST_LIMIT`; `whoami` reports `claimed`. The claim (any path that verifies the email)
  disables the signup key (`endProvisionalKeys`), since whoever called signup holds it; a call with it then gets
  UNAUTHORIZED with a hint naming the device grant. The response says so (`apiKeyEndsWhenClaimed`).
- **Invoke hooks.** `apps/api/src/hooks.ts` wires metering, idempotency and audit into `invoke`, identically for REST
  and MCP. `after` does not see FORBIDDEN or BAD_REQUEST, so those attempts are not audited. Details: agent-api skill.
- **Idempotency and pagination.** `Idempotency-Key` header (REST) or `idempotencyKey` argument (MCP, writes only). The
  same key with the same request replays the stored response; a different request under the same key is CONFLICT.
  Lists take `cursor` and `limit` and return `nextCursor` (`packages/api/src/pagination.ts`).
- **CORS** only on bearer surfaces (`/mcp`, `/.well-known/*`, `/openapi.json`, `/llms*.txt`, `/v1/*`), no credentials.
  `/api/auth/*` and the web pages stay same-origin.
- **Revocation.** Every OAuth request re-checks its grant: a consent or live refresh token for that client, org and user
  must stand. `revoke_agent_access` ends the grant and the tokens it issued, at once. A member who is removed or
  leaves loses every grant they made in that org (`packages/auth/src/member-grants.ts`), so re-adding them later
  doesn't revive their old agent's tokens. API keys stay: they belong to the org, not the member.
- **Agents.** `list_connected_agents` lists the org's API keys and the OAuth clients with consent or a live refresh
  token. `revoke_agent_access` needs `apiKey:delete`.
- **Discovery.** `llms.txt` and `/` carry install snippets (Claude Code, Cursor, VS Code, Codex, device-grant curl).
  `/.well-known/mcp/server.json` is the registry record. `skill-parity.test.ts` keeps `skills/starter` in step with the server.
- **Commands.** After changing `openapi.json`: `pnpm --filter @starter/sdk generate`. After changing the registry name or
  description: `UPDATE_SERVER_JSON=1 pnpm --filter @starter/api-app test discovery`.

## Not yet

- Custom roles per org (`dynamicAccessControl`: resolve roles from the DB in `rolePermissions`, then rerun the parity test).
- Stripe billing: metering and limits exist; there are no plans, checkout or webhooks.
- Publishing: the MCP registry, the Claude connectors directory, Smithery, and `npx skills add` for `skills/starter`.
  Each needs your namespace and a real URL.
- Deploy target: the Dockerfile and `scripts/release.mjs` only; no platform config.
- LLM onboarding eval: an agent starting from `llms.txt` alone, judged on its run. The deterministic HTTP journeys
  exist (`apps/api/src/onboarding.test.ts`: device grant from discovery, self-signup and claim, CLI login).
- Composite index for the grant check (the three lookups in `grantStands`).
- Cleanup job for `signup_attempt`, expired `idempotency_key` rows (reserve reclaims only the key it reserves) and
  `device-org:` rows in `verification`.
- Audit for FORBIDDEN and BAD_REQUEST attempts.
- Verifying the Cursor and VS Code install snippets (their shapes are inferred from docs).
- The e2e job (see Tooling) and `llms.txt` on a marketing domain (no marketing app here).

## Advisor checkpoints

- Consult the advisor before locking a multi-file plan (check auth proofs and DB schema/migration contracts).
- Consult it when the same test or compiler error fails twice, before trying a third fix.
- Consult it on the full diff before declaring done or committing.
- Don't consult it for routine bash, formatting, or single-file edits.

## Testing

- Vitest per package, `*.test.ts` beside the source. `pnpm test`, or `pnpm test:coverage` to enforce thresholds.
- `apps/api/src/onboarding.test.ts` is the agent's-eye check: it follows the install text in `/` and the
  well-known documents rather than constants. If you change the snippets or discovery, it should still pass.
- Thresholds live in `packages/config/vitest.base.ts` (80% lines/functions/statements, 70% branches) and only go up.
  Generated `src/auth-schema.ts`, stories, tests and `*.types.ts` are excluded from coverage.
- Type-level tests go in `*.types.ts` (checked by `pnpm typecheck`, not run by Vitest).
- Database tests use `createTestDb()` from `@starter/db/testing`: in-process Postgres (PGlite) with the real migrations
  applied. Regenerate the migration after any schema change or those tests run against a stale schema.
  The shared config allows 30s per test and 60s per hook because PGlite startup is slow on cold CI runners.
- **Workers:** `packages/config/vitest.base.ts` caps `maxWorkers` at a quarter of the cores per package. Turbo runs every
  package's tests at once, and vitest's default of a worker per core starved the PGlite instances past their timeouts
  (auth's signup test went from 40-47s to about 11s). Don't raise it back to the default.
- Web tests (`apps/web`) use jsdom and Testing Library; `packages/ui` tests render with `react-dom/server`, and its a11y
  checks run under jsdom.
- **Auth flows** (`apps/api/src/auth-flows.test.ts`) are the guard against better-auth breaking things in minor and
  patch releases. They drive sign-up, sign-in and sign-out, sessions, password reset, email verification, change
  password, organizations and invitations, CSRF and disabled endpoints over HTTP. They use the real `createClient`
  through `browser()` (`browser.test.helpers.ts`, a cookie jar that sends Origin), and assert status codes, error
  codes, redirects and emails. Auth emails go to a fake SES (`t.outbox`; wait
  with `delivered()`). A send error throws, but better-auth swallows some (reset requests), so always assert the
  email arrived. Add
  a test there for every auth flow the product relies on. Don't call `auth.api.*` for the step under test: that
  skips HTTP, cookies and origin checks. better-auth disables its origin/CSRF checks under a test runner, so
  `createAuth` turns them back on. Cookie requests in tests therefore need an `origin` header (`as()` and
  `browser()` add it).

## Database and auth

- App tables go in `packages/db/src/schema.ts`. Auth tables (`user`, `session`, `account`, `verification`) are generated into
  `src/auth-schema.ts`; regenerate with `pnpm --filter @starter/auth generate` after changing auth options or plugins.
- New migration: `pnpm --filter @starter/db db:generate`, then commit the SQL in `packages/db/drizzle/`.
- Applying migrations (`db:migrate`, `drizzle-kit push`) is denied for agents. Ask the user to run them, or to run
  `scripts/release.mjs` in a deploy.
- `0001_agent_auth` adds the API key, JWKS and OAuth tables (apikey, jwks, oauth_*); `0002_organizations` adds
  organization, member, invitation, `session.active_organization_id` and the example `project` table.
- `0003_agent_distribution` (not applied yet; the user runs it) adds `audit_event`, `usage_daily`, `idempotency_key`,
  `signup_attempt` and the device grant's `device_code` table. The first three cascade from `organization`;
  `signup_attempt` is keyed by IP and email domain, not by org.

## Tooling

- **Storybook** (`pnpm storybook`, http://localhost:6006) exposes an MCP server at `/mcp`, registered in `.mcp.json`.
  It only responds while Storybook is running. Use its docs tools (`docs-list`, `docs-show`) for component props
  instead of reading source. `pnpm build` runs `storybook build`.
- **portless**: `pnpm dev` runs workspace dev scripts on stable `*.localhost` URLs.
- **Web and CLI builds**: `pnpm --filter @starter/web build` (writes `apps/web/dist`, needed for `WEB_DIST_DIR`) and
  `pnpm --filter @starter/cli build` (writes `dist/bin.js`).
- **baseline** (`code-baseline`): bans, ratchets and design-system rules in `baseline.toml`. Localhost `http://` warnings are fine.
  Our own rules (errors): `no-console-log` (every console method), `use-starter-logger` (no pino/winston/...),
  `use-cn` (no clsx/tailwind-merge/classnames), `use-starter-ui` (no Base UI, Radix or other kits outside `packages/ui`)
  and `use-starter-env` (no `process.env` outside `packages/env`). Rules are regex/import matches, not type-aware;
  `skip_strings` ignores string and template literals (including code inside `${}`), but comments still match.
- **e2e** (tester-army): **not configured yet.** `e2e/example.e2e.ts` is a skipped placeholder outside the workspace and CI.
  Setting it up needs an app to test and a model credential (e.g. `AI_GATEWAY_API_KEY`). Docs ship in `node_modules/e2e/docs`.
- **Dependabot** runs weekly and groups minor/patch updates; major bumps arrive as separate PRs to evaluate, and
  `@types/node` majors are ignored to stay on the pinned Node 24. `better-auth`, `@better-auth/*` and `auth` are
  pinned exactly and get their own `better-auth` group (any update type), so a break shows up as its own red PR;
  bump them together, never one alone. The `esbuild` alert is dismissed: it is a dev-only transitive
  dependency of `drizzle-kit`, and the advisory concerns esbuild's dev server, which we don't run.

## Agent permissions

`.claude/settings.json` pre-approves pnpm, turbo, baseline, gitleaks and local git (status, diff, log, add, commit).
It denies force-push, `--no-verify`, `git reset --hard`, DB migrations and reading or editing `.env` files.
Anything else, such as `git push`, `docker`, `pnpm init-project` or installing skills, is not pre-approved.

## Skills (this repo)

gdp-ts, shadcn, turborepo, portless, better-auth (best-practices, create-auth, email-and-password).
Pinned in `skills-lock.json`. Ours: `agent-api` (operations, MCP, OAuth, the API contract).
`skills/starter` is not for this repo: it is the template skill shipped to customers' agents.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
