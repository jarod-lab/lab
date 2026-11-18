import { afterEach, describe, expect, test, vi } from "vitest"
import { founderResponse } from "#lib/github/founder-response.js"
import { bashTool } from "#lib/github/tools.js"
import { hqMemory } from "#lib/memory/hq.js"
import { slackConfig } from "#lib/slack/config.js"
import requestBiggerModel from "../../agent/tools/request_bigger_model.js"
import runAnalyst from "../../agent/tools/run_analyst.js"
import runClassifier from "../../agent/tools/run_classifier.js"
import runImplementer from "../../agent/tools/run_implementer.js"
import runResearcher from "../../agent/tools/run_researcher.js"
import runReviewer from "../../agent/tools/run_reviewer.js"
import triageWorkItem from "../../agent/tools/triage_work_item.js"

/**
 * The trust rule: only a signed-in founder approves anything the agent asks for. Every tool that
 * can stop for a person carries the founder response policy, not eve's default ("only the person
 * whose turn requested the call"), so a founder may approve a write someone else asked for and a
 * collaborator may not approve their own. Each family is checked through the tool object the agent
 * mounts, not through the policy alone.
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

const families = async (): Promise<[string, unknown][]> => [
  ["bash (orchestrator)", bashTool({ environment: {} as never, role: "orchestrator" })],
  ["bash (implementer)", bashTool({ environment: {} as never, role: "implementer" })],
  ["bash (reader)", bashTool({ environment: {} as never, role: "reader" })],
  ["run_analyst", runAnalyst],
  ["run_classifier", runClassifier],
  ["run_implementer", runImplementer],
  ["run_researcher", runResearcher],
  ["run_reviewer", runReviewer],
  ["propose_entry", (await memoryTools()).propose_entry],
  ["triage_work_item", triageWorkItem],
  ["request_bigger_model", requestBiggerModel],
]

describe("every approval tool answers to a listed founder only", async () => {
  const cases = await families()

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
    for (const [name, tool] of cases.filter(([n]) => n !== "request_bigger_model")) {
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
