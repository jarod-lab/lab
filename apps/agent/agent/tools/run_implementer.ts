import { defineWorkflowTool } from "eve/tools"
import { z } from "zod"
import { stationPolicy } from "../lib/github/approval.js"
import { founderApproval } from "../lib/github/founder-response.js"
import { stationOutput } from "../lib/stations/result.js"
import { IMPLEMENTER_OUTPUT_SCHEMA } from "../lib/stations/schemas.js"
import {
  beginStation,
  endStation,
  failStation,
  subjectOf,
  summarizeStation,
} from "../lib/work/attempts.js"

/**
 * Blocking wrapper the orchestrator calls to run the `implementer` station.
 *
 * @remarks
 * Attaches the output schema per call, and throws when the station fails,
 * is cancelled, or returns no data (`stationOutput` in
 * `agent/lib/stations/result.ts`), so the orchestrator sees a tool error
 * instead of an empty result. Named `run_implementer`, not `implementer`:
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
    "Execute an approved implementation plan in a checkout of the factory repository: " +
    "write the code on a feature branch, run the repository's own checks, commit, and " +
    "push the branch. Returns the branch name, per-file change summary, verification " +
    "results, and deviations. The caller passes the work item, classification, and full " +
    "analysis in the message, plus an artifact id when the analyst saved its full detail " +
    "as one; on a revision run it also passes the existing branch and the reviewer's " +
    "findings.",
  async execute({ message }, ctx) {
    "use workflow"
    // Recording is three steps and pure functions of `lib/work/attempts.ts`; the body calls nothing else.
    // beginStation sits OUTSIDE the try: its attempt-limit FatalError must reach the orchestrator
    // as it is, never be recorded as this station failing.
    const record = await beginStation({
      callId: ctx.callId,
      sessionId: ctx.session.id,
      station: "implementer",
      subject: subjectOf(ctx.session.auth.current),
    })
    let output: unknown
    try {
      const response = await ctx.agent("implementer").send(message, {
        outputSchema: IMPLEMENTER_OUTPUT_SCHEMA,
        signal: ctx.abortSignal,
      })
      output = stationOutput("implementer", await response.result())
    } catch (error) {
      await failStation(record, error instanceof Error ? error.message : String(error))
      throw error
    }
    await endStation(record, summarizeStation("implementer", output))
    return output
  },
  inputSchema: z.object({
    message: z
      .string()
      .describe("Everything the station needs; it does not see your conversation history."),
  }),
})
