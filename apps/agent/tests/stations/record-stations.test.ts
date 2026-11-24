import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SessionAuthContext } from "eve/context"
import { FatalError } from "eve/workflow"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest"
import { log } from "#lib/log.js"
import * as attempts from "#lib/work/attempts.js"
import runAnalyst from "#tools/run_analyst.js"
import runImplementer from "#tools/run_implementer.js"
import runReviewer from "#tools/run_reviewer.js"
import { resetRecorderStats } from "#lib/work/recorder.js"
import { stampIssueIntake } from "#lib/trust.js"
import { ANALYST_OUTPUT_SCHEMA } from "#lib/stations/schemas.js"
import { CALLERS } from "../helpers.js"
import { createHqFixture, type HqFixture } from "../hq/hq-fixture.js"
import {
  detailOf,
  eventsOf,
  newItem,
  setupFix,
  toPlan,
  useRealHq,
} from "../work/attempts-support.js"

/**
 * The three station wrappers (`run_analyst`, `run_implementer`, `run_reviewer`) with their `execute`
 * bodies run as plain functions: a body is deterministic code that reads the session, calls pure
 * functions and the three steps of `lib/work/attempts.ts`, and nothing else. The stations are
 * scripted (`ctx.agent(...).send(...)` answers what the test says); hq is the real one, reached
 * through the same client a step builds from the environment.
 */

type Station = "analyst" | "implementer" | "reviewer"
const TOOLS = { analyst: runAnalyst, implementer: runImplementer, reviewer: runReviewer } as const

const ANALYSIS = {
  problem_statement: "Totals ignore tax",
  acceptance_criteria: ["Checkout totals include tax", "A refund keeps its receipt"],
}
const IMPLEMENTATION = {
  base: "main",
  branch: "agent/fix-tax",
  change_summary: [
    { path: "src/totals.ts", change: "add tax" },
    { path: "src/totals.test.ts", change: "cover it" },
  ],
  deviations: [],
  known_limitations: ["Rounding is per line"],
  pushed: true,
  verification: [{ command: "pnpm test", result: "pass" }],
}
const REVIEW = {
  blocking_findings: [],
  criteria_results: [{ criterion: "Checkout totals include tax", evidence: "diff", pass: true }],
  suggestions: [],
  summary: "Looks right.",
  verdict: "approve",
}
const OUTPUTS: Record<Station, unknown> = {
  analyst: ANALYSIS,
  implementer: IMPLEMENTATION,
  reviewer: REVIEW,
}

type Reply = () => unknown
interface Sent {
  agent: string
  message: string
  options: { outputSchema?: unknown; signal?: AbortSignal } | undefined
}

/** A workflow tool context: the session, the call, and stations that answer what the test says. */
function context(options: {
  auth: SessionAuthContext | null
  callId?: string
  sessionId?: string
  replies?: Partial<Record<Station, Reply>>
}) {
  const sent: Sent[] = []
  const abort = new AbortController()
  const ctx = {
    abortSignal: abort.signal,
    agent: (name: Station) => ({
      send: async (message: string, sendOptions?: Sent["options"]) => {
        sent.push({ agent: name, message, options: sendOptions })
        const reply = options.replies?.[name]
        return {
          result: async () =>
            reply ? reply() : { status: "completed", data: OUTPUTS[name] as unknown },
        }
      },
    }),
    callId: options.callId ?? "call-1",
    session: { auth: { current: options.auth }, id: options.sessionId ?? "wrun_station1" },
  }
  return { ctx, sent, signal: abort.signal }
}

const run = (station: Station, ctx: ReturnType<typeof context>["ctx"]): Promise<unknown> =>
  (
    TOOLS[station] as unknown as {
      execute: (input: { message: string }, ctx: unknown) => Promise<unknown>
    }
  ).execute({ message: `run ${station}` }, ctx)

let hq: HqFixture

beforeAll(async () => {
  hq = await createHqFixture()
}, 60_000)

afterAll(async () => {
  await hq.close()
})

let requests: string[]
let failStation: MockInstance

beforeEach(() => {
  resetRecorderStats()
  vi.spyOn(log, "warn").mockImplementation(() => undefined)
  failStation = vi.spyOn(attempts, "failStation") as unknown as MockInstance
  requests = useRealHq(hq).requests
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const issueAuth = (n: number) => stampIssueIntake(CALLERS.untrusted, n)

describe("the output a wrapper returns", () => {
  test("the three wrappers return exactly the output they returned before (stationOutput unchanged)", async () => {
    // One session that records (an issue item) and one that cannot (no stamp): same output both ways.
    const { n } = await newItem(hq)
    for (const auth of [issueAuth(n), null, CALLERS.summary, CALLERS.trusted]) {
      for (const station of ["analyst", "implementer", "reviewer"] as const) {
        const { ctx, sent, signal } = context({ auth, callId: `c-${station}` })
        const output = await run(station, ctx)
        expect(output).toBe(OUTPUTS[station])
        // The station is asked exactly as before: its message, its output schema, the call's signal.
        expect(sent).toHaveLength(1)
        expect(sent[0]).toMatchObject({ agent: station, message: `run ${station}` })
        expect(sent[0]?.options?.signal).toBe(signal)
        expect(sent[0]?.options?.outputSchema).toBeDefined()
      }
    }
    // The analyst's schema is the one the station always used.
    const analyst = context({ auth: null })
    await run("analyst", analyst.ctx)
    expect(analyst.sent[0]?.options?.outputSchema).toBe(ANALYST_OUTPUT_SCHEMA)
  })

  test("a failed, cancelled or empty station is the same tool error as before (stationOutput's message)", async () => {
    const failed = context({
      auth: null,
      replies: { analyst: () => ({ status: "failed", error: { message: "no structure" } }) },
    })
    await expect(run("analyst", failed.ctx)).rejects.toThrow(
      "The analyst station failed: no structure",
    )
    const cancelled = context({
      auth: null,
      replies: { implementer: () => ({ status: "cancelled" }) },
    })
    await expect(run("implementer", cancelled.ctx)).rejects.toThrow(
      "The implementer station was cancelled before it returned a result.",
    )
    const empty = context({ auth: null, replies: { reviewer: () => ({ status: "completed" }) } })
    await expect(run("reviewer", empty.ctx)).rejects.toThrow(
      "The reviewer station finished without the structured result it was asked for.",
    )
  })

  test("a session that records nothing makes no hq request at all", async () => {
    for (const auth of [null, CALLERS.summary, CALLERS.trusted, CALLERS.untrusted]) {
      for (const station of ["analyst", "implementer", "reviewer"] as const) {
        await run(station, context({ auth }).ctx)
      }
    }
    expect(requests).toEqual([])
  })
})

describe("what the wrappers record", () => {
  test("analyst, implementer and reviewer in one session leave one investigate and one fix attempt and a contract, in order", async () => {
    const { itemId, n } = await newItem(hq)
    const auth = issueAuth(n)
    const sessionId = "wrun_pipeline1"

    await run("analyst", context({ auth, sessionId, callId: "a1" }).ctx)
    let detail = await detailOf(hq, itemId)
    expect(detail.attemptList.map((a) => [a.kind, a.status, a.result])).toEqual([
      ["investigate", "finished", "investigated"],
    ])
    expect(detail.attemptList[0]?.externalRef).toBe(`${sessionId}:a1:analyst`)
    expect(detail.contract.map((c) => c.text)).toEqual([
      "Checkout totals include tax",
      "A refund keeps its receipt",
      "No new signal like this in the verification window",
    ])

    await run("implementer", context({ auth, sessionId, callId: "i1" }).ctx)
    detail = await detailOf(hq, itemId)
    const fix = detail.attemptList.find((a) => a.kind === "fix")
    expect(fix).toMatchObject({
      status: "running",
      branch: "agent/fix-tax",
      files: ["src/totals.ts", "src/totals.test.ts"],
      externalRef: `${sessionId}:i1:implementer`,
    })
    // The limit the wrapper sent is MAX_ATTEMPTS_PER_ITEM.
    expect(detail.attempts.limit).toBe(3)

    await run("reviewer", context({ auth, sessionId, callId: "r1" }).ctx)
    detail = await detailOf(hq, itemId)
    expect(detail.attemptList.map((a) => [a.kind, a.status, a.result])).toEqual([
      ["investigate", "finished", "investigated"],
      ["fix", "finished", "approved"],
    ])
    const reviewed = detail.attemptList.at(-1)
    expect(reviewed?.reviewer).toMatchObject({ verdict: "approve", summary: "Looks right." })
    // The reviewer's output carries no head sha and the wrapper invents none.
    expect(reviewed?.reviewer?.headSha).toBeUndefined()
  })

  test("a reviewer request_changes finishes the fix rejected with the blocking findings", async () => {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    const auth = issueAuth(n)
    const sessionId = "wrun_review2"
    await run("implementer", context({ auth, sessionId, callId: "i1" }).ctx)
    await run(
      "reviewer",
      context({
        auth,
        sessionId,
        callId: "r1",
        replies: {
          reviewer: () => ({
            status: "completed",
            data: {
              ...REVIEW,
              verdict: "request_changes",
              blocking_findings: ["src/totals.ts:3 drops tax on refunds"],
            },
          }),
        },
      }).ctx,
    )
    const fix = (await detailOf(hq, itemId)).attemptList.find((a) => a.kind === "fix")
    expect(fix).toMatchObject({
      status: "finished",
      result: "rejected",
      note: "src/totals.ts:3 drops tax on refunds",
    })
  })

  test("an implementer that did not push finishes the fix failed with its first limitation", async () => {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    await run(
      "implementer",
      context({
        auth: issueAuth(n),
        replies: {
          implementer: () => ({
            status: "completed",
            data: { ...IMPLEMENTATION, pushed: false, known_limitations: ["push was refused"] },
          }),
        },
      }).ctx,
    )
    const fix = (await detailOf(hq, itemId)).attemptList.find((a) => a.kind === "fix")
    expect(fix).toMatchObject({ result: "failed", note: "push was refused" })
  })

  test("running one call twice (a replay or a second eve run of it) leaves one attempt", async () => {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    const options = { auth: issueAuth(n), sessionId: "wrun_twice", callId: "i1" }
    await run("implementer", context(options).ctx)
    await run("implementer", context(options).ctx)
    const fixes = (await detailOf(hq, itemId)).attemptList.filter((a) => a.kind === "fix")
    expect(fixes).toHaveLength(1)
    expect(fixes[0]?.status).toBe("running")
  })
})

describe("a station that fails", () => {
  test("a station that throws finishes the attempt failed and rethrows the same error", async () => {
    const { itemId, n } = await newItem(hq)
    const boom = new Error("the model gave up")
    const ctx = context({
      auth: issueAuth(n),
      sessionId: "wrun_boom",
      replies: {
        analyst: () => {
          throw boom
        },
      },
    }).ctx
    await expect(run("analyst", ctx)).rejects.toBe(boom)
    const attempt = (await detailOf(hq, itemId)).attemptList[0]
    expect(attempt).toMatchObject({
      kind: "investigate",
      status: "finished",
      result: "failed",
      note: "The analyst station failed: the model gave up",
    })
    expect(failStation).toHaveBeenCalledTimes(1)
  })

  test("a station whose result is failed (stationOutput throws) finishes the attempt failed with the tool error's text", async () => {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    const ctx = context({
      auth: issueAuth(n),
      sessionId: "wrun_failed",
      replies: {
        implementer: () => ({ status: "failed", error: { message: "answered in prose" } }),
      },
    }).ctx
    await expect(run("implementer", ctx)).rejects.toThrow(
      "The implementer station failed: answered in prose",
    )
    const fix = (await detailOf(hq, itemId)).attemptList.find((a) => a.kind === "fix")
    expect(fix).toMatchObject({
      status: "finished",
      result: "failed",
      note: "The implementer station failed: answered in prose",
    })
  })

  test("a reviewer that throws ends the implementer's running fix failed, and the error is its own", async () => {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    const auth = issueAuth(n)
    await run("implementer", context({ auth, sessionId: "wrun_rv", callId: "i1" }).ctx)
    const boom = new Error("reviewer sandbox died")
    await expect(
      run(
        "reviewer",
        context({
          auth,
          sessionId: "wrun_rv",
          callId: "r1",
          replies: {
            reviewer: () => {
              throw boom
            },
          },
        }).ctx,
      ),
    ).rejects.toBe(boom)
    const fix = (await detailOf(hq, itemId)).attemptList.find((a) => a.kind === "fix")
    expect(fix).toMatchObject({ status: "finished", result: "failed" })
  })

  test("an hq that is down never changes what a failing station throws", async () => {
    const { n } = await newItem(hq)
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed")
    })
    const boom = new Error("station error")
    const ctx = context({
      auth: issueAuth(n),
      replies: {
        reviewer: () => {
          throw boom
        },
      },
    }).ctx
    await expect(run("reviewer", ctx)).rejects.toBe(boom)
  })
})

describe("the attempt limit", () => {
  async function exhausted() {
    const { itemId, n } = await newItem(hq)
    await toPlan(hq, itemId)
    await setupFix(hq, itemId, { limit: 3 })
    await setupFix(hq, itemId)
    await setupFix(hq, itemId)
    return { itemId, n }
  }

  test("an item that has used its fix attempts stops the implementer wrapper with the limit FatalError, before the station runs", async () => {
    const { itemId, n } = await exhausted()
    const before = (await detailOf(hq, itemId)).attemptList.length
    const { ctx, sent } = context({ auth: issueAuth(n), sessionId: "wrun_limit" })
    const error = await run("implementer", ctx).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FatalError)
    expect((error as Error).message).toBe(attempts.ATTEMPT_LIMIT_MESSAGE)
    expect(sent).toEqual([])
    expect((await detailOf(hq, itemId)).attemptList).toHaveLength(before)
  })

  test("the limit FatalError is never given to failStation: beginStation sits outside the try", async () => {
    const { itemId, n } = await exhausted()
    const events = (await eventsOf(hq, itemId)).length
    await expect(
      run("implementer", context({ auth: issueAuth(n), sessionId: "wrun_limit2" }).ctx),
    ).rejects.toBeInstanceOf(FatalError)
    expect(failStation).not.toHaveBeenCalled()
    // And the item holds no attempt row of this call and no new event.
    const detail = await detailOf(hq, itemId)
    expect(
      detail.attemptList.every((a) => a.externalRef?.startsWith("wrun_limit2:") !== true),
    ).toBe(true)
    expect((await eventsOf(hq, itemId)).length).toBe(events)
  })

  test("the analyst and the reviewer are not stopped by the limit", async () => {
    const { n } = await exhausted()
    const auth = issueAuth(n)
    await expect(run("analyst", context({ auth, sessionId: "wrun_limit3" }).ctx)).resolves.toBe(
      ANALYSIS,
    )
    await expect(run("reviewer", context({ auth, sessionId: "wrun_limit3" }).ctx)).resolves.toBe(
      REVIEW,
    )
  })
})

describe("no hq call in a wrapper body", () => {
  const root = join(import.meta.dirname, "../..")
  const WRAPPERS = ["run_analyst", "run_implementer", "run_reviewer"] as const
  const sourceOf = (name: string) => readFileSync(join(root, "agent/tools", `${name}.ts`), "utf8")

  /** The names a workflow body may take from `lib/work/attempts.js`: the pure ones and the steps. */
  const ALLOWED_NAMES = new Set([
    "beginStation",
    "endStation",
    "failStation",
    "stationKey",
    "subjectOf",
    "summarizeStation",
  ])
  const ALLOWED_MODULES = new Set([
    "eve/tools",
    "zod",
    "../lib/github/approval.js",
    "../lib/github/founder-response.js",
    "../lib/stations/result.js",
    "../lib/stations/schemas.js",
    "../lib/work/attempts.js",
  ])

  const importsOf = (source: string) =>
    [...source.matchAll(/(?:^|\n)import\s+([^;]*?)\s+from\s+"([^"]+)"/g)].map((m) => ({
      names: (m[1] ?? "")
        .replace(/[{}]/g, "")
        .split(",")
        .map((part) =>
          part
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0]
            ?.trim(),
        )
        .filter((part): part is string => Boolean(part)),
      specifier: m[2] ?? "",
    }))

  test.each(WRAPPERS)(
    "%s imports only what a workflow body may: no hq client, recorder, logger, env or constants",
    (name) => {
      const source = sourceOf(name)
      for (const { names, specifier } of importsOf(source)) {
        expect(ALLOWED_MODULES.has(specifier), `${name} imports ${specifier}`).toBe(true)
        if (specifier === "../lib/work/attempts.js") {
          for (const imported of names) {
            expect(ALLOWED_NAMES.has(imported), `${name} imports ${imported}`).toBe(true)
          }
        }
      }
      expect(source).not.toMatch(/lib\/hq\/|recorder|attempts-record|\/log\.js|constants\.js/)
      expect(source).not.toMatch(/HqClient|hqFromEnv|hookHq|createHqClient|recordSafely|stepHq/)
    },
  )

  test.each(WRAPPERS)(
    "%s's workflow body reads no clock, no randomness and no environment",
    (name) => {
      const source = sourceOf(name)
      const body = source.slice(source.indexOf("async execute("), source.indexOf("inputSchema"))
      expect(body).toContain('"use workflow"')
      expect(body).not.toMatch(
        /process\.|Date\.|new Date|Math\.random|crypto\.|fetch\(|agentEnv|\bhq\b|\.listWorkItems|\.startAttempt|\.finishAttempt|\.heartbeatAttempt|\.setContract|\.askQuestion|\.getWorkItem/,
      )
      // It calls the three steps and nothing that reaches hq.
      expect(body).toContain("await beginStation(")
      expect(body).toContain("await endStation(")
      expect(body).toContain("await failStation(")
    },
  )

  test.each(WRAPPERS)("%s calls beginStation outside the try that calls failStation", (name) => {
    const source = sourceOf(name)
    const begin = source.indexOf("await beginStation(")
    const open = source.indexOf("try {")
    const fail = source.indexOf("await failStation(")
    expect(begin).toBeGreaterThan(-1)
    expect(open).toBeGreaterThan(begin)
    expect(fail).toBeGreaterThan(open)
    // Exactly one try, and it opens after the begin step has settled.
    expect(source.match(/\btry\s*\{/g) ?? []).toHaveLength(1)
  })

  test("the reviewer wrapper passes no head sha: neither station's output carries one", () => {
    // The station cannot know the sha it read (REVIEWER_OUTPUT_SCHEMA has no such field), so the
    // wrapper must not make one up or pass a branch name in its place.
    expect(sourceOf("run_reviewer")).not.toMatch(/headSha/)
  })
})
