import { AppError } from "@starter/errors"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  defineOperation,
  defineRegistry,
  formatPermissions,
  invoke,
  operationsFor,
  pathParams,
} from "./operation"

const caller = {
  organizationId: "org1",
  actor: { type: "user" as const, userId: "u1" },
  grants: [{ note: ["read"] }],
  via: "session",
}

const getNote = defineOperation({
  name: "get_note",
  method: "GET",
  path: "/v1/notes/:id",
  summary: "Get a note",
  description: "Returns one note.",
  permissions: { note: ["read"] },
  input: z.object({ id: z.string(), verbose: z.coerce.boolean().optional() }),
  output: z.object({ id: z.string(), owner: z.string() }),
  handler: (input, ctx) => ({ id: input.id, owner: ctx.caller.organizationId }),
})

describe("defineOperation", () => {
  it("rejects names that aren't snake_case", () => {
    expect(() => defineOperation({ ...getNote, name: "GetNote" })).toThrow(/snake_case/)
  })

  it("rejects a path param missing from the input", () => {
    expect(() => defineOperation({ ...getNote, path: "/v1/notes/:noteId" })).toThrow(/:noteId/)
  })

  it("rejects a resource with no actions", () => {
    expect(() => defineOperation({ ...getNote, permissions: { note: [] } })).toThrow(/no actions/)
  })

  it("checks permissions against a catalog when made with operationsFor", () => {
    const define = operationsFor<{ note: readonly ["read", "write"] }>()
    expect(define({ ...getNote, permissions: { note: ["write"] } }).permissions).toEqual({
      note: ["write"],
    })
    // @ts-expect-error: "delete" is not a note action in the catalog
    define({ ...getNote, permissions: { note: ["delete"] } })
  })

  it("formats permissions", () => {
    expect(formatPermissions({ a: ["x", "y"], b: ["z"] })).toBe("a:x, a:y, b:z")
    expect(formatPermissions({})).toBe("")
  })

  it("lists path params", () => {
    expect(pathParams("/v1/a/:x/b/:y_2")).toEqual(["x", "y_2"])
  })
})

describe("defineRegistry", () => {
  it("rejects duplicate names and colliding routes", () => {
    expect(() => defineRegistry([getNote, getNote])).toThrow(/Duplicate operation name/)
    const other = defineOperation({ ...getNote, name: "other", path: "/v1/notes/:id" })
    expect(() => defineRegistry([getNote, other])).toThrow(/Duplicate route/)
  })

  it("returns the operations unchanged", () => {
    const ops = [getNote] as const
    expect(defineRegistry(ops)).toBe(ops)
  })
})

describe("invoke", () => {
  it("validates input and runs the handler", async () => {
    expect(await invoke(getNote, { id: "n1", verbose: "true" }, { caller })).toEqual({
      id: "n1",
      owner: "org1",
    })
  })

  it("refuses a caller without the permission", async () => {
    const noGrants = { caller: { ...caller, grants: [{ note: ["write"] }] } }
    const err = await invoke(getNote, { id: "n1" }, noGrants).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: "FORBIDDEN", message: "Missing permission: note:read" })
  })

  it("turns invalid input into BAD_REQUEST", async () => {
    await expect(invoke(getNote, undefined, { caller })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("turns an invalid handler result into an unexposed INTERNAL error", async () => {
    const broken = defineOperation({ ...getNote, handler: () => ({ id: 1 }) as never })
    const err = await invoke(broken, { id: "n1" }, { caller }).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: "INTERNAL", expose: false })
  })
})
