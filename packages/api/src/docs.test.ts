import { describe, expect, it } from "vitest"
import { z } from "zod"
import { llmsFullTxt, llmsTxt } from "./llms"
import { openApiDocument, openApiPath } from "./openapi"
import { defineOperation } from "./operation"

const info = {
  title: "Acme",
  version: "1.0.0",
  description: "Acme API",
  baseURL: "https://api.acme.test",
  oauth: {
    authorizationUrl: "https://api.acme.test/api/auth/oauth2/authorize",
    tokenUrl: "https://api.acme.test/api/auth/oauth2/token",
    scopes: { read: "Read", write: "Write" },
    scopesFor: (p: Record<string, readonly string[]>) =>
      p.note?.includes("update") ? ["write"] : ["read", "write"],
  },
}

const getNote = defineOperation({
  name: "get_note",
  method: "GET",
  path: "/v1/notes/:id",
  summary: "Get a note",
  description: "Returns one note by id.",
  permissions: { note: ["read"] },
  input: z.object({ id: z.string(), fields: z.string().optional() }),
  output: z.object({ id: z.string() }),
  hints: { readOnly: true },
  examples: [{ input: { id: "n 1", fields: "all" }, output: { id: "n 1" } }],
  handler: (input) => ({ id: input.id }),
})

const updateNote = defineOperation({
  name: "update_note",
  method: "PATCH",
  path: "/v1/notes/:id",
  summary: "Update a note",
  description: "Changes a note's body.",
  permissions: { note: ["update"] },
  input: z.object({ id: z.string(), body: z.string() }),
  output: z.object({ id: z.string() }),
  examples: [{ input: { id: "n1", body: "hi" }, error: "NOT_FOUND" }],
  handler: (input) => ({ id: input.id }),
})

const ping = defineOperation({
  name: "ping",
  method: "GET",
  path: "/v1/ping",
  summary: "Ping",
  description: "Health check for agents.",
  permissions: {},
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
})

const ops = [getNote, updateNote, ping]

describe("openApiDocument", () => {
  const doc = openApiDocument(ops, info)
  const path = doc.paths["/v1/notes/{id}"] as Record<string, Record<string, unknown>>

  it("converts paths and merges methods on one path", () => {
    expect(openApiPath("/v1/notes/:id")).toBe("/v1/notes/{id}")
    expect(Object.keys(path)).toEqual(["get", "patch"])
  })

  it("puts GET input in path and query parameters", () => {
    expect(path.get?.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "fields", in: "query", required: false, schema: { type: "string" } },
    ])
    expect(path.get?.["x-agent-hints"]).toEqual({ readOnly: true })
    expect(path.get?.["x-required-permissions"]).toEqual(["note:read"])
    expect(path.get?.security).toEqual([
      { apiKey: [] },
      { bearer: [] },
      { oauth2: ["read"] },
      { oauth2: ["write"] },
    ])
    expect(path.patch?.security).toContainEqual({ oauth2: ["write"] })
  })

  it("puts non-path input in the JSON body", () => {
    const body = path.patch?.requestBody as {
      content: { "application/json": { schema: { properties: object; required: string[] } } }
    }
    const json = body.content["application/json"]
    expect(Object.keys(json.schema.properties)).toEqual(["body"])
    expect(json.schema.required).toEqual(["body"])
  })

  it("declares the auth schemes, oauth only when configured", () => {
    expect(Object.keys(doc.components.securitySchemes)).toEqual(["apiKey", "bearer", "oauth2"])
    const noOauth = openApiDocument(ops, { ...info, oauth: undefined })
    expect(Object.keys(noOauth.components.securitySchemes)).toEqual(["apiKey", "bearer"])
    const ping = noOauth.paths["/v1/ping"] as Record<string, { security: object[] }>
    expect(ping.get?.security).toEqual([{ apiKey: [] }, { bearer: [] }])
    const openPing = doc.paths["/v1/ping"] as Record<string, { security: object[] }>
    expect(openPing.get?.security).toContainEqual({ oauth2: [] })
  })
})

describe("llms.txt", () => {
  it("indexes every operation and the machine-readable docs", () => {
    const txt = llmsTxt(ops, info, {
      docs: [{ title: "Skill", url: "https://x/skill", note: "n" }],
    })
    expect(txt).toMatch(/^# Acme\n\n> Acme API/)
    expect(txt).toContain("- `GET /v1/notes/:id` (`get_note`): Get a note")
    expect(txt).toContain("(https://api.acme.test/openapi.json)")
    expect(txt).toContain("- [Skill](https://x/skill): n")
    expect(llmsTxt(ops, info)).not.toContain("Skill")
  })

  it("renders the full reference with schemas and curl examples", () => {
    const full = llmsFullTxt(ops, info)
    expect(full).toContain("## update_note")
    expect(full).toContain('curl -X GET "https://api.acme.test/v1/notes/n%201?fields=all"')
    expect(full).toContain(`-d '{"body":"hi"}'`)
    expect(full).toContain("Fails with `NOT_FOUND`.")
    expect(full).toContain("Permissions: none (any authenticated caller)")
    expect(full).toContain("Permissions: note:update")
    expect(full).toContain('"id": "n 1"')
  })

  it("carries install snippets for each client in both files and the root", () => {
    for (const txt of [llmsTxt(ops, info), llmsFullTxt(ops, info)]) {
      expect(txt).toContain("## Install")
      expect(txt).toContain("claude mcp add --transport http acme https://api.acme.test/mcp")
      expect(txt).toContain("cursor://anysphere.cursor-deeplink/mcp/install?name=acme&config=")
      expect(txt).toContain("code --add-mcp")
      expect(txt).toContain("[mcp_servers.acme]")
      expect(txt).toContain(`"mcpServers"`)
      expect(txt).toContain("urn:ietf:params:oauth:grant-type:device_code")
      expect(txt).toContain("https://api.acme.test/api/auth/device/code")
    }
  })

  it("marks the operations that need no credential, and says so in the intro", () => {
    const unauth = { unauthenticated: ["ping"] }
    const txt = llmsTxt(ops, info, unauth)
    expect(txt).toContain("(`ping`, no credential)")
    expect(txt).toContain('Operations marked "no credential" need none (`ping`); the rest do.')
    expect(txt).not.toContain("Every request needs")
    expect(llmsTxt(ops, info)).not.toContain("no credential")
    expect(llmsFullTxt(ops, info, unauth)).toContain("Credential: none. Anyone may call this.")
    expect(llmsFullTxt(ops, info, unauth)).toContain("Permissions: note:update")
  })
})
