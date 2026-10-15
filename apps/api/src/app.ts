import {
  type AnyOperation,
  type ApiInfo,
  type Caller,
  covers,
  invoke,
  llmsFullTxt,
  llmsTxt,
  openApiDocument,
} from "@starter/api"
import {
  AUTH_BASE_PATH,
  OAUTH_SCOPE_GRANTS,
  OAUTH_SCOPES,
  type Auth,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
  resolvePrincipal,
} from "@starter/auth"
import { AppError, reportError, toAppError } from "@starter/errors"
import { type Logger } from "@starter/logger"
import { createMcpHandler, protectedResourceMetadata } from "@starter/mcp"
import { Hono } from "hono"

export interface AppOptions {
  auth: Auth
  operations: readonly AnyOperation[]
  /** Public base URL, e.g. https://api.example.com (no trailing slash). */
  baseURL: string
  name: string
  version: string
  description: string
  logger: Logger
}

/**
 * The API surface for people and agents, all generated from one operation registry:
 * REST under the operations' paths, MCP at /mcp, OpenAPI, llms.txt and OAuth discovery.
 */
export function createApp(opts: AppOptions) {
  const { auth, operations, baseURL, logger } = opts
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
  const openapi = openApiDocument(operations, info)
  const llms = llmsTxt(operations, info)
  const llmsFull = llmsFullTxt(operations, info)

  const authenticate = (req: Request): Promise<Caller | null> =>
    resolvePrincipal(auth, req.headers, { audience })

  const mcp = createMcpHandler({
    name: opts.name,
    version: opts.version,
    instructions: `${opts.description} Full reference: ${baseURL}/llms-full.txt`,
    operations,
    authenticate,
    resourceMetadataUrl: `${baseURL}/.well-known/oauth-protected-resource/mcp`,
  })
  const resourceMetadata = protectedResourceMetadata({
    resource: mcpUrl,
    authorizationServers: [issuer],
    scopes: OAUTH_SCOPES,
    name: opts.name,
  })
  const asMetadata = oauthProviderAuthServerMetadata(auth)
  const oidcMetadata = oauthProviderOpenIdConfigMetadata(auth)

  const app = new Hono<{ Variables: { requestId: string } }>()

  app.use(async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID()
    c.set("requestId", requestId)
    const start = performance.now()
    await next()
    c.header("x-request-id", requestId)
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - start),
        agent: c.req.header("user-agent"),
      },
      "request",
    )
  })

  app.onError((e, c) => {
    const error = toAppError(e)
    // Agents sending bad requests is normal traffic; only report what we'd want to be paged for.
    if (error.status >= 500 || !error.expose) {
      reportError(error, { requestId: c.get("requestId"), path: c.req.path })
      logger.error({ err: error, requestId: c.get("requestId") }, error.message)
    }
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
  app.get("/health", (c) => c.json({ ok: true }))
  app.get("/", (c) => {
    const accept = c.req.header("accept") ?? ""
    if (accept.includes("text/html")) return c.redirect("/llms.txt")
    return markdown(llms)()
  })

  // MCP (Streamable HTTP, stateless).
  app.all("/mcp", (c) => mcp(c.req.raw, { requestId: c.get("requestId") }))

  // REST: one route per operation.
  for (const op of operations) {
    app.on(op.method, op.path, async (c) => {
      const caller = await authenticate(c.req.raw)
      if (!caller) throw new AppError("UNAUTHORIZED", "Send an API key or OAuth access token")
      let body: unknown = {}
      if (op.method !== "GET" && op.method !== "DELETE") {
        body = await c.req.json().catch(() => {
          throw new AppError("BAD_REQUEST", "Body must be JSON")
        })
      }
      const input = { ...c.req.query(), ...(body as object), ...c.req.param() }
      return c.json(await invoke(op, input, { caller, requestId: c.get("requestId") }))
    })
  }

  return app
}
