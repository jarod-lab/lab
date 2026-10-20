# Glossary

The words the code, the database, the API docs and the UI share. Use these names, in this sense,
everywhere: a new concept gets a line here before it gets code. Keep each entry to one or two lines.

## Tenancy and access

- **Organization** — the tenant. Every request acts in exactly one; every customer-data table has
  `organizationId`. A signup creates a **personal organization** for the new user.
- **Member** — a user's place in an organization, with a **role**: `owner`, `admin`, `member` or `viewer`,
  or a **capability role** (`approver`, `operator`, `billing`): a fixed role that bundles the permissions for
  one job. Roles are fixed in `packages/auth/src/access.ts`; a member may hold several.
- **Catalog** — the one list of resources and actions (`statements` in `packages/auth/src/access.ts`) that
  roles, API-key permissions, OAuth scopes and operations are all expressed in.
- **Permission** — one `resource: [actions]` entry from the catalog, e.g. `project: ["read"]`.
- **Grant** — a permission set a caller holds. Effective access is role ∩ credential, and a request needs a
  single grant that covers all of it.
- **Scope** — a coarse OAuth permission set shown on the consent screen: `read`, `write`, `admin`.
- **Caller** / **principal** — who is making a request: the organization, the **actor** (a user or an API
  key), the grants and the credential kind (`via`). Resolved by `resolvePrincipal` on every request.
- **Active organization** — the organization a session is acting in; the web app sends it as the
  `X-Organization-Id` header and the server refuses a mismatch.
- **Claimed organization** — one whose owner has verified their email. Unclaimed organizations (from
  **provisional signup**, the credential-less `POST /v1/signup`) get the smaller daily limit.
- **Proof** — a gdp-ts value that a fact was checked (`CallerActsFor`, `ProjectInOrg`). Only `proofs/`
  can mint one; every function that touches tenant data takes one.
- **Fresh session** — a session signed in within the last hour (`FRESH_AGE_SECONDS`). Sensitive actions
  (`fresh: true` operations, `FRESH_SESSION_PATHS`) need one, or they fail with `SESSION_NOT_FRESH`.
- **Auth event** — a mapped better-auth call (a sign-in, a failed sign-in, a password change) recorded as an
  audit row for the person's organization. Not the same as an **audit event**: an auth event with no account
  is only logged.

## Credentials and agents

- **API key** — an organization-owned `sk_` credential with its own permissions, never more than its
  creator's. Rate limited per key.
- **OAuth client** — an app (an AI tool, a CLI) that holds a user's consent for an organization and acts
  with a JWT access token carrying an `org` claim.
- **Device grant** — the sign-in for CLIs and agents: `POST /api/auth/device/code`, a person approves at
  `/device`, the client polls for the token. `starter login` is the reference client.
- **Connected agent** — an API key or an OAuth client that can act in the organization right now
  (`list_connected_agents`, `revoke_agent_access`). Not to be confused with a workspace agent.
- **Workspace agent** (or just **agent** in the product) — a worker the organization configures: name,
  default autonomy, the actions that always wait for a person, an energy budget. Has runs.

## Runs

- **Run** — one execution of a workspace agent. Status: `queued`, `running`, `needs_you`, `done`, `failed`.
  Reports its own footprint (energy, tokens, tool calls).
- **Step** — one ordered item of a run's work, as the run view lists it, with optional "38 of 61" progress.
- **Approval** — an action a run wants to take that a person must allow first. `pending`, `approved` or
  `denied`; a decision takes effect 30 seconds later (`effectiveAt`) and can be undone until then.
- **Needs you** — the run status (and the inbox section) for runs waiting on a person: an approval, or a
  failure to look at. The UI's `solar` accent marks it.
- **Steer** — a message a person sends to a running run (`steer_run`). **Defer** pushes a run's attention
  to a later time.
- **Inbox** — the person's list of runs that need them, across the organization.
- **Notification** — an in-app message to one person (`notification` table, better-inbox), optionally
  stamped with an organization, shown under the top bar's bell. Not the **Inbox**.
- **Notification event** — one typed event (`NotificationEvent`, `packages/auth/src/notifications.ts`)
  that every notification is sent through; its recipients come from the permission catalog.

## The API

- **Operation** — one unit of the API, defined once with `defineOperation` (name, permissions, input,
  output, examples, handler). REST routes, MCP tools, OpenAPI, `llms.txt` and the SDK are generated from it.
- **Registry** — the list of operations an app serves (`createOperations`); the **surfaces** are REST, MCP,
  the SDK and the CLI.
- **Example** — an operation's documented input (and output or expected error) in `examples`. The
  contract test runs every one; the authorization test reuses the first.
- **Contract** — the committed `apps/api/openapi.json` plus the examples: a diff is a public API change.
- **Hint** — the `hint` field on an error, written for an agent: what to do next.
- **Idempotency key** — a client-chosen key on a write; the same request replays the stored response, a
  different one is `CONFLICT`.
- **Audit event** — a row recording who did which operation in which organization. Writes are audited;
  `FORBIDDEN` and `BAD_REQUEST` attempts are not (yet).
- **Metering** — calls per organization per UTC day against its limit; read-only session calls are free.
- **File store** — where uploaded files live: S3, Cloudflare R2, Vercel Blob or a local directory,
  chosen by `STORAGE_DRIVER` (`@starter/storage`). Unset, uploads are off.
- **Analytics event** — one typed product event (`AnalyticsEvent`, `packages/analytics/src/events.ts`):
  an operation call, a new account, a counted auth event or a page view, with its actor and organization.
  Ids only.
- **Analytics provider** — where analytics events go: the log, PostHog or nowhere, chosen by
  `ANALYTICS_PROVIDER` (`@starter/analytics`). Unset, nothing is captured.
- **Upload** — an image a person or agent sends to be kept in the file store: a person's **avatar**
  (`user.image`) or an organization's **logo** (`organization.logo`). The row keeps its public URL.

## Feature flags

- **Operator organization** — the one organization that runs the product (`OPERATOR_ORGANIZATION_ID`).
  Only it manages feature flags: its members, keys and agents call the **operator operations**
  (`audience: "operator"`), which other organizations neither see nor may call.
- **Admin console** — the web app's `/admin` pages for the people who run the product: Users for
  platform admins (the user role `admin`), Feature flags for the operator organization's members.
- **Feature flag** — a boolean release switch declared in code (`defineFlag` in
  `packages/flags/src/catalog.ts`): key, description, owner, default. Removing it from the catalog
  makes every call site that still reads it a compile error.
- **Rollout** — a flag's runtime state (a `feature_flag` row): `enabled`, the organizations it
  **targets**, and a **percentage** of every other organization. No row means the default everywhere.
- **Target** — an organization a flag is turned on (allow-list) or off (deny-list) for, whatever the
  percentage.
- **Bucket** — an organization's fixed place, 0 to 9999, for one flag (a hash of key and org id).
  Raising the percentage only adds organizations; it never moves one out.
- **Evaluation** — the value a flag has for one organization, with its OpenFeature reason (`STATIC`,
  `TARGETING_MATCH`, `SPLIT`, `DISABLED`). Always for the caller's own organization.
- **Exposure** — one evaluation, counted per flag, value and UTC day (`feature_flag_exposure_daily`):
  the evidence for the **stale signals** (inactive, one value only, reclaimed but still in code).
- **Reclaim** — the decision that ends a rollout: the flag serves one value to everyone and can no
  longer change. Then its code is removed, and after that deploy its rollout is deleted.

## The web app

- **App** — the signed-in product (`apps/app`, `@starter/app`) at `app.` on the product domain.
- **Site** — the public website at the apex domain: marketing, pricing, docs, changelog and `llms.txt`.
  It will live in `apps/site` (`@starter/site`), which does not exist yet. Not the **app**.
- **D+** — the design system: warm paper and ink, the `solar` "needs you" accent, 8px radius, 2px ink
  borders. Lives in `packages/ui/src/styles.css` and `src/dplus`.
- **Board** — a design board in `docs/build-app/boards`; each page follows its board's journey, and the
  e2e test for the page follows the same journey.
- **Container** / **page** — the web app's split: a container (`src/containers`) owns data and mutations, a
  page (`src/pages`) is presentational, props in and callbacks out.
- **Shell** — the app frame (sidebar, topbar, command palette) in `@starter/ui/dplus/shell`.
