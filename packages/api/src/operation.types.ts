// Type-level tests, checked by `pnpm typecheck`.
import { z } from "zod"
import { operationsFor } from "./operation"

const define = operationsFor<{ note: readonly ["read", "write"] }>()

const getNote = {
  name: "get_note",
  method: "GET",
  path: "/v1/notes/:id",
  summary: "Get a note",
  description: "Returns one note.",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: (input: { id: string }) => ({ id: input.id }),
} as const

define({ ...getNote, permissions: { note: ["write"] } })
define({ ...getNote, permissions: { note: ["write"] }, fresh: true })
// @ts-expect-error: fresh is a flag, not a string
define({ ...getNote, permissions: { note: ["write"] }, fresh: "yes" })
// @ts-expect-error: "delete" is not a note action in the catalog
define({ ...getNote, permissions: { note: ["delete"] } })
