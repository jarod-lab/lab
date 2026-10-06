# starter

Turborepo + pnpm monorepo. Node 22 via mise (`mise trust && mise install` first).
New project from this template: `pnpm init-project <name>` (renames the `@starter` scope).

## Layout
- `apps/` — applications (empty in the template)
- `packages/ui` — shadcn/ui components + Storybook; use `cn` from `cn`, not clsx/tailwind-merge
- `packages/db` — Drizzle ORM (Postgres). Auth tables are generated: `pnpm --filter @starter/auth generate`
- `packages/auth` — better-auth (`createAuth()`), with the Wraps plugin for contact sync + SES auth emails
- `packages/auth-proofs` — gdp-ts authorization proofs; protected functions take proofs as args
- `packages/env` — the only place env vars are read; add new ones here AND in `.env.example`
- `packages/config` — shared tsconfig + Vitest base config

## Commands
- Env: `cp .env.example .env`; mise loads `.env` automatically (needs mise shell activation, or prefix commands with `mise exec --`). Never read or edit `.env` (denied in settings).
- Local DB: `docker compose up -d db`. Tests don't need it — they use in-process PGlite (`@starter/db/testing`).
- `pnpm lint typecheck test baseline` — all must pass; `pnpm test:coverage` enforces thresholds (they only go up)
- `pnpm storybook` — http://localhost:6006, MCP at `/mcp` (registered in `.mcp.json`). Use its docs tools for component props instead of reading source.
- `pnpm dev` runs workspace dev servers through `portless` (stable `*.localhost` URLs)
- `pnpm e2e` — agent-driven end-to-end tests (`pnpm exec e2e init` first)

## Rules
- Conventional Commits are enforced (commitlint). PR titles too.
- Never bypass hooks (`--no-verify`). gitleaks, baseline and format run on pre-commit.
- `@shadcn/lint` is registered with no rules enabled; add rules in `.oxlintrc.json`.
- Don't run DB migrations without being asked (`db:migrate` / `drizzle-kit push` are denied in `.claude/settings.json`).

## Agent skills (`.claude/skills`, locked in `skills-lock.json`)
gdp-ts, shadcn, turborepo, portless, better-auth (best-practices, create-auth, email-and-password). Refresh with `npx skills update`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
