# starter

Turborepo + pnpm 11 monorepo, TypeScript, no app framework yet (add apps under `apps/`).

## Setup

```bash
mise trust && mise install   # Node 22, pnpm 11, gitleaks (a fresh clone is untrusted until you do this)
pnpm install
pnpm init-project <name>     # template only: renames the @starter scope, DB name and display name
cp .env.example .env         # mise loads it; BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d db      # optional local Postgres; tests don't need it
```

## Layout

- `apps/` — applications (empty in the template)
- `packages/ui` — shadcn/ui components + Storybook; use `cn` from `cn`, never clsx/tailwind-merge
- `packages/db` — Drizzle ORM (Postgres), committed migrations in `drizzle/`, test helper `@starter/db/testing`
- `packages/auth` — better-auth: `createAuth({ db, secret, baseURL, emailFrom })`, `createClient()`; Wraps plugin for contact sync and SES auth emails
- `packages/auth-proofs` — gdp-ts authorization proofs; protected functions take proofs as arguments
- `packages/logger` — pino with secret redaction: `createLogger({ name })`
- `packages/errors` — `AppError`/`ErrorCode`, `Result` (`ok`/`err`/`attempt`), `reportError` + `setErrorReporter`
- `packages/env` — the only place env vars are read (validated with Zod)
- `packages/config` — shared tsconfig and Vitest base config
- `scripts/` — `init-project.mjs`

## Before you call a change done

Run each of these (pnpm does not chain script names, so `pnpm lint typecheck` only runs `lint`):

```bash
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm baseline && pnpm format:check && pnpm build
```

CI runs the same, plus gitleaks over history and commitlint over PR commits. `pnpm format` fixes formatting.

## Rules

- **Commits:** Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`, `perf`, `build`, `style`, `revert`).
  Header and every body line must be 100 characters or fewer, or commitlint rejects it. PR titles follow the same format.
- **Hooks:** pre-commit runs gitleaks, baseline and a format check; commit-msg runs commitlint. Never use `--no-verify`.
  If gitleaks flags a test fixture, add `// gitleaks:allow` on that line. Don't allowlist whole files.
- **Logging:** use `@starter/logger`, not `console.log` (baseline flags it). Throw `AppError`; never send an `INTERNAL`
  message to a client, use `error.toPublic()`. Register Sentry once at startup with `setErrorReporter`.
- **Env:** add every variable to `packages/env` and `.env.example`. Never read or edit `.env` (denied in settings).
- **Authorization:** use gdp-ts proofs (see the gdp-ts skill), don't hand-roll boolean permission checks.
- **UI:** semantic tokens and dark-mode variants only, no raw colors like `bg-white` (baseline `shadcn-strict`).
  `@shadcn/lint` is registered with no rules enabled; add rules in `.oxlintrc.json`.
- **Formatting and lint:** Biome formats only (no semicolons, 100 columns); Oxlint lints. Biome skips `.claude/` and lockfiles.
- **pnpm 11:** dependency build scripts must be approved in `pnpm-workspace.yaml` (`allowBuilds`). pnpm maintains
  `minimumReleaseAgeExclude` itself for very new releases; don't hand-edit it.
- **Vendored skills** in `.claude/skills` are third-party; don't edit them. Refresh with `npx skills update`.

## Testing

- Vitest per package, `*.test.ts` beside the source. `pnpm test`, or `pnpm test:coverage` to enforce thresholds.
- Thresholds live in `packages/config/vitest.base.ts` (80% lines/functions/statements, 70% branches) and only go up.
  Generated `src/auth-schema.ts`, stories, tests and `*.types.ts` are excluded from coverage.
- Type-level tests go in `*.types.ts` (checked by `pnpm typecheck`, not run by Vitest).
- Database tests use `createTestDb()` from `@starter/db/testing`: in-process Postgres (PGlite) with the real migrations
  applied. Regenerate the migration after any schema change or those tests run against a stale schema.
- UI tests render with `react-dom/server`; there is no jsdom or Testing Library yet.

## Database and auth

- App tables go in `packages/db/src/schema.ts`. Auth tables (`user`, `session`, `account`, `verification`) are generated into
  `src/auth-schema.ts`; regenerate with `pnpm --filter @starter/auth generate` after changing auth options or plugins.
- New migration: `pnpm --filter @starter/db db:generate`, then commit the SQL in `packages/db/drizzle/`.
- Applying migrations (`db:migrate`, `drizzle-kit push`) is denied for agents. Ask the user to run them.

## Tooling

- **Storybook** (`pnpm storybook`, http://localhost:6006) exposes an MCP server at `/mcp`, registered in `.mcp.json`.
  It only responds while Storybook is running. Use its docs tools (`docs-list`, `docs-show`) for component props
  instead of reading source. `pnpm build` runs `storybook build`.
- **portless**: `pnpm dev` runs workspace dev scripts on stable `*.localhost` URLs.
- **baseline** (`code-baseline`): bans, ratchets and design-system rules in `baseline.toml`. Localhost `http://` warnings are fine.
- **e2e** (tester-army): **not configured yet.** `e2e/example.e2e.ts` is a skipped placeholder outside the workspace and CI.
  Setting it up needs an app to test and a model credential (e.g. `AI_GATEWAY_API_KEY`). Docs ship in `node_modules/e2e/docs`.
- **Dependabot** runs weekly and groups minor/patch updates. The `esbuild` alert is dismissed: it is a dev-only transitive
  dependency of `drizzle-kit`, and the advisory concerns esbuild's dev server, which we don't run.

## Agent permissions

`.claude/settings.json` pre-approves pnpm, turbo, baseline, gitleaks and local git (status, diff, log, add, commit).
It denies force-push, `--no-verify`, `git reset --hard`, DB migrations and reading or editing `.env` files.
Anything else, such as `git push`, `docker`, `pnpm init-project` or installing skills, is not pre-approved.

## Skills

gdp-ts, shadcn, turborepo, portless, better-auth (best-practices, create-auth, email-and-password).
Pinned in `skills-lock.json`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
