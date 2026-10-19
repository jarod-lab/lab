// Test-only: the real app on in-process Postgres (PGlite) with two organizations:
//   - "acme": owner (session), a viewer member (session), a full key and a read-only key
//   - "other": a separate user's personal org, for cross-tenant checks
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { AnyOperation } from "@starter/api"
import { type AuthEvent, type AuthRateLimitOptions, createAuth } from "@starter/auth"
import { createTestDb } from "@starter/db/testing"
import { type Logger, createLogger } from "@starter/logger"
import { type AppOptions, createApp } from "./app"
import { createApiHooks } from "./hooks"
import { createDevMailSink } from "./dev-mail"
import { recordAuthEvent } from "./data/audit"
import { type MeterLimits, createMeter } from "./meter"
import { createOperations } from "./operations"

export const BASE = "http://localhost:3000"

/** The REST request for an operation's input: path params in the path, the rest as query or body. */
export function requestFor(op: AnyOperation, input: Record<string, unknown>) {
  let path = op.path
  const rest = { ...input }
  for (const [k, v] of Object.entries(input)) {
    if (path.includes(`:${k}`)) {
      path = path.replace(`:${k}`, encodeURIComponent(String(v)))
      delete rest[k]
    }
  }
  if (op.method === "GET" || op.method === "DELETE") {
    const qs = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, String(v)])).toString()
    return { path: qs ? `${path}?${qs}` : path, init: { method: op.method } }
  }
  return { path, init: { method: op.method, body: JSON.stringify(rest) } }
}
/** The test server secret: better-auth's, and the one idempotency records are sealed with. */
export const SECRET = "a-test-secret-that-is-long-enough-123456" // gitleaks:allow

/** An auth email the app sent, as the fake SES client received it. */
export interface SentEmail {
  to: string
  subject: string
  /** The first link to the app in the email (verification, reset), or "" when it has none. */
  link: string
}

export interface TestAppOptions {
  /** Daily request limits. Test users are unverified, so `unclaimed` is the one that applies. */
  limits?: Partial<MeterLimits>
  /** Trust X-Forwarded-For (as behind a proxy), for signup rate-limit tests. */
  trustProxy?: boolean
  /** A built web app to serve (see static.test.ts). */
  webDistDir?: string
  /** Defaults to a silent logger; pass one with a destination to read the access log. */
  logger?: Logger
  /** Serve GET /status for these vendors (see app.ts). */
  status?: AppOptions["status"]
  /** The clock the run operations read (approval windows). Defaults to the real one. */
  now?: () => Date
  /** Check passwords against Have I Been Pwned. Off here (no network); auth-flows fakes the service. */
  breachCheck?: boolean
  /** Web origins other than BASE (the dev and e2e setup, WEB_ORIGINS): trusted for auth callbacks. */
  webOrigins?: string[]
  /** GitHub and Google sign-in, when a test wants those buttons. */
  github?: { clientId: string; clientSecret: string }
  google?: { clientId: string; clientSecret: string }
  /** Mount GET /api/dev/mail, with auth emails going to the dev mail sink instead of the fake SES. */
  devMail?: boolean
  /** Stripe test mode, with these plans (see auth's stripe option). Unset, billing is not mounted. */
  stripe?: { secretKey: string; webhookSecret: string; plans?: { name: string; priceId: string }[] }
  /** Auth rate limits. Off unless a test opts in (auth-flows: the limiter test), so flows don't 429. */
  rateLimit?: false | AuthRateLimitOptions
  /** Where auth events go. Defaults to the audit trail, as server.ts wires it. */
  onAuthEvent?: (event: AuthEvent) => void | Promise<void>
}

export async function createTestApp(
  extra: readonly AnyOperation[] = [],
  options: TestAppOptions = {},
) {
  const t = await createTestDb()
  // Stands in for SES. Reads the request loosely, so a change in how WrapsEmail shapes it doesn't
  // matter: only who it's for, the subject and the link.
  const outbox: SentEmail[] = []
  const ses = {
    send: async (command: { input: unknown }) => {
      const raw = JSON.stringify(command.input)
      const input = command.input as { Destination?: { ToAddresses?: string[] } }
      const subject = /"Subject":\{"Data":"([^"]*)"/.exec(raw)?.[1] ?? ""
      // The first link back to this app, so a logo or doctype URL in a template doesn't count.
      const links = raw.match(/https?:\/\/[^"\s<>\\]+/g) ?? []
      const link = (links.find((l) => l.startsWith(BASE)) ?? "").replaceAll("&amp;", "&")
      outbox.push({ to: input.Destination?.ToAddresses?.[0] ?? "", subject, link })
      return { MessageId: `test-${outbox.length}`, $metadata: { requestId: "test" } }
    },
  }
  const devMail = options.devMail ? createDevMailSink() : undefined
  const auth = createAuth({
    db: t.db,
    secret: SECRET,
    baseURL: BASE,
    emailFrom: "Test <auth@example.com>",
    oauthResources: [BASE, `${BASE}/mcp`],
    ses: { client: devMail?.client ?? ses },
    stripe: options.stripe,
    // Senders swallow failures; a test must not pass because an email silently failed.
    onEmailError: (error) => {
      throw error
    },
    passwordBreachCheck: options.breachCheck ?? false,
    webOrigins: options.webOrigins,
    github: options.github,
    google: options.google,
    rateLimit: options.rateLimit ?? false,
    onAuthEvent:
      options.onAuthEvent ??
      (async (event) => {
        await recordAuthEvent(t.db, event)
      }),
  })
  const meter = createMeter({
    db: t.db,
    limits: { claimed: 10_000, unclaimed: 500, ...options.limits },
  })
  const operations = [...createOperations({ auth, db: t.db, meter, now: options.now }), ...extra]
  const app = createApp({
    hooks: createApiHooks({ db: t.db, meter, secret: SECRET }),
    trustProxy: options.trustProxy ?? false,
    webDistDir: options.webDistDir,
    status: options.status,
    devMail,
    auth,
    operations,
    baseURL: BASE,
    name: "Test API",
    version: "1.0.0",
    description: "A test API.",
    logger: options.logger ?? createLogger({ level: "silent" }),
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
    else {
      headers.set("cookie", credential)
      // Browsers send Origin; better-auth rejects cookie requests without a trusted one.
      headers.set("origin", BASE)
    }
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
    outbox,
    devMail,
    db: t.db,
    close: t.close,
  }
}
