# Tooling

- **Storybook** (`pnpm storybook`, http://localhost:6006) exposes an MCP server at `/mcp`,
  registered in `.mcp.json`. It only responds while Storybook is running. Use its docs tools
  (`docs-list`, `docs-show`) for component props instead of reading source. `pnpm build` runs
  `storybook build`.
- **portless**: `pnpm dev` runs the apps' dev scripts on stable `*.localhost` URLs (`app.starter`,
  `api.starter`; `portless.json`). `"turbo": false` is set because portless's turbo mode runs the
  root `dev` script, which is portless itself.
- **Web and CLI builds**: `pnpm --filter @starter/web build` writes `apps/web/dist`, which
  `WEB_DIST_DIR` needs. `pnpm --filter @starter/cli build` writes `dist/bin.js`.
- **baseline** (`code-baseline`): bans, ratchets and design-system rules in `baseline.toml`.
  Warnings don't fail the run (localhost `http://`, inline styles, the React and a11y advice in
  `apps/web`); errors do. Presets: `shadcn-strict`, `dependency-hygiene`, `security` and
  `ai-codegen` everywhere; `react` and `accessibility` scoped to `apps/web` (minus the
  size/useReducer/DOM-query opinions and `no-array-index-key`, see the comment there) and
  `accessibility` on `packages/ui/src/dplus`. Generated files (`*.gen.ts`), `scripts/`, `docs/` and
  the shadcn demos are excluded.
  Our own rules (errors): `no-console-log` (every console method), `use-starter-logger` (no pino,
  winston, ...), `use-cn` (no clsx, tailwind-merge, classnames), `use-starter-ui` (no Base UI, Radix
  or other kits outside `packages/ui`), `use-starter-env` (no `process.env` outside `packages/env`),
  `no-type-any` (type positions only; `operation.ts` is the one exception), `no-new-function`
  (outside tests), `no-server-imports-in-client` (no `@starter/db`, `env`, `auth-proofs` or
  `observability` from `apps/web`, `packages/ui`, `sdk` or `cli`), `use-app-error` (no bare
  `new Error` in `apps/api`), `no-focused-tests`, `no-sleep-in-e2e`, `e2e-test-import`, the two
  `ui-css-*-import` rules (`styles.css` must keep its `shadcn/tailwind.css` and `tw-animate-css`
  imports), `required-files`, and `api-queries-in-data-layer` plus `api-tables-in-data-layer` (no
  `db.select(...)` or table imports in `apps/api` outside `src/data/`; elsewhere only
  `import type { Database }`). `no-cross-package-relative-imports` bans `../../packages/x/src`
  imports: export the thing from its package instead (the web app gets `roles` and `statements` from
  `@starter/auth/client`, and its tests read `ORGANIZATION_HEADER` from `@starter/api/headers`).
  Ratchets (ceilings that only go down), all at 0: `ratchet-as-unknown-as` (outside tests and
  `*.types.ts`), `ratchet-vi-mock`, `ratchet-lint-disable`, `ratchet-ts-expect-error` (outside
  `*.types.ts`) and `ratchet-skipped-tests`. Never raise a ceiling to make room. In place of
  `vi.mock`, pass the dependency in: a prop (`onNavigate`, `auth`, `chooseAdapter`), or for the web
  app's page-wide singletons `setWebAuth` and `setNavigator`. `baseline ratchet down` counts without
  a rule's `exclude_glob`, so it can refuse a ceiling the scan reports as met; lower it by hand then. Rules are regex or import matches, not type-aware; `skip_strings` ignores
  string and template literals (including code inside `${}`), but comments still match.
- **Stop hook** (`scripts/claude-stop-check.mjs`, wired in `.claude/settings.json`): runs baseline
  and typecheck when an agent tries to end its turn and sends failures back. It steps aside on its
  second run in a turn (`stop_hook_active`), so a failure the agent can't fix is reported, not
  looped on. It does not replace the full check list.
- **e2e** (tester-army, `pnpm e2e`; docs in `node_modules/e2e/docs`): `e2e.config.ts`, one
  `e2e/<page>.e2e.ts` per page following its board's journey, helpers in `e2e/support/`. Targets
  desktop 1280x720 and phone 390x844.
  - `scripts/e2e-stack.mjs` starts apps/api (with `DEV_MAIL_SINK=true` and `AUTH_RATE_LIMIT=off`, see
    `docs/auth.md`) and vite. It needs Postgres with every migration applied, and `DATABASE_URL` and
    `BETTER_AUTH_SECRET` in the runner's env. `AI_GATEWAY_API_KEY` is only for agent steps.
  - Install the browser with `pnpm exec e2e-web install chromium`.
  - The browser can't emulate dark mode (override `matchMedia` in an init script) or WebAuthn. Tests
    compute TOTP codes (`e2e/support/totp.ts`). Screenshots are withheld after a secret fill.
  - The e2e stack signs up and promotes the admin journey's account at startup (see `e2e/README.md`).
  - Not in CI yet.
- Dependabot commits (signed off by `dependabot[bot]`) are exempt from commitlint, since they are
  written "Bump x from a to b".
- **Dependabot** runs weekly (npm, GitHub Actions and the Docker base image) and groups minor and
  patch updates. Major bumps arrive as separate PRs to evaluate. `@types/node` majors are ignored to
  stay on the pinned Node 24. `better-auth`, `@better-auth/*` and `auth` are pinned exactly and get
  their own `better-auth` group (any update type), so a break shows up as its own red PR. Bump them
  together, never one alone.
- The `esbuild` alert is dismissed. It is a dev-only transitive dependency of `drizzle-kit`, and the
  advisory concerns esbuild's dev server, which we don't run.

## Turbo

`turbo.jsonc` holds the task graph. The `transit` task carries the workspace dependency graph into
each test task's hash. Without it, a test hash sees only its own package: editing
`packages/auth/src/access.ts` left `@starter/web#test` unchanged. Migrations, vitest config and
every other file a dependency's tests read are inputs through the package graph.

Some test inputs no workspace dependency reaches are listed per task:
`apps/web/src/routeTree.gen.ts`, `server.json` and `skills/starter/SKILL.md` for the api-app tests;
the CLI and SDK sources that `apps/api/src/onboarding.test.ts` runs as a process;
`packages/api/src/headers.ts` for the web tests; and `apps/api/openapi.json` for the SDK tests. Add
an input there when a test reads a file no dependency reaches.

## CI

`.github/workflows/ci.yml`:

- **PR title**: semantic pull request check, the same types commitlint accepts.
- **check** (30-minute timeout, pnpm store cached): `commitlint` over the PR range, gitleaks over
  git history, `baseline`, `lint`, `typecheck`, `build`, the generated-files drift step,
  `test:coverage` and `format:check`.
- **Generated files are current**: runs the SDK and auth generators and `pnpm stories`, then formats
  and fails on any diff in `apps/web/src/routeTree.gen.ts`, `packages/db/src/auth-schema.ts`,
  `packages/sdk/src/schema.gen.ts` and `packages/ui/src/components`. It also fails on untracked
  files under `packages/ui/src/components`.
- **OpenAPI breaking changes** (pull requests): oasdiff compares `apps/api/openapi.json` with the
  base branch and fails on errors.
- **Docker image**: builds without pushing.

## Catalog and lefthook

- Dependencies are aligned through the pnpm `catalog:` in `pnpm-workspace.yaml`. TypeScript is
  `^5.9.3` everywhere: TypeScript 7 breaks `openapi-typescript`.
- lefthook's format step runs Biome over `ts`, `tsx`, `js`, `mjs`, `json` and `css` staged files.
  Markdown is not formatted by Biome in this version.

## Template setup

`pnpm init-project <name>` renames the `@starter/` scope and package names, `name` fields, the
`# starter` title, the database name (`.env.example`, compose `DATABASE_URL` and `POSTGRES_DB`), the
portless and compose hostnames, the display name (for example `Starter API`), the MCP registry name,
and the skill's `name:` and prose (its folder stays `skills/starter`). It skips local `.env` files
(`.env.example` is still renamed) and the vendored skills in `skills-lock.json`.

## Docker

The API image (`Dockerfile`) runs `apps/api` from source with `tsx src/server.ts`, sets
`WEB_DIST_DIR` to the built web app, and health-checks `/health`. `.dockerignore` leaves out
`.env*`, `.claude`, `e2e`, and build and coverage outputs.

## Repository notes

- Biome skips `apps/api/openapi.json`, the committed contract.
- Exceptions to baseline's `use-starter-env` rule are listed in `baseline.toml`.
- The agent-graph working directory under .claude is gitignored: it is working state for graph runs.
- `docs/build-app/` keeps only the design boards; the build prompt is `docs/prompts/build-app.md`.
