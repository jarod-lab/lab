// Test-only: hq's real app on in-process Postgres (PGlite), with helpers to sign people up, mint API
// keys and call it over HTTP.
import { createAuth } from "@lab/auth"
import { user } from "@lab/db"
import { eq } from "drizzle-orm"

import { createHqApp } from "./app"
import { createHqTestDb } from "./testing"

const BASE = "http://localhost:3100"
const SECRET = "a-test-secret-that-is-long-enough-123456" // gitleaks:allow

/**
 * What an hq reply's JSON holds, as the tests read it: every operation's output, error and list
 * keys in one shape (a field a reply doesn't have is just not there).
 */
export interface Reply {
  error: { code: string; message: string }
  status: string
  proposalId: string
  entryId: string
  version: number
  latestVersion: number
  id: string
  body: { text: string }
  entries: { id: string; slug: string; version: number }[]
  hits: { id: string; version: number; excerpt: string }[]
  versions: { version: number }[]
  proposals: {
    id: string
    slug: string
    status: string
    entryId: string | null
    decidedBy: string | null
    proposedBy: { type: string }
  }[]
}

export interface TestPerson {
  email: string
  cookie: string
  userId: string
  orgId: string
}

/**
 * An hq app on a test database, with the helpers the HTTP tests share: sign people up, mint API
 * keys, and call it. The clock is fixed unless `now` is given.
 */
export async function createHqHarness(
  opts: { founders?: { userIds: string[]; emails: string[] }; now?: () => Date } = {},
) {
  // Read on every request, so a test may add a founder after sign-up (their user id is new).
  const founders = opts.founders ?? { userIds: [], emails: [] }
  const test = await createHqTestDb()
  const auth = createAuth({
    db: test.db,
    secret: SECRET,
    baseURL: BASE,
    emailFrom: "Test <auth@example.com>",
    oauthResources: [BASE, `${BASE}/mcp`],
    // No mail is sent in tests; a send that fails must fail the test, not vanish.
    ses: { client: { send: async () => ({ MessageId: "test", $metadata: {} }) } },
    onEmailError: (error) => {
      throw error
    },
    passwordBreachCheck: false,
    rateLimit: false,
  })
  const now = opts.now ?? (() => new Date("2026-11-17T12:00:00Z"))
  const app = createHqApp({ db: test.db, auth, now, baseURL: BASE, founders })

  /** Sign a person up (open sign-up: they get a personal organization they own). */
  async function signUp(email: string, { verified = true } = {}): Promise<TestPerson> {
    const res = await auth.api.signUpEmail({
      body: { email, password: "correct-horse-battery", name: email },
      returnHeaders: true,
    })
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    const orgId = session?.session.activeOrganizationId
    if (!orgId) throw new Error("signup did not activate a personal organization")
    const userId = res.response.user.id
    if (verified) await test.db.update(user).set({ emailVerified: true }).where(eq(user.id, userId))
    return { email, cookie, userId, orgId }
  }

  /** An organization API key with exactly these permissions, as the person's. */
  async function keyFor(person: TestPerson, permissions: Record<string, string[]>) {
    return (
      await auth.api.createApiKey({
        body: { organizationId: person.orgId, userId: person.userId, permissions },
      })
    ).key
  }

  type Credential = { cookie: string } | { key: string }
  /** Call hq as a person (their cookie) or a key. */
  async function call(
    as: Credential,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: Reply }> {
    const headers: Record<string, string> = { origin: BASE }
    if ("cookie" in as) headers.cookie = as.cookie
    else headers["x-api-key"] = as.key
    if (body !== undefined) headers["content-type"] = "application/json"
    const res = await app.request(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Reply }
  }

  return { ...test, auth, app, now, founders, signUp, keyFor, call }
}
