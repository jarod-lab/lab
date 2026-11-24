import { defineWorkflowTool } from "eve/tools"
import { z } from "zod"
import { stationPolicy } from "../lib/github/approval.js"
import { founderApproval } from "../lib/github/founder-response.js"
import { stationOutput } from "../lib/stations/result.js"
import { REVIEWER_OUTPUT_SCHEMA } from "../lib/stations/schemas.js"
import {
  beginStation,
  endStation,
  failStation,
  subjectOf,
  summarizeStation,
} from "../lib/work/attempts.js"

/**
 * Blocking wrapper the orchestrator calls to run the `reviewer` station.
 *
 * @remarks
 * Attaches the output schema per call, and throws when the station fails,
 * is cancelled, or returns no data (`stationOutput` in
 * `agent/lib/stations/result.ts`), so the orchestrator sees a tool error
 * instead of an empty result. Named `run_reviewer`, not `reviewer`:
 * the compiler rejects a tool and a local subagent with the same public
 * name.
 *
 * The body also records the run as an attempt of the session's work item: `beginStation` before the
 * station, then `endStation` with what it produced or `failStation` with why it threw, which is
 * rethrown unchanged. They are steps (`lib/work/attempts.ts`) and the body calls nothing else;
 * the station's output is returned exactly as before.
 */
export default defineWorkflowTool({
  approval: founderApproval(stationPolicy),
  description:
    "Independently review a pushed factory branch against the original work item and its " +
    "acceptance criteria: fetch the branch, read the real diff, re-run cheap checks, and " +
    "return approve, request_changes, or reject with specific findings. Never modifies " +
    "code. The caller passes the work item, the analysis with acceptance criteria, the " +
    "branch name, and the implementer's report in the message, plus an artifact id when " +
    "the analyst saved its full detail as one.",
  async execute({ message }, ctx) {
    "use workflow"
    // Recording is three steps and pure functions of `lib/work/attempts.ts`; the body calls nothing else.
    // beginStation sits OUTSIDE the try: its attempt-limit FatalError must reach the orchestrator
    // as it is, never be recorded as this station failing.
    const record = await beginStation({
      callId: ctx.callId,
      sessionId: ctx.session.id,
      station: "reviewer",
      subject: subjectOf(ctx.session.auth.current),
    })
    let output: unknown
    try {
      const response = await ctx.agent("reviewer").send(message, {
        outputSchema: REVIEWER_OUTPUT_SCHEMA,
        signal: ctx.abortSignal,
      })
      output = stationOutput("reviewer", await response.result())
    } catch (error) {
      await failStation(record, error instanceof Error ? error.message : String(error))
      throw error
    }
    await endStation(record, summarizeStation("reviewer", output))
    return output
  },
  inputSchema: z.object({
    message: z
      .string()
      .describe("Everything the station needs; it does not see your conversation history."),
  }),
})
