# starter

Opinionated TypeScript monorepo template: Turborepo + pnpm, shadcn/ui + Storybook, Drizzle (Postgres),
better-auth, typed env, and agent-ready guardrails. No app framework yet — add apps under `apps/`.

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
| `packages/ui` | shadcn/ui components, `cn`, Tailwind v4 theme, Storybook (+ MCP at `/mcp`) |
| `packages/db` | Drizzle ORM, committed migrations, `@starter/db/testing` (in-process PGlite) |
| `packages/auth` | better-auth + Wraps plugin; real signup/login tests |
| `packages/auth-proofs` | [gdp-ts](https://github.com/rauchg/gdp-ts) authorization proofs |
| `packages/env` | Validated environment variables (the only place env is read) |
| `packages/logger`, `packages/errors` | Structured logging and typed app errors |
| `packages/config` | Shared tsconfig and Vitest base config |

## Commands

```bash
pnpm lint typecheck test build   # all via Turborepo
pnpm test:coverage               # thresholds only go up
pnpm baseline                    # bans/ratchets (code-baseline)
pnpm storybook                   # http://localhost:6006
pnpm --filter @starter/auth generate   # regenerate auth tables after changing auth plugins
pnpm --filter @starter/db db:generate  # new migration after schema changes
```

Commits must be [Conventional Commits](https://www.conventionalcommits.org). Pre-commit runs gitleaks,
baseline and format; commit-msg runs commitlint. CI runs all of it plus build and coverage.

## Agents

`AGENTS.md` (also `CLAUDE.md`) holds the conventions. `.claude/settings.json` pre-approves this stack's
commands and denies destructive ones; skills live in `.claude/skills`.

## Not included yet

An app framework, deploy config, and the e2e job ([tester-army/e2e](https://github.com/tester-army/e2e)
needs an app to point at and a model credential). No `LICENSE` is set — add one before publishing.
