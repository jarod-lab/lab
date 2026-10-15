# Contracts between nodes

Nodes code against these. A node that must deviate says so in its report, with the reason.

## N2 → N4: `@starter/api` / `@starter/mcp` / `@starter/errors`

```ts
// @starter/errors
new AppError(code, message, { cause?, context?, expose?, hint?: string, docs?: string, headers?: Record<string, string> })
error.toPublic() // { code, message, hint?, docs? }  (hint/docs only when set and exposed)
error.headers    // e.g. { "retry-after": "30" } — REST sets them on the response

// @starter/api
interface OperationContext { caller: Caller; requestId?: string; idempotencyKey?: string }
interface InvokeEvent { op: AnyOperation; input: unknown; ctx: OperationContext }
interface InvokeHooks {
  /** After permission + input validation, before the handler. Return { result } to short-circuit (idempotent replay). */
  before?(e: InvokeEvent): Promise<{ result: unknown } | undefined | void>
  /** Always runs once the handler was reached (or short-circuited), with the outcome. Must not throw past invoke. */
  after?(e: InvokeEvent & { outcome: { ok: true; result: unknown; replayed: boolean } | { ok: false; error: AppError } }): Promise<void>
}
interface InvokeOptions {
  hooks?: InvokeHooks
  /** Text for FORBIDDEN hints, e.g. "Needs project:read; OAuth scope `read` or an API key with project:read". */
  permissionHint?: (missing: PermissionSet) => string
}
invoke(op, raw, ctx, options?: InvokeOptions)
// FORBIDDEN (missing permission) and hook-thrown errors: `before` may throw AppError (e.g. RATE_LIMITED, CONFLICT).

// Pagination
paginationInput      // z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })
paginated(key, item) // z.object({ [key]: z.array(item), nextCursor: z.string().nullable() })
encodeCursor(value: Record<string, string | number>): string // base64url JSON
decodeCursor(cursor: string): Record<string, unknown>         // BAD_REQUEST with hint on garbage

// OpenAPI: every non-readOnly operation documents an optional `Idempotency-Key` header parameter;
// error responses document hint/docs.

// @starter/mcp
createMcpHandler({ ..., invokeOptions?: InvokeOptions })
// Non-readOnly tools get an optional `idempotencyKey` string arg (described for agents); the handler strips it
// from the input and passes it as ctx.idempotencyKey. isError results include the hint text.
```

## N1 → N4: data functions (`apps/api/src/data/*.ts`), all taking `Named` org + `CallerActsFor` proof

```ts
// audit.ts
recordAuditEvent(db, org, proof, e: { actorType: "user" | "apiKey"; actorId: string; clientId?: string;
  operation: string; outcome: "ok" | ErrorCode; requestId?: string }): Promise<void>
listAuditEvents(db, org, proof, page: { after?: { at: string; id: string }; limit: number }):
  Promise<{ id; at: Date; actorType; actorId; clientId: string | null; operation; outcome; requestId: string | null }[]>
// usage.ts
incrementUsage(db, org, proof, operation: string, day: string /* YYYY-MM-DD UTC */): Promise<number> // org total for that day after increment
getUsage(db, org, proof, day: string): Promise<{ total: number; byOperation: Record<string, number> }>
// idempotency.ts — reserve-then-complete so concurrent retries can't both run
reserveIdempotencyKey(db, org, proof, { key, operation, requestHash }):
  Promise<{ state: "new" } | { state: "done"; response: unknown } | { state: "in_progress" } | { state: "mismatch" }>
completeIdempotencyKey(db, org, proof, { key, response }): Promise<void>
releaseIdempotencyKey(db, org, proof, key): Promise<void> // on handler failure, so a retry can run
// keys expire after 24h (expiresAt column; reads ignore expired rows)
```

N1 also exports from `@starter/auth`:

```ts
// signup.ts
provisionalSignup(auth, { email, name?, ip }): Promise<{ organizationId; userId; apiKey: string }>
// creates user (random password, emailVerified=false) + personal org + an sk_ key with
// { project: ["read","create","update","delete"] }, sends ONE claim email (reset-password link to /claim),
// throws RATE_LIMITED (with retry-after header) past 5/hour per IP and 20/day per email domain,
// CONFLICT if the email already exists (message must not reveal more than "use sign-in").
isClaimed(user): boolean // emailVerified
DEVICE_VERIFICATION_PATH = "/device"
```

Device grant: `oauthProvider` + `deviceAuthorization({ verificationUri: "/device" })` so
`POST /api/auth/device/code` → user approves at `/device` → `POST /api/auth/oauth2/token`
with `grant_type=urn:ietf:params:oauth:grant-type:device_code` yields an OAuth JWT with `org` from the
approving session's active organization.

## N4 operations (N3 web codes against these)

| op | method + path | output |
|---|---|---|
| `list_connected_agents` | `GET /v1/agents` (`apiKey:read`-style perm, admin) | `{ agents: [{ id, type: "oauthClient" \| "apiKey", name, createdAt, lastUsedAt: string \| null, access: string[] }] }` |
| `revoke_agent_access` | `DELETE /v1/agents/:id` (destructive) | `{ revoked: true }` |
| `list_audit_events` | `GET /v1/audit-events?cursor&limit` | `{ events: [{ id, at, actor: { type, id }, clientId: string \| null, operation, outcome, requestId \| null }], nextCursor }` |
| `signup` | `POST /v1/signup` (no auth) `{ email, name? }` | `{ organizationId, apiKey, claimUrlSentTo: email, limits }` |
| `whoami` (extended) | `GET /v1/whoami` | adds `usage: { day, total, limit }`, `claimed: boolean` |
| `list_projects` (paginated) | `GET /v1/projects?cursor&limit` | `{ projects, nextCursor }` |

## N3 → N4: web build

`apps/web` builds static SPA output to `apps/web/dist` with `index.html` + an asset dir. N3 reports the
asset URL prefix and the list of page paths; N4 serves `index.html` for exactly those page paths (and
`/settings/*`) and the asset dir, from `WEB_DIST_DIR`. `/` stays the llms.txt negotiation.
Pages: `/sign-in`, `/sign-up`, `/consent`, `/select-organization`, `/accept-invitation/:id`, `/device`,
`/reset-password`, `/claim`, `/settings/agents`.
