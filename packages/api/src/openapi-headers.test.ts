import { describe, expect, it } from "vitest"
import { z } from "zod"
import { openApiDocument } from "./openapi"
import { defineOperation } from "./operation"

const info = {
  title: "Acme",
  version: "1.0.0",
  description: "Acme API",
  baseURL: "https://api.acme.test",
}

const read = defineOperation({
  name: "list_notes",
  method: "GET",
  path: "/v1/notes",
  summary: "List notes",
  description: "Lists notes.",
  permissions: { note: ["read"] },
  input: z.object({}),
  output: z.object({}),
  hints: { readOnly: true },
  handler: () => ({}),
})

const write = defineOperation({
  name: "create_note",
  method: "POST",
  path: "/v1/notes",
  summary: "Create a note",
  description: "Creates a note.",
  permissions: { note: ["create"] },
  input: z.object({ text: z.string() }),
  output: z.object({}),
  handler: () => ({}),
})

type Op = { parameters?: { name: string; in: string }[]; responses: Record<string, unknown> }

const doc = openApiDocument([read, write], info)
const ops = doc.paths["/v1/notes"] as { get: Op; post: Op }
const header = (op: Op) => op.parameters?.find((p) => p.name === "Idempotency-Key")

describe("openApiDocument headers and errors", () => {
  it("documents an optional Idempotency-Key header on non-readOnly operations only", () => {
    expect(header(ops.post)).toMatchObject({ in: "header", name: "Idempotency-Key" })
    expect(header(ops.get)).toBeUndefined()
    const key = header(ops.post) as { required?: boolean }
    expect(key.required).toBe(false)
  })

  it("documents Retry-After on 429 responses", () => {
    expect(ops.get.responses["429"]).toMatchObject({
      headers: { "Retry-After": { schema: { type: "integer" } } },
    })
  })

  it("lets the Error schema carry hint and docs", () => {
    const schema = (
      doc.components.schemas.Error as { properties: { error: { properties: object } } }
    ).properties.error.properties
    expect(Object.keys(schema)).toEqual(["code", "message", "hint", "docs"])
  })
})
