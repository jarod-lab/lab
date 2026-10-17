import { getConnInfo } from "@hono/node-server/conninfo"
import {
  type AnyOperation,
  type ApiInfo,
  type Caller,
  covers,
  invoke,
  DEFAULT_REGISTRY_META,
  llmsFullTxt,
  llmsTxt,
  type OperationContext,
  openApiDocument,
  type RegistryMeta,
  serverJson,
} from "@starter/api"
import {
  AUTH_BASE_PATH,
  type Auth,
  OAUTH_SCOPE_GRANTS,
  OAUTH_SCOPES,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
  provisionalSignup,
  resolvePrincipal,
} from "@starter/auth"
import { AppError, reportError, toAppError } from "@starter/errors"
import { type Logger } from "@starter/logger"
import { createMcpHandler, protectedResourceMetadata } from "@starter/mcp"
import {
  createStatusHandler,
  requestIdFrom,
  type StatusOptions,
  type StatusProvider,
} from "@starter/observability"
import { type Context, Hono } from "hono"

import { BEARER_PATHS, bearerCors } from "./cors"
import type { ApiHooks } from "./hooks"
import { type DevMailSink, devMailRoute } from "./dev-mail"
import { mountWeb } from "./static"
import { REST_ONLY_OPERATIONS, signupInput } from "./operations"

export interface AppOptions {
  auth: Auth
  operations: readonly AnyOperation[]
  /** Public base URL, e.g. https://api.example.com (no trailing slash). */
  baseURL: string
  name: string
  version: string
  description: string
  logger: Logger
  /** Metering, idempotency and audit for every operation call (see hooks.ts). */
  hooks: ApiHooks
  /**
   * Take the client IP from the rightmost X-Forwarded-For entry (the one our proxy added). Only when
   * a proxy overwrites that header; otherwise the socket address is used.
   */
  trustProxy?: boolean
  /** The built web app to serve from this origin (apps/web/dist). */
  webDistDir?: string
  /** The MCP registry's name and description for this server (server.json). */
  registry?: RegistryMeta
  /**
   * Vendors `GET /status` reports, from their own status pages (`parseStatusProviders`). Unset, there
   * is no /status. `fetch` is for tests.
   */
  status?: { providers: readonly StatusProvider[]; fetch?: StatusOptions["fetch"] }
  /**
   * Dev and e2e only: the in-memory mail sink the auth emails go to (dev-mail.ts). Unset, there is no
   * /api/dev/mail route at all.
   */
  devMail?: DevMailSink
}

/** Operations that take no credential. Everything else needs an API key or OAuth token. */
const UNAUTHENTICATED = ["signup"]

/** Idempotency-Key: 1 to 255 characters, or absent. */
function idempotencyKeyOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (value.length === 0 || value.length > 255) {
    throw new AppError("BAD_REQUEST", "Idempotency-Key must be 1 to 255 characters", {
      hint: "Send a unique string per logical action, or omit the header.",
    })
  }
  return value
}

/** The client's address for signup limits. X-Forwarded-For only when the proxy is trusted. */
function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const ours = forwarded.at(-1)
    if (ours) return ours
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    // No socket (tests call the app directly).
    return "unknown"
  }
}

/** Headers an error response carries: its own, plus retry-after from a rate limit's context. */
function errorHeaders(error: AppError): Record<string, string> {
  const headers = { ...error.headers }
  const retryAfter = error.context.retryAfter
  if (headers["retry-after"] === undefined && typeof retryAfter === "number") {
    headers["retry-after"] = String(retryAfter)
  }
  return headers
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/**
 * The OpenAPI document, with the one operation that needs no credentials and takes no idempotency
 * key (signup) corrected: its generated entry would advertise auth and a retry header it ignores.
 */
function openApi(doc: ReturnType<typeof openApiDocument>) {
  const post = doc.paths["/v1/signup"]?.post
  if (isRecord(post)) {
    post.security = []
    if (Array.isArray(post.parameters)) {
      post.parameters = post.parameters.filter(
        (p) => !(isRecord(p) && p.name === "Idempotency-Key"),
      )
    }
  }
  return doc
}

/**
 * The request path for the access log. better-auth's emailed reset link (also the claim link) puts a
 * live token in the path, `/api/auth/reset-password/<token>`, so that segment is replaced.
 */
const loggedPath = (path: string) =>
  path.replace(/^(\/api\/auth\/reset-password\/)[^/]+/, "$1[Redacted]")

/**
 * The API surface for people and agents, all generated from one operation registry:
 * REST under the operations' paths, MCP at /mcp, OpenAPI, llms.txt and OAuth discovery.
 */
export function createApp(opts: AppOptions) {
  const { auth, operations, baseURL, logger, hooks } = opts
  const trustProxy = opts.trustProxy ?? false
  const issuer = `${baseURL}${AUTH_BASE_PATH}`
  const mcpUrl = `${baseURL}/mcp`
  const audience = [baseURL, mcpUrl]

  const info: ApiInfo = {
    title: opts.name,
    version: opts.version,
    description: opts.description,
    baseURL,
    oauth: {
      authorizationUrl: `${issuer}/oauth2/authorize`,
      tokenUrl: `${issuer}/oauth2/token`,
      scopes: Object.fromEntries(
        OAUTH_SCOPES.map((s) => [s, `${s}: ${JSON.stringify(OAUTH_SCOPE_GRANTS[s])}`]),
      ),
      scopesFor: (permissions) =>
        OAUTH_SCOPES.filter((s) => covers(OAUTH_SCOPE_GRANTS[s], permissions)),
    },
  }
  const openapi = openApi(openApiDocument(operations, info))
  const docLinks = { unauthenticated: UNAUTHENTICATED }
  const llms = llmsTxt(operations, info, docLinks)
  const llmsFull = llmsFullTxt(operations, info, docLinks)
  const registryRecord = serverJson(info, opts.registry ?? DEFAULT_REGISTRY_META)

  const authenticate = (req: Request): Promise<Caller | null> =>
    resolvePrincipal(auth, req.headers, { audience })

  const mcp = createMcpHandler({
    name: opts.name,
    version: opts.version,
    instructions: `${opts.description} Full reference: ${baseURL}/llms-full.txt`,
    operations: operations.filter((op) => !REST_ONLY_OPERATIONS.has(op.name)),
    authenticate,
    resourceMetadataUrl: `${baseURL}/.well-known/oauth-protected-resource/mcp`,
    invokeOptions: hooks.invokeOptions,
  })
  const resourceMetadata = protectedResourceMetadata({
    resource: mcpUrl,
    authorizationServers: [issuer],
    // MCP clients often request exactly these. offline_access gets them a refresh token, so they
    // needn't re-authorize hourly and survive the approving web session signing out.
    scopes: [...OAUTH_SCOPES, "offline_access"],
    name: opts.name,
  })
  const asMetadata = oauthProviderAuthServerMetadata(auth)
  const oidcMetadata = oauthProviderOpenIdConfigMetadata(auth)

  const app = new Hono<{ Variables: { requestId: string } }>()

  app.use(async (c, next) => {
    // An incoming id goes into every log line and back out in a header: short, plain ones only.
    const requestId = requestIdFrom(c.req.raw.headers)
    c.set("requestId", requestId)
    const start = performance.now()
    await next()
    c.header("x-request-id", requestId)
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: loggedPath(c.req.path),
        status: c.res.status,
        ms: Math.round(performance.now() - start),
        agent: c.req.header("user-agent"),
      },
      "request",
    )
  })

  // Browsers may call the bearer surfaces cross-origin. Never /api/auth/*: that stays same-origin.
  const cors = bearerCors()
  for (const path of BEARER_PATHS) app.use(path, cors)

  app.onError((e, c) => {
    const error = toAppError(e)
    // Agents sending bad requests is normal traffic; only report what we'd want to be paged for.
    if (error.status >= 500 || !error.expose) {
      reportError(error, { requestId: c.get("requestId"), path: loggedPath(c.req.path) })
      logger.error({ err: error, requestId: c.get("requestId") }, error.message)
    }
    for (const [name, value] of Object.entries(errorHeaders(error))) c.header(name, value)
    return c.json({ error: error.toPublic() }, error.status as 400)
  })

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404))

  // Auth: better-auth routes, plus OAuth discovery at the root (RFC 8414 path insertion too).
  app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => auth.handler(c.req.raw))
  for (const suffix of ["", AUTH_BASE_PATH]) {
    app.get(`/.well-known/oauth-authorization-server${suffix}`, (c) => asMetadata(c.req.raw))
    app.get(`/.well-known/openid-configuration${suffix}`, (c) => oidcMetadata(c.req.raw))
  }
  for (const suffix of ["", "/mcp"]) {
    app.get(`/.well-known/oauth-protected-resource${suffix}`, (c) => c.json(resourceMetadata))
  }

  // Agent-readable docs.
  const markdown = (body: string) => () =>
    new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8" } })
  app.get("/llms.txt", markdown(llms))
  app.get("/llms-full.txt", markdown(llmsFull))
  app.get("/openapi.json", (c) => c.json(openapi))
  app.get("/.well-known/mcp/server.json", (c) => c.json(registryRecord))
  // Liveness only: it says this process answers, and pings no dependency. /status reports the
  // vendors, from what they publish about themselves.
  app.get("/health", (c) => c.json({ ok: true }))
  if (opts.status) {
    const status = createStatusHandler(opts.status.providers, { fetch: opts.status.fetch, logger })
    app.get("/status", () => status())
  }
  app.get("/", (c) => {
    const accept = c.req.header("accept") ?? ""
    if (accept.includes("text/html")) return c.redirect("/llms.txt")
    return markdown(llms)()
  })

  // Dev and e2e only: the captured auth emails. Not mounted unless a sink was passed (DEV_MAIL_SINK).
  if (opts.devMail) app.get("/api/dev/mail", devMailRoute(opts.devMail))

  // MCP (Streamable HTTP, stateless).
  app.all("/mcp", (c) => mcp(c.req.raw, { requestId: c.get("requestId") }))

  // Signup needs no credentials. With credentials, it falls through to the operation (which refuses).
  app.post("/v1/signup", async (c, next) => {
    if (await authenticate(c.req.raw)) return next()
    const body = await c.req.json().catch(() => {
      throw new AppError("BAD_REQUEST", "Body must be JSON")
    })
    const input = signupInput.safeParse(body)
    if (!input.success)
      throw new AppError("BAD_REQUEST", "Invalid signup", {
        hint: input.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
      })
    const created = await provisionalSignup(auth, {
      email: input.data.email,
      name: input.data.name,
      ip: clientIp(c, trustProxy),
    })
    return c.json({
      organizationId: created.organizationId,
      apiKey: created.apiKey,
      claimUrlSentTo: input.data.email.trim().toLowerCase(),
      apiKeyEndsWhenClaimed: true,
      limits: { requestsPerDay: hooks.limits.unclaimed },
    })
  })

  /**
   * The browser sends the session cookie with any request to this origin, including a form another
   * same-site page posts as text/plain. So a write the cookie authenticates must come from a trusted
   * origin, as better-auth requires on /api/auth/*. Browsers send Origin on every non-GET request.
   */
  async function assertTrustedOrigin(req: Request) {
    const origin = req.headers.get("origin")
    if (origin && origin !== "null" && (await auth.$context).isTrustedOrigin(origin)) return
    throw new AppError("FORBIDDEN", "A signed-in write must come from the web app", {
      hint: "Agents and scripts authenticate with an API key or OAuth access token, not a session cookie.",
    })
  }

  // REST: one route per operation.
  for (const op of operations) {
    app.on(op.method, op.path, async (c) => {
      const caller = await authenticate(c.req.raw)
      if (!caller) throw new AppError("UNAUTHORIZED", "Send an API key or OAuth access token")
      if (caller.via === "session" && op.method !== "GET") await assertTrustedOrigin(c.req.raw)
      let body: unknown = {}
      if (op.method !== "GET" && op.method !== "DELETE") {
        // No body is an empty input: an operation whose input is all path parameters has none.
        const text = await c.req.text()
        try {
          body = text.trim() === "" ? {} : JSON.parse(text)
        } catch {
          throw new AppError("BAD_REQUEST", "Body must be JSON")
        }
        // Spreading an array or a string would turn it into numbered fields.
        if (!isRecord(body) || Array.isArray(body)) {
          throw new AppError("BAD_REQUEST", "Body must be a JSON object", {
            hint: 'Send the input fields as one object, e.g. {"name": "..."}.',
          })
        }
      }
      const input = { ...c.req.query(), ...(body as object), ...c.req.param() }
      const ctx: OperationContext = {
        caller,
        requestId: c.get("requestId"),
        idempotencyKey: idempotencyKeyOf(c.req.header("idempotency-key")),
      }
      try {
        const result = await invoke(op, input, ctx, hooks.invokeOptions)
        for (const [name, value] of Object.entries(hooks.rateLimitHeaders(ctx)))
          c.header(name, value)
        return c.json(result)
      } catch (e) {
        // Refusals by the rate limit still carry the counters.
        for (const [name, value] of Object.entries(hooks.rateLimitHeaders(ctx)))
          c.header(name, value)
        throw e
      }
    })
  }

  if (opts.webDistDir) mountWeb(app, opts.webDistDir)

  return app
}
