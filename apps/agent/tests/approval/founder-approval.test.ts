import { readdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, test, vi } from "vitest"
import { founderResponse } from "#lib/github/founder-response.js"
import { hqMemory } from "#lib/memory/hq.js"
import { slackConfig } from "#lib/slack/config.js"

/**
 * The trust rule: only a signed-in founder approves anything the agent asks for. Every tool that
 * can stop for a person carries the founder response policy, not eve's default ("only the person
 * whose turn requested the call"), so a founder may approve a write someone else asked for and a
 * collaborator may not approve their own. Each tool is checked through the module the agent mounts
 * (the file eve discovers under `agent/tools` and `agent/subagents/<station>/tools`, and the hq
 * memory slot's tools), not through the policy alone, and the list of tools is read from those
 * mounts: a tool that gains an `approval` later without the founder response is picked up and
 * fails here, with no list to forget to update.
 *
 * `stationPolicy` and `proposalPolicy` never ask a person (they allow or deny), so for those tools
 * the response policy is defense in depth: it holds if a request policy ever starts to ask.
 */
const FOUNDER = "slack:T0:UFOUNDER"
const OTHER_FOUNDER = "slack:T0:UOTHERFOUNDER"
const MEMBER = "slack:T0:UMEMBER"
// Phase 1: a GitHub-thread answer is never a founder's (the list holds Slack principals), so it
// is always rejected. That fails closed.
const GITHUB_COLLABORATOR = "github:583231"

afterEach(() => {
  vi.unstubAllEnvs()
})

const answer = (decision: "approve" | "deny", principalId: string, requester = FOUNDER) =>
  ({
    auth: {},
    request: {
      callId: "call_test",
      interactionId: "i",
      principal: { principalId: requester, principalType: "user", authenticator: "slack" },
      toolName: "t",
    },
    response: {
      decision,
      principal: {
        attributes: {},
        authenticator: principalId.startsWith("github:") ? "github" : "slack-webhook",
        principalId,
        principalType: "user",
      },
    },
    session: {},
  }) as never

type Responder = (ctx: never) => unknown
const responseOf = (tool: unknown): Responder => {
  const { approval } = tool as { approval?: { response?: Responder } }
  const response = approval?.response
  if (typeof response !== "function") {
    throw new Error("the tool has no response policy")
  }
  return response
}

const memoryTools = async () => {
  const tools = await hqMemory({ hq: () => ({}) as never, runId: () => undefined }).tools?.()
  if (!tools) {
    throw new Error("the hq memory slot has no tools")
  }
  return tools
}

const AGENT_DIR = join(import.meta.dirname, "../../agent")

/** The tool modules eve mounts: `agent/tools/*.ts` and `agent/subagents/<station>/tools/*.ts`. */
const mountedToolFiles = (): string[] => {
  const tsFiles = (dir: string) =>
    readdirSync(join(AGENT_DIR, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => `${dir}/${entry.name.replace(/\.ts$/, "")}`)
  const stations = readdirSync(join(AGENT_DIR, "subagents"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return tsFiles(`subagents/${entry.name}/tools`)
      } catch {
        return [] // a station with no tools of its own
      }
    })
  return [...tsFiles("tools"), ...stations].sort()
}

/** Every mounted tool that stops for a person, by the file it is mounted from, plus hq's. */
const families = async (): Promise<[string, unknown][]> => {
  const found: [string, unknown][] = []
  for (const file of mountedToolFiles()) {
    const mounted = (await import(pathToFileURL(join(AGENT_DIR, `${file}.ts`)).href)) as {
      default?: unknown
    }
    const { approval } = (mounted.default ?? {}) as { approval?: unknown }
    if (approval !== undefined) {
      found.push([file, mounted.default])
    }
  }
  found.push(["memory/hq propose_entry", (await memoryTools()).propose_entry])
  return found
}

describe("every approval tool answers to a listed founder only", async () => {
  const cases = await families()

  test("the mounted tools were found: the four shells and every tool known to ask", () => {
    // A scan that found nothing would pass everything below; these are the tools known to ask.
    expect(cases.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "tools/bash",
        "subagents/analyst/tools/bash",
        "subagents/implementer/tools/bash",
        "subagents/reviewer/tools/bash",
        "tools/run_analyst",
        "tools/run_classifier",
        "tools/run_implementer",
        "tools/run_researcher",
        "tools/run_reviewer",
        "tools/triage_work_item",
        "tools/request_bigger_model",
        "memory/hq propose_entry",
      ]),
    )
  })

  test.each(cases)(
    "%s: a listed founder is accepted, even for a request someone else made",
    async (_name, tool) => {
      vi.stubEnv("AGENT_FOUNDER_PRINCIPALS", `${FOUNDER}, ${OTHER_FOUNDER}`)
      const response = responseOf(tool)
      expect(await response(answer("approve", FOUNDER))).toEqual({ status: "allowed" })
      // A different listed founder than the one whose turn asked may approve it.
      expect(await response(answer("approve", OTHER_FOUNDER, FOUNDER))).toEqual({
        status: "allowed",
      })
      expect(await response(answer("approve", FOUNDER, MEMBER))).toEqual({ status: "allowed" })
    },
  )

  test.each(cases)(
    "%s: a non-founder is refused, whoever asked, and the request stays open",
    async (_name, tool) => {
      vi.stubEnv("AGENT_FOUNDER_PRINCIPALS", FOUNDER)
      const response = responseOf(tool)
      for (const principal of [
        MEMBER,
        "slack:T9:UFOUNDER",
        GITHUB_COLLABORATOR,
        "eve:app",
        "local-dev",
      ]) {
        expect(await response(answer("approve", principal, principal)), principal).toMatchObject({
          status: "rejected",
        })
      }
      // The requester themselves is not special either.
      expect(await response(answer("approve", MEMBER, MEMBER))).toMatchObject({
        reason: expect.stringMatching(/^Only a founder can approve/),
        status: "rejected",
      })
    },
  )

  test.each(cases)("%s: with no founders listed nobody approves", async (_name, tool) => {
    vi.stubEnv("AGENT_FOUNDER_PRINCIPALS", "")
    const response = responseOf(tool)
    expect(await response(answer("approve", FOUNDER))).toMatchObject({ status: "rejected" })
  })

  test.each(cases)("%s: anyone may dismiss, as founderOnly already allows", async (_name, tool) => {
    vi.stubEnv("AGENT_FOUNDER_PRINCIPALS", FOUNDER)
    expect(await responseOf(tool)(answer("deny", MEMBER))).toEqual({ status: "allowed" })
  })

  test("the founder response is the one shared policy, not a copy per tool", async () => {
    for (const [name, tool] of cases.filter(([n]) => n !== "tools/request_bigger_model")) {
      expect(responseOf(tool), name).toBe(founderResponse)
    }
  })
})

describe("the Slack channel's answers are founder-only too", () => {
  const auth = (principalId: string) => ({
    attributes: {},
    authenticator: "slack-webhook",
    principalId,
    principalType: "user",
  })

  test("a listed founder from an allowed workspace gets through; a member or an outsider does not", () => {
    vi.stubEnv("AGENT_FOUNDER_PRINCIPALS", FOUNDER)
    vi.stubEnv("SLACK_ALLOWED_TEAM_IDS", "T0")
    const onAnswers = (principalId: string) =>
      slackConfig.onAnswers({ defaultAuth: auth(principalId) } as never)
    expect(onAnswers(FOUNDER)).toMatchObject({ auth: { principalId: FOUNDER } })
    expect(onAnswers(MEMBER)).toBeNull()
    expect(onAnswers("slack:T9:UFOUNDER")).toBeNull()
  })
})
