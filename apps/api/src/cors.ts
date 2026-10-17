// CORS for bearer-token surfaces only, so browser-based MCP clients and cross-origin web apps can
// call them with a token. No credentials: cookies are never accepted cross-origin, and the auth
// routes (/api/auth/*) get no CORS headers at all.
import { cors } from "hono/cors"
import type { MiddlewareHandler } from "hono"

/** The paths that accept bearer tokens or API keys. Everything else (pages, auth) stays same-origin. */
export const BEARER_PATHS = [
  "/mcp",
  "/.well-known/*",
  "/openapi.json",
  "/llms.txt",
  "/llms-full.txt",
  "/v1/*",
] as const

/** Request headers a browser may send on these paths. */
export const ALLOWED_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "idempotency-key",
  "mcp-protocol-version",
  "x-api-key",
  "x-organization-id",
] as const

/** Response headers a browser may read: the MCP session, request id, retry and rate-limit state. */
export const EXPOSED_RESPONSE_HEADERS = [
  "mcp-session-id",
  "x-request-id",
  "retry-after",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "www-authenticate",
] as const

export function bearerCors(): MiddlewareHandler {
  return cors({
    origin: "*",
    // Every method an operation uses (see operations.ts), plus the preflight itself.
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [...ALLOWED_REQUEST_HEADERS],
    exposeHeaders: [...EXPOSED_RESPONSE_HEADERS],
    maxAge: 600,
  })
}
