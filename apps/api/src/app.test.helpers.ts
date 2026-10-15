// Test-only: the real app on in-process Postgres (PGlite) with two organizations:
//   - "acme": owner (session), a viewer member (session), a full key and a read-only key
//   - "other": a separate user's personal org, for cross-tenant checks
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { AnyOperation } from "@starter/api"
import { createAuth } from "@starter/auth"
import { createTestDb } from "@starter/db/testing"
import { createLogger } from "@starter/logger"
import { createApp } from "./app"
import { createOperations } from "./operations"

export const BASE = "http://localhost:3000"

export async function createTestApp(extra: readonly AnyOperation[] = []) {
  const t = await createTestDb()
  const auth = createAuth({
    db: t.db,
    secret: "a-test-secret-that-is-long-enough-123456", // gitleaks:allow
    baseURL: BASE,
    emailFrom: "Test <auth@example.com>",
    oauthResources: [BASE, `${BASE}/mcp`],
  })
  const operations = [...createOperations({ auth, db: t.db }), ...extra]
  const app = createApp({
    auth,
    operations,
    baseURL: BASE,
    name: "Test API",
    version: "1.0.0",
    description: "A test API.",
    logger: createLogger({ level: "silent" }),
  })
  const req = (path: string, init: RequestInit = {}) => app.request(`${BASE}${path}`, init)

  let n = 0
  async function signUp(name: string) {
    n++
    const email = `user${n}@example.com`
    const res = await auth.api.signUpEmail({
      body: { email, password: "correct-horse-battery", name },
      returnHeaders: true,
    })
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    const orgId = session?.session.activeOrganizationId
    if (!orgId) throw new Error("signup did not activate a personal organization")
    return { userId: res.response.user.id, email, cookie, orgId }
  }

  const owner = await signUp("Owner")
  const viewer = await signUp("Viewer")
  await auth.api.addMember({
    body: { organizationId: owner.orgId, userId: viewer.userId, role: "viewer" },
  })
  await auth.api.setActiveOrganization({
    headers: new Headers({ cookie: viewer.cookie }),
    body: { organizationId: owner.orgId },
  })
  const other = await signUp("Other")

  const orgKey = async (
    organizationId: string,
    userId: string,
    permissions: Record<string, string[]>,
  ) => (await auth.api.createApiKey({ body: { organizationId, userId, permissions } })).key
  const fullKey = await orgKey(owner.orgId, owner.userId, {
    project: ["create", "read", "update", "delete"],
    apiKey: ["read"],
  })
  const readKey = await orgKey(owner.orgId, owner.userId, { project: ["read"] })
  const otherKey = await orgKey(other.orgId, other.userId, {
    project: ["create", "read", "delete"],
  })

  /** Headers for a credential: an API key (`sk_…`) or a session cookie. */
  const as = (credential: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (credential.startsWith("sk_")) headers.set("x-api-key", credential)
    else headers.set("cookie", credential)
    if (!headers.has("content-type")) headers.set("content-type", "application/json")
    return { ...init, headers }
  }

  /** An MCP client on /mcp using a credential (API key, cookie) or explicit headers. */
  const mcpClient = async (credential: string | Record<string, string>) => {
    const client = new Client({ name: "test", version: "1.0.0" })
    const sign = (init: RequestInit = {}) => {
      if (typeof credential === "string") return as(credential, init)
      const headers = new Headers(init.headers)
      for (const [k, v] of Object.entries(credential)) headers.set(k, v)
      return { ...init, headers }
    }
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
        fetch: async (url, init) => app.request(String(url), sign(init)),
      }),
    )
    return client
  }

  return {
    app,
    auth,
    operations,
    req,
    as,
    mcpClient,
    signUp,
    owner,
    viewer,
    other,
    fullKey,
    readKey,
    otherKey,
    close: t.close,
  }
}
