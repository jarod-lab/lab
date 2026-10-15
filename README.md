# starter

Opinionated TypeScript monorepo template: Turborepo + pnpm, shadcn/ui + Storybook, Drizzle (Postgres),
better-auth, typed env, and agent-ready guardrails. Agent-native API surface: define an operation once and
get a REST route, an MCP tool, OpenAPI and `llms.txt`, with organization-scoped permissions, API keys and
OAuth 2.1 for agents.

## Use it

```bash
gh repo create my-app --template stewartjarod/starter --private --clone && cd my-app
mise trust && mise install        # Node 24, pnpm 11, gitleaks
pnpm install
pnpm init-project my-app          # renames the @starter scope, DB name and display name
cp .env.example .env              # mise loads it; fill in BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d db           # local Postgres (tests don't need it)
```

## What's in it

| | |
|---|---|
| `packages/ui` | shadcn/ui components, `cn`, Tailwind v4 theme, Storybook (+ MCP at `/mcp`), axe test helper |
| `packages/db` | Drizzle ORM, committed migrations, `@starter/db/testing` (in-process PGlite) |
| `apps/api` | Reference API ([Hono](https://hono.dev) on Node): REST, `/mcp`, `/openapi.json`, `/llms.txt`, OAuth discovery |
| `packages/api` | Operation registry: `defineOperation` once → REST, MCP, OpenAPI 3.1, `llms.txt` / `llms-full.txt` |
| `packages/mcp` | Stateless MCP server (Streamable HTTP) from the registry; RFC 9728 resource metadata |
| `packages/auth` | better-auth + Wraps, organizations + roles from one permission catalog, org API keys, OAuth 2.1 (MCP clients register themselves; tokens bound to an org) |
| `packages/auth-proofs` | [gdp-ts](https://github.com/rauchg/gdp-ts) proofs for tenant isolation (`callerActsFor`, `projectInOrg`), lint-enforced |
| `packages/env` | Validated environment variables (the only place env is read) |
| `packages/logger`, `packages/errors` | Structured logging and typed app errors |
| `packages/observability` | Request ids, access logs, error handling and health checks for Web-standard handlers |
| `packages/config` | Shared tsconfig and Vitest base config |
| `skills/starter` | Template agent skill to ship to your customers' agents (`npx skills add <owner>/<repo>`) |

## Commands

```bash
pnpm lint typecheck test build   # all via Turborepo
pnpm test:coverage               # thresholds only go up
pnpm baseline                    # bans/ratchets (code-baseline)
pnpm storybook                   # http://localhost:6006
pnpm --filter @starter/api-app dev     # API on BETTER_AUTH_URL (default http://localhost:3000)
pnpm --filter @starter/auth generate   # regenerate auth tables after changing auth plugins
pnpm --filter @starter/db db:generate  # new migration after schema changes
```

Commits must be [Conventional Commits](https://www.conventionalcommits.org). Pre-commit runs gitleaks,
baseline and format; commit-msg runs commitlint. CI runs all of it plus build and coverage.

## Agents

`AGENTS.md` (also `CLAUDE.md`) holds the conventions. `.claude/settings.json` pre-approves this stack's
commands and denies destructive ones; skills live in `.claude/skills`.

## Agent-native API

Every operation in `apps/api/src/operations.ts` is served as REST, as an MCP tool at `/mcp`, and in
`/openapi.json`, `/llms.txt` and `/llms-full.txt`. Every request acts in one organization. Access is the
member's role (owner, admin, member, viewer) narrowed by the credential: an org API key's permissions, or an
OAuth token's scopes (`read`, `write`, `admin`). MCP clients find the authorization server through
`/.well-known/oauth-protected-resource`, register themselves, and get a token bound to the organization the
user picks. `apps/api/openapi.json` is a committed snapshot of the contract, so every API
change shows up in review, and contract tests run every documented example over REST and MCP.

## Not included yet

A web app (OAuth sends people to `/sign-in`, `/consent` and `/select-organization`, which it should
provide), custom roles per organization, usage metering,
breaking-change checks on `openapi.json` in CI, deploy config, and the e2e job ([tester-army/e2e](https://github.com/tester-army/e2e)
needs an app to point at and a model credential). No `LICENSE` is set — add one before publishing.
