# Page node spec (P2–P12)

Read `docs/build-app/node-preamble.md`, `graph.md` (Decisions + Learning rules), `agents-notes.md` and
`AGENTS.md` first. Look at how earlier pages are built (`apps/web/src/routes/$org.tsx`, `src/containers/*`,
`src/pages/*`, `src/lib/*`) and follow the same structure: thin route file → container (data, TanStack Query
hooks with `qk.org(orgId)` keys, mutations) → presentational page component (props in, callbacks out).

For your page:

1. **Match the board** (`docs/build-app/boards/project/<Board>.dc.html`): layout, copy, every state the board or
   its `renderVals()` shows (owner/viewer, empty, error, loading), light and dark, and phone width (no horizontal
   scroll, 16px gutters, 44px targets). Use the `@starter/ui` components and `@starter/ui/dplus/*` (shell parts:
   SettingsHeader, ViewOnlyNotice, DangerZone/DangerAction, CopyField, SlugField, Shortcut; Status, Meter,
   OrgMark). If the board needs a presentational piece that doesn't exist, add it to `packages/ui/src/dplus`
   with a story, a11y test and unit test.
2. **Real data**: better-auth (via the web auth client) or the operation registry (`/v1/*` with the
   `X-Organization-Id` header). Viewer/role decides what's editable — derive it from the caller's role and the
   permission catalog (`@starter/auth` access/roles), never from hand-rolled checks that disagree with the server.
3. **Forms**: TanStack Form + Zod, errors through `Field`/`FieldError`. **Tables**: TanStack Table. **Long lists**:
   TanStack Virtual. **Debounce/throttle**: TanStack Pacer.
4. **Destructive actions** name the exact consequence and confirm (typed name for org deletion). Undo where
   the board shows it.
5. **Tests**: unit + a11y (`expectNoA11yViolations`, jsdom) for the container and page, coverage thresholds met.
   An e2e file `e2e/<page>.e2e.ts` that follows the board's journey (read `e2e/README.md`, `e2e/app-shell.e2e.ts`,
   `e2e.config.ts`); use locators; emails come from `GET /api/dev/mail?to=` when `DEV_MAIL_SINK=true`. It must
   `pnpm exec e2e list`; it runs against the real stack at E1.
6. **Checks** (paste tails): `pnpm --filter @starter/web typecheck`, `lint`, `test:coverage`, `build`; if you
   touched packages/ui, its `typecheck`, `lint`, `test:coverage`; `pnpm baseline`; `pnpm exec e2e list`;
   `npx biome format --write <your paths>` (not repo-wide). If you add a route, run
   `pnpm --filter @starter/api-app exec vitest run src/static.test.ts`.

Files you own: the page's routes, containers, pages, lib helpers and tests in `apps/web`, new `packages/ui/src/dplus`
pieces, `e2e/<page>.e2e.ts`. Never edit `packages/auth`, `packages/db`, `apps/api` (except static tests) — if the
page needs a server change, stop and report exactly what's missing.
