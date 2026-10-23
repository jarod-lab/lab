# Build the D+ app (prompt for a fresh session)

Run this as an agent graph (`/agent-graph`): it is large, multi-part and must be resumable. Keep
`graph.md`, `checks.md` and `progress.md` under `docs/build-app/` so another session can pick up
where you stop. Keep going until every node's check passes. Do not stop at a plan or a partial build.

## Goal

Build the real web app in `apps/app` (TanStack Start, SPA mode) so that every board in the D+ design
canvas is a working page on real data, using the `@starter/ui` components we already restyled. Where
the boards need a component that doesn't exist yet, add it. Verify every page with the `e2e` tester.

The design canvas is https://claude.ai/artifact/K8m7EFZBm3Thd2WM2JbUNt. Read it with the Artifact
tool: first `list` with `scope: "files"`, then `read` each `project/*.dc.html`. The boards are
reference, so never publish to that artifact. Each board is a `.dc.html` file whose inline styles
use theme objects in `renderVals()`. Read the markup and the light/dark values. The boards:

| Board | File | What it is |
|---|---|---|
| D+ design system | `Main.dc.html` | foundations, components, nav model, routes every app ships |
| App shell, run view (light, dark) | `DirLift.dc.html`, `DirLiftDark.dc.html` | agent run: steps, approval, footprint, steer |
| Sign in · Sign up · Two-factor · Invitation | `Auth.dc.html` | public auth pages |
| Org switcher → Create organization | `OrgSwitcher.dc.html` | org picker open, `/new` form |
| Org settings: General, Members, API keys, Billing, Agents | `OrgGeneral`, `OrgMembers`, `OrgApiKeys`, `OrgBilling`, `DirLiftSettings` | owner and viewer states |
| Personal: Profile & account, Security | `Profile.dc.html`, `Security.dc.html` | account, email change, passkeys, 2FA, sessions |
| Sidebar, Top bar, Settings header & tabs | `Sidebar`, `Topbar`, `SettingsTabs` | shared components and their states |

Every page ships light and dark from the same tokens and works at phone width.

## What already exists (read before writing anything)

- `CLAUDE.md` / `AGENTS.md`: the repo rules. Follow them exactly: logging, env, `observe`, a11y,
  baseline, the commit format, "Before you call a change done", the advisor checkpoints, migrations
  being denied to agents, and the other session that may be working in this tree. Load the skills it
  names (`agent-api` before any API, operation, permission or `apps/api` work, `gdp-ts`, `better-auth`,
  `shadcn`, `turborepo`, `portless`).
- `packages/ui`: the 60 shadcn components (`src/components/ui`), already restyled to D+ by hand.
  Never `shadcn add --overwrite` an existing one. Variants added for the design are Button `hatch`;
  Alert `attention`, `notice`, `outline` and `inverse`; Card `selected` and `destructive`; Badge `solar`,
  `success` and `size="sm"`; Tabs `pill`; and Toggle Group `variant="outline" spacing={0}` (the
  segmented control). Button `sm` is the 36px row action. `styles.css` has the tokens, a `.light`
  scope, and the utilities `highlight`, `hatch` and `type-display`/`type-h1`/`type-h2`/`type-h3`/
  `type-body`/`type-small`/`type-mono`/`type-eyebrow`.
- `packages/ui/src/dplus`: our components `Status`, `StatusIcon`, `Meter` and `OrgMark`
  (`@starter/ui/dplus/*`).
- `packages/ui/src/dplus/pages/*.stories.tsx`: the boards rebuilt in Storybook as **D+/Pages**
  (design system, run view, Component — Sidebar, Org settings — General, Create organization).
  `pages/app-shell.tsx` is story-only scaffolding for AppSidebar, OrgPicker, UserMenu, Topbar and
  SettingsHeader. Treat it as the visual spec for the real components, then delete it once the
  stories use the real ones.
- `apps/app`: TanStack Start in SPA mode. It already has `/sign-in`, `/sign-up`, `/consent`,
  `/device`, `/select-organization`, `/accept-invitation/:id`, `/reset-password`, `/claim` and
  `/settings/agents`. Their behaviour is tested (`auth-flows.test.ts`, `oauth-flow.test.ts`,
  `onboarding.test.ts`), so keep those flows and URLs working while you restyle and extend them.
- `apps/api`: Hono, better-auth (organizations, API keys, OAuth, device grant) and the operation
  registry that generates REST, MCP and OpenAPI. `@starter/sdk` is the typed client.

## How to build it

1. **Before anything else, tools.** Run `mise trust && mise install && pnpm install`. Then install
   TanStack Devtools (`@tanstack/react-devtools`) with the plugins for Router, Query, Form and any
   other library that has one, mounted in dev only. Check every TanStack package you plan to use on
   npm first (`npm view <pkg> version`), and use only packages that exist. Use TanStack's library
   wherever one fits:
   - Router, Start and Query: routing, loaders and server state, with query keys per org.
   - Form: every form, with Zod validation and errors shown through `Field`/`FieldError`.
   - Table: Members, API keys, Invoices, the role matrix and sessions.
   - Virtual: long lists, such as run history and members.
   - Pacer: debounced URL-slug availability, search and throttled polling of running runs.
   - Hotkeys: the `G H`, `G A`, `G O` and `⌘K` shortcuts shown as keycaps.
   - Charts, markdown and code highlighting: run footprint and usage, the run summary, keys and code.

   If TanStack has no package for something, say so in `progress.md` and pick the smallest
   well-known one. pnpm 12 needs build scripts approved in `pnpm-workspace.yaml`.
2. **Decide the route scheme once.** Ask me whether to use the board's `/:org/settings/*` and
   `/account/*` URLs or the app's existing `/settings/*`. Don't guess. The OAuth and device pages
   keep their current paths either way.
3. **Real components first, in `packages/ui`.** Build AppShell, AppSidebar, OrgPicker, UserMenu,
   Topbar, SettingsHeader and a command palette (`⌘K`), plus whatever the boards need. They are
   presentational: plain typed props and callbacks, no fetching, no better-auth import. Cover
   loading, empty, single-org, no-active-org, viewer and error states, and each one gets:
   - a Variants story, and the D+/Pages stories switched over to it;
   - a11y tests with `expectNoA11yViolations`;
   - unit tests that meet the coverage thresholds.
4. **Containers in `apps/app`.** They feed those components real data: the session, the organization
   list and active org (`organization/set-active`), members, invitations, API keys, sessions, sign-out,
   and the theme (Light/Dark/System, persisted).
5. **Data.** Use real backends wherever they exist:
   - better-auth: organizations, members, invitations and API keys. Check which plugins are
     configured before relying on passkeys, two-factor, sessions or email change. Add a plugin if a
     board needs one, following the better-auth skills, and regenerate the auth schema.
   - The operation registry (agent-api skill): agents, runs, steps, approvals and run footprint,
     including permissions, gdp-ts proofs, tenant tables and a migration you ask me to apply.
   - Billing: Stripe isn't set up, so build the page on a typed adapter with fixture data. Label it
     `[SAMPLE DATA]` exactly as the board does, and never invent prices (keep `[PRICE]`).

   No lorem ipsum. Missing facts become `[PLACEHOLDER]`s.
6. **better-auth plugins: the usual set.** The starter has `organization`, `apiKey`, `jwt`,
   `oauthProvider`, `deviceAuthorization` and the Wraps plugin (contact sync, SES emails). Add the rest
   of the set I use in my projects, following `~/Projects/wraps/packages/auth/src/index.ts` (read it;
   don't copy anything Wraps-specific). Use the pinned `better-auth`/`@better-auth/*` version, and bump
   the plugins together, never one alone.

   | Plugin | Where it shows | Notes |
   |---|---|---|
   | `haveIBeenPwned` | sign-up and change password ("shown up in a known data breach") | |
   | `lastLoginMethod` | the "Last used" badge on sign-in | |
   | `passkey` (`@better-auth/passkey`) | sign-in, sign-up, Security → Passkeys (add, rename, remove) | |
   | `twoFactor` | `/two-factor`, Security → authenticator, backup codes, trust device | owner reset |
   | `magicLink` | sign-in by email link | |
   | social providers (GitHub, Google) | sign-in, sign-up, Security → Connected accounts | can't disconnect the last way in |
   | `admin` | a minimal `/admin` (users, ban, impersonate) | not on the boards; build it plainly in D+ style |
   | `sso`, `scim` | Org settings → Security/SSO (domain, IdP), SCIM token | owner only |
   | `stripe` (`@better-auth/stripe`) | Billing | test mode only, behind env; fixture adapter until keys exist |
   | `bearer` | only if a client needs it | check it against `resolvePrincipal`: session tokens must not pass as API credentials |

   For every plugin, do all of the following:
   - wire it in `createAuth` and the client (`createClient`);
   - regenerate `auth-schema.ts` (`pnpm --filter @starter/auth generate`) and generate the migration,
     which I apply;
   - add each env var to `packages/env` and `.env.example`;
   - add its flows to `apps/api/src/auth-flows.test.ts` over HTTP (assert status codes, emails and
     redirects, never `auth.api.*` for the step under test);
   - update the permission catalog if it adds actions;
   - document it in `AGENTS.md`.

   Keep existing behaviour: provisional signup, the personal org on signup, org-owned keys, and the
   OAuth grant checks.
7. **Pages.** Build them in this order, each fully done before the next:
   1. app shell and org switcher
   2. Org General
   3. Members
   4. API keys
   5. Profile
   6. Security
   7. Agents settings
   8. run view (live status, approval with 30-second undo, steer input, defer button)
   9. Billing
   10. restyle the auth pages (sign in, sign up with the breached-password message, two-factor,
       invitation), consent, device and select-organization
   11. Org SSO/SCIM
   12. `/admin`

   Match each board: layout, copy, states (owner and viewer, empty, error) and both themes.
8. **Verify with the e2e tester.** `npx e2e` (tester-army) isn't configured yet. Read
   `node_modules/e2e/docs` first, then set it up per those docs. Write one e2e file per page that
   follows the board's user journey: sign up (password, passkey, magic link), two-factor, create an org, invite, change role, create and revoke
   a key, switch org, approve a run, toggle the theme, and use the keyboard shortcuts. It needs a
   model credential, such as `AI_GATEWAY_API_KEY`. Add it to `packages/env` and `.env.example`, and
   ask me to put the value in `.env`. Never read `.env` yourself. Run against the real stack
   (`docker compose up -d db`, migrations applied by me, `pnpm dev`). Every page's e2e must pass,
   plus a visual check of each page against its board in light and dark at desktop and phone width.
9. **Done means** all of the following:
   - every board is a route that works on real or adapter data;
   - every e2e passes;
   - `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm baseline && pnpm format:check && pnpm build`
     passes;
   - the existing auth, OAuth and onboarding tests still pass;
   - `AGENTS.md` describes the app shell, the data layer, devtools and e2e;
   - the advisor has reviewed the full diff.

   Commit in small Conventional Commits as each node passes, staging your paths only. Don't push.

## Rules that bite

- Use semantic tokens only. No raw colours, no `console.*`, no `process.env` outside `packages/env`.
  Use `cn` from `cn`. Wrap API handlers in `observe`.
- Status is always shape plus word. `solar` means "needs you". Disabled is dashed. Destructive is a
  red outline that names the consequence. Targets are 44px. Motion is only the running icon, and it
  stops under reduced motion.
- Never hand-write a REST route, MCP tool or OpenAPI entry: define operations. After an API change,
  run `pnpm --filter @starter/api-app test -u` and `pnpm --filter @starter/sdk generate`.
- Migrations: generate them, never apply them. Ask me to run them.
- If the same error fails twice, consult the advisor before a third attempt.
