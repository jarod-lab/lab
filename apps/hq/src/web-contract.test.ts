// The fake of hq the component tests use (web/src/test/fake-hq.ts) must be as strict as hq: each
// case below runs against the REAL app and against the fake, and both replies are parsed with the
// same zod schemas the client uses and compared on status, error code and the keys of the body.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { z } from "zod"

import { createHqClient, type HqClient } from "../web/src/api/client"
import type { HqErrorKind } from "../web/src/api/errors"
import {
  authErrorSchema,
  decisionSchema,
  errorEnvelopeSchema,
  proposalsPageSchema,
  refusedBodySchema,
  sessionReplySchema,
  statusSchema,
} from "../web/src/api/schemas"
import { createFakeHq, type FakeHq, type FakeHqState } from "../web/src/test/fake-hq"
import { proposalFixture } from "../web/src/test/fixtures"
import { createHqHarness } from "./app.test.helpers"
import { createLazyHq } from "./lazy-hq"

const BASE = "http://localhost:3100"
const PASSWORD = "correct-horse-battery" // gitleaks:allow
type Caller = FakeHqState["caller"]

/** What a browser does to an hq request: the session cookie, and an Origin on a write. */
function harnessFetch(
  app: { request: (url: string, init?: RequestInit) => Response | Promise<Response> },
  cookie: string,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (cookie && !headers.has("cookie")) headers.set("cookie", cookie)
    if (!headers.has("origin")) headers.set("origin", BASE)
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    return app.request(url, { ...init, headers })
  }
}

interface Step {
  method: "GET" | "POST"
  path: (ctx: { proposalId: string }) => string
  /** A JSON body, or `null` to send none at all. */
  body?: unknown
  headers?: Record<string, string>
  /** The schema the client parses a 2xx reply with. */
  schema?: z.ZodType
  /** The status and error code both targets must answer. */
  status: number
  code: string | null
}

interface Scenario {
  name: string
  as: Caller
  steps: Step[]
}

const decide = (decision: "approve" | "reject", extra: Partial<Step> = {}): Step => ({
  method: "POST",
  path: ({ proposalId }) => `/v1/proposals/${proposalId}/decision`,
  body: { decision },
  schema: decisionSchema,
  status: 200,
  code: null,
  ...extra,
})

const scenarios: Scenario[] = [
  {
    name: "signed-out GET /v1/status",
    as: "signed-out",
    steps: [{ method: "GET", path: () => "/v1/status", status: 401, code: "UNAUTHORIZED" }],
  },
  {
    name: "non-founder GET /v1/status",
    as: "non-founder",
    steps: [{ method: "GET", path: () => "/v1/status", status: 403, code: "FORBIDDEN" }],
  },
  {
    name: "founder GET /v1/status",
    as: "founder",
    steps: [
      { method: "GET", path: () => "/v1/status", schema: statusSchema, status: 200, code: null },
    ],
  },
  {
    name: "founder list_proposals",
    as: "founder",
    steps: [
      {
        method: "GET",
        path: () => "/v1/proposals?status=pending",
        schema: proposalsPageSchema,
        status: 200,
        code: null,
      },
    ],
  },
  {
    name: "signed-out list_proposals",
    as: "signed-out",
    steps: [{ method: "GET", path: () => "/v1/proposals", status: 401, code: "UNAUTHORIZED" }],
  },
  {
    name: "non-founder list_proposals",
    as: "non-founder",
    steps: [{ method: "GET", path: () => "/v1/proposals", status: 403, code: "FORBIDDEN" }],
  },
  {
    name: "decide_proposal approve, then again",
    as: "founder",
    steps: [
      decide("approve"),
      decide("approve", { status: 409, code: "CONFLICT", schema: undefined }),
    ],
  },
  { name: "decide_proposal reject", as: "founder", steps: [decide("reject")] },
  {
    name: "decide_proposal on an unknown proposal",
    as: "founder",
    steps: [
      decide("approve", {
        path: () => "/v1/proposals/does-not-exist/decision",
        status: 404,
        code: "NOT_FOUND",
        schema: undefined,
      }),
    ],
  },
  {
    name: "decide_proposal as a non-founder",
    as: "non-founder",
    steps: [decide("approve", { status: 403, code: "FORBIDDEN", schema: undefined })],
  },
  {
    name: "decide_proposal signed out",
    as: "signed-out",
    steps: [decide("approve", { status: 401, code: "UNAUTHORIZED", schema: undefined })],
  },
  {
    name: "a write with a foreign Origin",
    as: "founder",
    steps: [
      decide("approve", {
        headers: { origin: "https://evil.example" },
        status: 403,
        code: "FORBIDDEN",
        schema: undefined,
      }),
    ],
  },
  {
    name: "a write whose body is not JSON",
    as: "founder",
    steps: [
      decide("approve", { body: "not json", status: 400, code: "BAD_REQUEST", schema: undefined }),
    ],
  },
  {
    name: "an unknown path",
    as: "founder",
    steps: [{ method: "GET", path: () => "/v1/nope", status: 404, code: "NOT_FOUND" }],
  },
  {
    name: "get-session with no cookie is 200 null",
    as: "signed-out",
    steps: [
      {
        method: "GET",
        path: () => "/api/auth/get-session",
        schema: sessionReplySchema,
        status: 200,
        code: null,
      },
    ],
  },
  {
    name: "get-session as a founder",
    as: "founder",
    steps: [
      {
        method: "GET",
        path: () => "/api/auth/get-session",
        schema: sessionReplySchema,
        status: 200,
        code: null,
      },
    ],
  },
  {
    name: "sign-out needs JSON",
    as: "founder",
    steps: [
      {
        method: "POST",
        path: () => "/api/auth/sign-out",
        body: "x",
        headers: { "content-type": "text/plain" },
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
    ],
  },
  {
    name: "sign-out with a body that is not JSON",
    as: "founder",
    steps: [
      {
        method: "POST",
        path: () => "/api/auth/sign-out",
        body: "x",
        status: 400,
        code: "BAD_REQUEST",
      },
    ],
  },
  {
    name: "sign-out from a foreign Origin is INVALID_ORIGIN",
    as: "founder",
    steps: [
      {
        method: "POST",
        path: () => "/api/auth/sign-out",
        body: {},
        headers: { origin: "https://evil.example" },
        status: 403,
        code: "INVALID_ORIGIN",
      },
    ],
  },
  {
    name: "sign-out signs out",
    as: "founder",
    steps: [
      { method: "POST", path: () => "/api/auth/sign-out", body: {}, status: 200, code: null },
    ],
  },
  {
    name: "sign-in with a wrong password",
    as: "signed-out",
    steps: [
      {
        method: "POST",
        path: () => "/api/auth/sign-in/email",
        body: { email: "founder@example.com", password: "wrong-password-here" },
        status: 401,
        code: "INVALID_EMAIL_OR_PASSWORD",
      },
    ],
  },
  {
    name: "sign-in with the right password",
    as: "signed-out",
    steps: [
      {
        method: "POST",
        path: () => "/api/auth/sign-in/email",
        body: { email: "founder@example.com", password: PASSWORD },
        status: 200,
        code: null,
      },
    ],
  },
]

/** The status, error code and body keys of a reply: what the contract compares. */
async function observe(res: Response) {
  const text = await res.text()
  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { status: res.status, body, text }
}

function errorCodeOf(body: unknown): string | null {
  const envelope = errorEnvelopeSchema.safeParse(body)
  if (envelope.success) return envelope.data.error.code
  const auth = authErrorSchema.safeParse(body)
  return auth.success ? (auth.data.code ?? null) : null
}

/** Every object key path of a JSON value, arrays flattened; null and scalars end a path. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => keyPaths(item, `${prefix}[]`))
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => [
    `${prefix}.${key}`,
    ...keyPaths(child, `${prefix}.${key}`),
  ])
}
const keySet = (value: unknown) => [...new Set(keyPaths(value))].sort()

interface Run {
  statuses: number[]
  codes: (string | null)[]
  keys: string[][]
  parsed: boolean[]
}

async function runSteps(steps: Step[], send: typeof fetch, proposalId: string): Promise<Run> {
  const run: Run = { statuses: [], codes: [], keys: [], parsed: [] }
  for (const step of steps) {
    const init: RequestInit = { method: step.method, headers: { ...step.headers } }
    if (step.method === "POST" && step.body !== null) {
      const headers = init.headers as Record<string, string>
      headers["content-type"] ??= "application/json"
      init.body = typeof step.body === "string" ? step.body : JSON.stringify(step.body ?? {})
    }
    const seen = await observe(await send(`${BASE}${step.path({ proposalId })}`, init))
    run.statuses.push(seen.status)
    run.codes.push(errorCodeOf(seen.body))
    run.keys.push(keySet(seen.body))
    run.parsed.push(
      seen.status === 200 && step.schema ? step.schema.safeParse(seen.body).success : true,
    )
  }
  return run
}

describe("the fake of hq is as strict as hq", () => {
  let hq: Awaited<ReturnType<typeof createHqHarness>>
  const cookies = {} as Record<Caller, string>

  beforeAll(async () => {
    hq = await createHqHarness({ founderEmails: ["founder@example.com"] })
    cookies.founder = (await hq.signUp("founder@example.com")).cookie
    cookies["non-founder"] = (await hq.signUp("someone@example.com")).cookie
    cookies["signed-out"] = ""
    cookies.refused = ""
  })
  afterAll(async () => {
    await hq.close()
  })

  /** A session of its own, so a sign-out in one case does not end the next case's. */
  async function freshCookie(email: string): Promise<string> {
    const res = await hq.app.request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    expect(res.status).toBe(200)
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .filter((c) => !c.endsWith("="))
      .join("; ")
  }

  async function realProposal(): Promise<string> {
    const made = await hq.call({ cookie: cookies.founder }, "POST", "/v1/proposals", {
      kind: "fact",
      slug: `pricing-${Math.random().toString(36).slice(2, 8)}`,
      title: "Pricing",
      body: { text: "Free, then $20 per seat." },
      reason: "Stated in the founders call",
    })
    expect(made.status).toBe(200)
    return made.body.proposalId
  }

  it.each(scenarios)("$name", async ({ as, steps }) => {
    const proposalId = await realProposal()
    const cookie =
      as === "founder" || as === "non-founder"
        ? await freshCookie(as === "founder" ? "founder@example.com" : "someone@example.com")
        : ""
    const real = await runSteps(steps, harnessFetch(hq.app, cookie), proposalId)

    const fake = createFakeHq({ caller: as, proposals: [proposalFixture({ id: "proposal-1" })] })
    const faked = await runSteps(steps, fake.fetch, "proposal-1")

    const expected = {
      statuses: steps.map((s) => s.status),
      codes: steps.map((s) => s.code),
    }
    expect({ statuses: real.statuses, codes: real.codes }).toEqual(expected)
    expect({ statuses: faked.statuses, codes: faked.codes }).toEqual(expected)
    expect(real.parsed.every(Boolean)).toBe(true)
    expect(faked.parsed.every(Boolean)).toBe(true)
    expect(faked.keys).toEqual(real.keys)
  })

  it("a refused boot is 503 with a string error on every path, in the real lazy hq and the fake", async () => {
    const refusedApp = createLazyHq(
      async () => {
        throw new Error("boom")
      },
      { error: () => {} },
    )
    const fake = createFakeHq({ caller: "refused" })
    for (const path of ["/v1/status", "/api/auth/get-session", "/v1/proposals"]) {
      for (const send of [harnessFetch(refusedApp, ""), fake.fetch]) {
        const seen = await observe(await send(`${BASE}${path}`))
        expect(seen.status).toBe(503)
        expect(refusedBodySchema.safeParse(seen.body).success).toBe(true)
        expect(seen.text).toBe('{"error":"service unavailable"}')
        expect(errorCodeOf(seen.body)).toBeNull()
      }
    }
  })

  describe("the client reads both the same way", () => {
    const kindOf = async (call: Promise<unknown>): Promise<HqErrorKind | "ok"> =>
      call.then(
        () => "ok" as const,
        (error: { kind: HqErrorKind }) => error.kind,
      )

    async function clients(
      as: Caller,
    ): Promise<{ real: HqClient; fake: HqClient; fakeHq: FakeHq }> {
      const fakeHq = createFakeHq({
        caller: as,
        proposals: [proposalFixture({ id: "proposal-1" })],
      })
      return {
        real: createHqClient({ baseUrl: BASE, fetch: harnessFetch(hq.app, cookies[as]) }),
        fake: createHqClient({ baseUrl: BASE, fetch: fakeHq.fetch }),
        fakeHq,
      }
    }

    it("maps 401, 403 and 409 to the same kinds", async () => {
      const out = await clients("signed-out")
      expect(await kindOf(out.real.status())).toBe("unauthorized")
      expect(await kindOf(out.fake.status())).toBe("unauthorized")
      const non = await clients("non-founder")
      expect(await kindOf(non.real.status())).toBe("forbidden")
      expect(await kindOf(non.fake.status())).toBe("forbidden")

      const founder = await clients("founder")
      const proposalId = await realProposal()
      expect(await kindOf(founder.real.decideProposal({ proposalId, decision: "reject" }))).toBe(
        "ok",
      )
      expect(await kindOf(founder.real.decideProposal({ proposalId, decision: "reject" }))).toBe(
        "conflict",
      )
      expect(
        await kindOf(founder.fake.decideProposal({ proposalId: "proposal-1", decision: "reject" })),
      ).toBe("ok")
      expect(
        await kindOf(founder.fake.decideProposal({ proposalId: "proposal-1", decision: "reject" })),
      ).toBe("conflict")
    })

    it("a foreign Origin on a write is untrusted-origin, session() is null signed out", async () => {
      const foreign = harnessFetch(hq.app, cookies.founder)
      const send: typeof fetch = (input, init) =>
        foreign(input, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            origin: "https://evil.example",
          },
        })
      const real = createHqClient({ baseUrl: BASE, fetch: send })
      expect(await kindOf(real.decideProposal({ proposalId: "x", decision: "approve" }))).toBe(
        "untrusted-origin",
      )
      expect(await kindOf(real.signOut())).toBe("untrusted-origin")

      const out = await clients("signed-out")
      expect(await out.real.session()).toBeNull()
      expect(await out.fake.session()).toBeNull()
      const founder = await clients("founder")
      expect((await founder.real.session())?.email).toBe("founder@example.com")
      expect((await founder.fake.session())?.email).toBe(founder.fakeHq.state.user.email)
    })
  })
})

// hq's sign-in limiter is off in the harness (`rateLimit: false`), so these are the fake's own
// behaviours, pinned from a probe of the deployed hq: 5 sign-ins a minute, successes counted.
describe("the fake's sign-in rate limit (probed, not contract-tested)", () => {
  it("answers 429 with x-retry-after 60 and better-auth's body on the sixth sign-in", async () => {
    const fake = createFakeHq({ caller: "signed-out" })
    const signIn = () =>
      fake.fetch(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: fake.state.user.email, password: fake.state.password }),
      })
    for (let i = 0; i < 5; i++) expect((await signIn()).status).toBe(200)
    const limited = await signIn()
    expect(limited.status).toBe(429)
    expect(limited.headers.get("x-retry-after")).toBe("60")
    expect(await limited.json()).toEqual({ message: "Too many requests. Please try again later." })
  })
})
