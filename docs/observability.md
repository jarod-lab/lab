# Observability

- Wrap every route handler in `observe` from `@starter/observability`. `apps/api` has its own
  request-id and access-log middleware instead.
- Health is liveness only. `/health` (`createHealthHandler({})`) pings no dependency and answers
  `{ status: "ok", checks: {} }`.
- Vendor health comes from the vendors themselves. `GET /status` reads each vendor's status page
  (Atlassian Statuspage, status.io, or AWS Health for `aws`, `aws@<region>` or
  `aws:<service>@<region>`). It caches each result for 60 seconds and reports `unknown` when a page
  can't be reached.
- `STATUS_PROVIDERS` sets the list. Unset, it is a broad default: all of AWS, Cloudflare, Vercel,
  Neon and PlanetScale. Narrow it to what the app uses.
- Any open AWS event, in any region, shows `aws` as degraded.
- `observe` reports only 5xx responses (thrown or returned) and non-exposed errors. 4xx are logged.
- Server-error logs include only the allowlisted request headers (`safeHeaders`), never the full
  set.
- No error-tracking SDK is installed yet. Until an app registers one with `setErrorReporter`,
  reported errors go nowhere, only to the logs.

## Logging and errors

- `createLogger({ name })` from `@starter/logger` is pino with secret redaction. Use it, never
  `console.*` or pino directly. `apps/api/src/server.ts` creates the API's logger.
- `AppError` (`@starter/errors`) takes `hint`, `docs`, `headers` and `context`. Clients get
  `error.toPublic()`, never an `INTERNAL` message.
- `setErrorReporter` registers the reporter once at startup. `reportError` passes reported errors to
  it.
- `parseStatusProviders` (`@starter/observability`) parses `STATUS_PROVIDERS`.

## Helpers

- `observe(handler, { logger })` wraps a Web `Request`/`Response` handler with a request id, an
  access log and error handling.
- `createHealthHandler(checks)` is the health handler; the API passes `{}`.
- `createStatusHandler(providers)` serves `/status`, and `parseStatusProviders` builds its list.
