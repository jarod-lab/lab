# Build the D+ app — graph

Source prompt: `docs/prompts/build-app.md`. Boards (read-only copies of the design canvas
`K8m7EFZBm3Thd2WM2JbUNt`, never publish to it): `docs/build-app/boards/project/*.dc.html`.
Each board's light/dark values are in its `renderVals()`.

## Inputs

- **Task:** every D+ board becomes a working page in `apps/web` on real (or typed adapter) data.
- **Output:** `apps/web` routes, `packages/ui` shell components, `packages/auth` plugins, agent-run
  operations in `apps/api`, migrations in `packages/db/drizzle`, `e2e/*.e2e.ts`, `AGENTS.md`.
- **Checks:** the repo's full check command; existing auth/OAuth/onboarding tests; e2e per page;
  visual check per page (light/dark, desktop/phone); advisor review of the full diff.
- **Scope:** `apps/web`, `apps/api`, `packages/{ui,auth,auth-proofs,db,env,api,sdk}`, `e2e/`,
  `.env.example`, `pnpm-workspace.yaml`, `AGENTS.md`/`CLAUDE.md`, `docs/build-app`. Never `.env`.
- **Limit:** three attempts per node (correction edge), then report the node as blocked.

## Decisions

- D1 route scheme (user, 2026-10-16): board URLs. `/:org` is the org **slug**; `/:org/settings/{general,members,api-keys,billing,agents,security}`,
  `/:org/runs/:runId`, `/account/{profile,security}`, `/new`, `/two-factor`, `/admin`. `/settings/agents` redirects to the
  active org's page. OAuth/device/claim/reset/accept-invitation paths unchanged (`/invite/:id` is an alias of
  `/accept-invitation/:id`). Visiting `/:org` sets that org active if the session's active org differs.
- D2 `bearer`: not added. No client needs it (CLI uses the device grant JWT, MCP uses OAuth JWTs,
  web uses cookies), and adding it would let session tokens through `Authorization`.
- D3 TanStack packages verified on npm (2026-10-16): react-devtools 0.10.13, react-router-devtools,
  react-query(+devtools) 5.104, react-form(+devtools), react-table 9.3, react-virtual 3.14,
  react-pacer(+devtools), react-hotkeys(+devtools), react-charts 1.1. No TanStack markdown or code
  highlighting package: pick the smallest well-known one in N0 and record it in progress.md.
- D4 better-auth plugins pinned at 1.7.7 (`@better-auth/passkey|sso|scim|stripe@1.7.7` exist).

## Nodes

Each node: one input, one output, one check. "seq" = must run after its edges; nodes without an
edge between them may run in parallel only if they edit disjoint files.

| id | node | reads | writes | check |
|---|---|---|---|---|
| N0 | tools: mise/pnpm install, TanStack libs + devtools (dev only), QueryClient + router context | prompt §1, apps/web | `apps/web/package.json`, `apps/web/src/router.tsx`, `__root.tsx`, `pnpm-workspace.yaml`, lockfile | `pnpm --filter @starter/web typecheck test build`; built JS contains no devtools |
| N1 | auth plugins A: haveIBeenPwned, lastLoginMethod, passkey, twoFactor, magicLink, GitHub/Google, admin | wraps auth index, better-auth skills | `packages/auth/src/*`, `packages/env`, `.env.example`, `auth-schema.ts`, migration 0004 | auth + api tests incl. new `auth-flows.test.ts` cases; parity test |
| N2 | auth plugins B: sso, scim, stripe (test mode, env-gated) | N1 output | same files as N1, migration 0005 | same as N1 |
| N3 | agent runs domain: tables (agent, run, run_step, approval), proofs, permissions, operations (list/get agents & runs, approve/undo, steer, defer, footprint), contract + SDK | agent-api + gdp-ts skills, N2 output | `packages/db`, `packages/auth-proofs`, `packages/auth/src/access.ts`, `apps/api/src/{operations,data}`, `openapi.json`, `packages/sdk`, migration 0006 | api tests, contract, parity, `mistakes.types.ts` |
| N4 | UI shell components: AppShell, AppSidebar, OrgPicker, UserMenu, Topbar, SettingsHeader/Tabs, CommandPalette, Keycap, plus page parts the boards need | Sidebar/Topbar/SettingsTabs/Main boards, `pages/app-shell.tsx` | `packages/ui/src/dplus/shell/*`, stories, tests | ui tests + coverage + a11y; D+/Pages stories use the real components; `app-shell.tsx` deleted |
| N5 | web data layer + shell containers: auth client w/ new plugins, org-scoped query keys, session/orgs/set-active, theme (persisted), hotkeys, route skeleton for D1 | N0, N1, N2, N4 | `apps/web/src/{lib,containers,routes}` | web tests; old URLs still work |
| P1 | page: app shell + org switcher + `/new` | OrgSwitcher | web routes | unit + a11y + e2e |
| P2 | page: Org General | OrgGeneral | web | " |
| P3 | page: Members | OrgMembers | web | " |
| P4 | page: API keys | OrgApiKeys | web | " |
| P5 | page: Profile | Profile | web | " |
| P6 | page: Security | Security | web | " |
| P7 | page: Agents settings | DirLiftSettings | web | " |
| P8 | page: run view (live status, approval + 30s undo, steer, defer) | DirLift(+Dark) | web | " |
| P9 | page: Billing on a typed adapter, `[SAMPLE DATA]`, `[PRICE]` | OrgBilling | web | " |
| P10 | restyle auth pages, consent, device, select-organization | Auth | web | " + auth/oauth/onboarding tests |
| P11 | page: Org SSO/SCIM (owner only) | — (plain D+) | web | " |
| P12 | page: `/admin` | — (plain D+) | web | " |
| E0 | e2e setup per `node_modules/e2e/docs`; `AI_GATEWAY_API_KEY` in env | e2e docs | `e2e/`, config, `packages/env`, `.env.example` | `npx e2e` runs the placeholder |
| E1 | run every page e2e + visual check against boards (light/dark, desktop/phone) | real stack | `docs/build-app/checks.md` | every e2e passes; screenshots recorded |
| Z | final: full check command, AGENTS.md (shell, data layer, devtools, e2e), advisor review | all | `AGENTS.md` | `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm baseline && pnpm format:check && pnpm build` |

## Edges

```
N0 ──┬──────────────► N5 ─► P1 ─► P2 ─► P3 ─► P4 ─► P5 ─► P6 ─► P7 ─► P8 ─► P9 ─► P10 ─► P11 ─► P12 ─► E1 ─► Z
N1 ─► N2 ─► N3 ──────►┘                                                 ▲(P8 needs N3)
N4 ──────────────────►┘
E0 (parallel with everything before E1)
```

Parallel batch 1: N0, N1, N4, E0 (disjoint files; N0 owns `apps/web`, N1 owns `packages/auth|env|db`,
N4 owns `packages/ui`, E0 owns `e2e/` and only appends to env after N1 lands → E0 writes its env
var through the lead, not itself).
Migrations are sequential (N1 → N2 → N3) because they share drizzle's journal.
Pages are sequential per the prompt, all in `apps/web`.

## Code nodes (deterministic, never a subagent)

- Full check command; `pnpm --filter @starter/api-app test -u`; `pnpm --filter @starter/sdk generate`;
  `pnpm --filter @starter/auth generate`; `pnpm --filter @starter/db db:generate`; `pnpm stories`;
  `UPDATE_SERVER_JSON=1 …` if the registry text changes.
- Devtools-not-in-prod check: `grep -l devtools apps/web/dist -r` must be empty.
- Merges and commits: lead only, staging the node's paths.

## Gates

Every edge into P* and Z is gated: deterministic checks first (tests, typecheck, lint, baseline),
then the node's report. Failed gate → back to the node with the evidence, three attempts max.

## User-only steps (blockers the lead asks for)

- Apply migrations 0003+ (`pnpm --filter @starter/db db:migrate` or `scripts/release.mjs`).
- Put `AI_GATEWAY_API_KEY` (and optionally GitHub/Google/Stripe test keys) in `.env`.
- `docker compose up -d db` if not running.

## Learning rules (append as nodes pass)

