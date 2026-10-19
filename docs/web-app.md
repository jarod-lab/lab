# Web app

`apps/web` (`@starter/web`) is TanStack Start in SPA mode, the D+ app. `vite build` writes
`apps/web/dist`, which `apps/api` serves from its origin. Dev: `vite dev` proxies `/api`, `/v1`,
`/mcp`, `/.well-known` and `/ofrep` to `API_URL`.

## Routes

- `/:org` (org slug; `OrgGate` sets the active org before org content renders)
- `/:org/runs/:runId`
- `/:org/settings/{general,members,api-keys,billing,agents,security}`, and `/:org/settings/flags`
  in the operator organization only
- `/account/{profile,security}`
- `/new`, `/two-factor`, `/admin`
- the OAuth, device, claim, reset and `/accept-invitation/:id` pages (`/invite/:id` is an alias;
  `/settings/agents` redirects)

Org slugs can't take a reserved first segment (`RESERVED_ORG_SLUGS`, enforced server-side).
`apps/api/src/static.ts` serves every route; `apps/api/src/static.test.ts` derives the
list from `apps/web/src/routeTree.gen.ts`, and turbo hashes that file for api-app tests.

## Shape

Thin route file, then a container in `src/containers` (data, TanStack Query, mutations), then a
presentational page in `src/pages` (props in, callbacks out) built from `@starter/ui` and
`@starter/ui/dplus/*`. The shell components take links through `renderLink` and `ShellLinkProvider`
(TanStack Router's `Link` in `containers/router-link.tsx`).

Account security is split into `src/pages/account-security/*.tsx`: passkeys, two-factor, backup
codes, sessions, password, connected accounts, plus `shared.tsx`.

Shared pieces to reuse rather than rebuild:

- `@starter/ui/dplus/shell/page-header`: `PageHeader` (the bordered title band), `PageTabs` (link
  tabs under it) and `PageBody` (the content, one width for every page). Settings pages use
  `SettingsHeader`, which builds on them. Don't set a page's own `max-w` or centre it.
- `components/confirm-dialog.tsx`: `ConfirmDialog`, for destructive confirmations.
- `components/form.tsx`: `useAppForm` (TanStack Form + Zod), `TextField`, `PasswordField`,
  `SubmitButton`, `FieldIssues`, `FormError`, `FormDialog`. Field errors hold Zod issues: render
  `.message`.
- `lib/roles.ts`: `roleParts`, `hasRole`, `isOwner`. Don't compare role strings by hand.
- `containers/create-organization.tsx`: the create-organization container (slug availability check
  included).

## Data layer

- The product API (`/v1`) is called through `@starter/sdk`, via `productClient(orgId)` in
  `lib/product-client.ts`. It sends `X-Organization-Id`, turns off retries, and maps a
  `StarterError` to a `WebError` with the server's hint. `ResponseBody<op>`, `RequestBody<op>` and
  `QueryParams<op>` are its types. The response types in `lib/*-api.ts` are aliases of them (for
  example `ResponseBody<"list_member_security">`), not hand-written copies.
- Better-auth clients come from `makeAuthClient` in `lib/web-auth.ts`; `createWebAuth` wraps them.
- TanStack Query with the client in router context. Keys come from `lib/query-keys.ts`
  (`qk.org(orgId)…`) and per-area key files. Recent additions: `qk.organizationSlugAvailable()`,
  `qk.org().membersSecurity()`, `qk.org().agentsCount()`.
- Better-auth org calls always pass `organizationId`. `/v1` calls send `X-Organization-Id`
  (`ORGANIZATION_HEADER` from `@starter/api`), and `resolvePrincipal` answers 409 when it disagrees
  with the caller's org, so two tabs on two orgs can't write to the wrong one.
- Tables: TanStack Table. Long lists: TanStack Virtual. Debounce and run polling: TanStack Pacer,
  which pauses in background tabs. Shortcuts: TanStack Hotkeys (Ctrl/⌘K palette, G H, G A, G O,
  `?`).
- Run summaries: react-markdown with no raw HTML, and sugar-high tokens rendered as React spans
  (`.run-code` in `app.css`).
- Plugin endpoints the typed client lacks go through `client.$fetch`, with a method/path table test.

## Feature flags

`containers/org-features.tsx` (`OrgFeatures`, inside `OrgGate`) binds an OpenFeature provider to
the organization the page shows: `@openfeature/ofrep-web-provider` against this origin's
`/ofrep/v1/evaluate/flags` (session cookie and `X-Organization-Id`, `network-first` so a paused flag
never shows on from a stale cache), with `targetingKey` set to the org id. Read a flag with
`useFlag(key)` from `lib/flags.ts`: keys are typed to `packages/flags`, and the catalog default
answers until the provider does. Keep the call in the route file or a container and pass a boolean
down, so pages stay props-in (the org home's `whats-new-card` is the example). Tests pass
`createProvider` an `InMemoryProvider` (`containers/org-features.test.tsx`).

`OrgFeatures` also asks `whoami` whether this is the operator organization (`OperatorContext`,
`lib/operator.ts`). Settings pages build their tabs with `useSettingsTabs(slug)`, which adds
Feature flags (`/:org/settings/flags`: rollouts, targets, reclaim, delete) only there. It has no
board or e2e journey: the operator organization is set by `OPERATOR_ORGANIZATION_ID` at server
start, which the e2e stack can't know before it creates its organizations.

## Theme

Light, Dark or System, in `lib/theme.ts` (localStorage `starter.theme`). The boot script is inline
(`src/theme-boot.js?raw`, allowed by the CSP hash). Never put un-hashed files under `/assets`: that
path is served immutable. `app.css` `@source`s both `packages/ui/src/components/ui` and
`packages/ui/src/dplus`.

## Devtools

`src/devtools.tsx` mounts TanStack Devtools (Router, Query, Form, Pacer, Hotkeys), lazily, behind
`import.meta.env.DEV && MODE !== "test"`. The dist has none (form-core's tiny
`devtools-event-client` does ship).

## Billing

`lib/billing/` holds the `BillingAdapter`. It is the fixture (labelled `[SAMPLE DATA]`, prices
`[PRICE]`, changes disabled) unless `GET /api/auth/sign-in-methods` reports Stripe with at least one
plan. A failed check is an error, asked again on the next visit, not the fixture. "Requests today"
is real (the web app's own reads aren't counted).

## Runs

Approvals take effect 30 seconds after the decision (server `effectiveAt`). The countdown corrects
for clock skew from the response `Date` header (`lib/server-clock.ts`).

## Tests

Web tests use jsdom and Testing Library. See `docs/testing.md`.
