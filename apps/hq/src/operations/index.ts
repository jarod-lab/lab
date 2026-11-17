import { defineRegistry, operationsFor } from "@lab/api"
import type { Catalog } from "@lab/auth"
import type { Database } from "@lab/db"
import { z } from "zod"

/** hq's version: reported by `hq_status`, the OpenAPI document and the MCP server. */
export const HQ_VERSION = "0.0.0"

/** What the operations draw on. `hq_status` needs none of it; the brain's operations do. */
export interface HqDeps {
  db: Database
  now: () => Date
}

const defineOperation = operationsFor<Catalog>()

const hq_status = defineOperation({
  name: "hq_status",
  method: "GET",
  path: "/v1/status",
  summary: "Check that hq answers for this credential",
  description:
    "Returns { ok: true } and hq's version when the credential may read the brain. Call it first " +
    "to check a credential against hq.",
  permissions: { hq_entry: ["read"] },
  input: z.object({}),
  output: z.object({
    ok: z.literal(true),
    version: z.string().describe("hq's version"),
  }),
  hints: { readOnly: true },
  examples: [{ input: {}, output: { ok: true, version: "0.0.0" } }],
  handler: () => ({ ok: true as const, version: HQ_VERSION }),
})

/** Every operation hq serves: one registry for REST, MCP, OpenAPI and llms.txt. */
export function createHqOperations(_deps: HqDeps) {
  return defineRegistry([hq_status])
}
