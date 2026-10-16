# Node preamble (every subagent reads this first)

You are one node of the build-app graph (`docs/build-app/graph.md`, prompt `docs/prompts/build-app.md`).
Do only your node. The lead merges, commits and runs the full repo checks.

## Rules

- Read `AGENTS.md` (= `CLAUDE.md`) and follow it exactly: `@starter/logger` not `console.*`, env only via
  `packages/env`, `cn` from `cn`, semantic tokens only (no raw colours), `observe` on route handlers, a11y
  (`expectNoA11yViolations`), `AppError`/`toPublic()`, permissions + gdp-ts proofs for tenant data.
- **Never install or add dependencies.** Everything is installed (see `apps/web/package.json`,
  `packages/auth/package.json`). If something is genuinely missing, stop and report it.
- **Never commit, push, apply migrations, or read/edit `.env`.** Generating migrations is fine.
- **Read the installed package's docs and types** (`node_modules/<pkg>/dist/*.d.ts`, README, docs) before
  using an API. Don't trust recall: react-table 9, react-pacer/react-hotkeys (pre-1.0), react-charts 1.1,
  react-form 1.x and better-auth 1.7 plugins have changed.
- Edit only the files your node owns (listed in your task). If you must touch another file, say so in the report.
- Run only your package's tests (`pnpm --filter <pkg> test`, `typecheck`, `lint`), plus `pnpm baseline` and
  `pnpm format` (Biome formats only). Do not run the whole repo's `pnpm test` (it starves PGlite).
- Design source: `docs/build-app/boards/project/*.dc.html` (light/dark values in `renderVals()`). Map the
  board's colours to the existing tokens in `packages/ui/src/styles.css` (`--bg/ink/ink2/muted/line/done/
  danger/solar` → their token names there). Status = shape + word, `solar` = "needs you", disabled = dashed,
  destructive = red outline naming the consequence, 44px targets, motion only the running icon (off under
  reduced motion). No lorem ipsum; unknown facts are `[PLACEHOLDER]`.
- Route scheme (decision D1 in graph.md): `/:org` (org slug), `/:org/settings/{general,members,api-keys,billing,agents,security}`,
  `/:org/runs/:runId`, `/account/{profile,security}`, `/new`, `/two-factor`, `/admin`. OAuth/device/claim/
  reset/accept-invitation paths are unchanged.

## Report (your final message)

Return, briefly: files changed; the check commands you ran with their pass/fail output tail; anything left
undone or uncertain; notes the lead must put in `AGENTS.md`; any learning rule for the next node.
