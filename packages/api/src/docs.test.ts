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

const publicNote = defineOperation({
  name: "get_public_note",
  method: "GET",
  path: "/v1/notes/:id",
  summary: "Get a public note",
  description: "Returns one note that anyone may read.",
  auth: "none",
  permissions: {},
  input: z.object({ id: z.string(), fields: z.string().optional() }),
  output: z.object({ id: z.string() }),
  hints: { readOnly: true },
  examples: [{ input: { id: "n 1", fields: "all" }, output: { id: "n 1" } }],
  handler: (input) => ({ id: input.id }),
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

  it("leaves out the request body when every input is a path parameter", () => {
    const archive = defineOperation({
      name: "archive_note",
      method: "POST",
      path: "/v1/notes/:id/archive",
      summary: "Archive a note",
      description: "Archives one note.",
      permissions: { note: ["update"] },
      input: z.object({ id: z.string() }),
      output: z.object({ id: z.string() }),
      examples: [{ input: { id: "n1" }, output: { id: "n1" } }],
      handler: (input) => ({ id: input.id }),
    })
    const archived = openApiDocument([archive], info).paths["/v1/notes/{id}/archive"] as Record<
      string,
      Record<string, unknown>
    >
    expect(archived.post?.requestBody).toBeUndefined()
  })

  it("keeps path parameters out of the body example", () => {
    const body = path.patch?.requestBody as {
      content: { "application/json": { example: Record<string, unknown> } }
    }
    expect(body.content["application/json"].example).toEqual({ body: "hi" })
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

  it("links the same docs entries in llms-full.txt, above the install snippets", () => {
    const links = { docs: [{ title: "Agent skill", url: "https://x/skill.md" }] }
    const full = llmsFullTxt(ops, info, links)
    expect(full).toContain("## Docs\n\n- [Agent skill](https://x/skill.md)\n")
    expect(full.indexOf("## Docs")).toBeLessThan(full.indexOf("## Install"))
    expect(llmsFullTxt(ops, info)).not.toContain("## Docs")
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

  it("fills each path parameter by its whole name, not a prefix of another", () => {
    const pair = defineOperation({
      name: "get_pair",
      method: "GET",
      path: "/v1/:idx/:id",
      summary: "Get a pair",
      description: "Returns a pair.",
      permissions: {},
      input: z.object({ id: z.string(), idx: z.string() }),
      output: z.object({ id: z.string() }),
      examples: [{ input: { id: "a", idx: "b" }, output: { id: "a" } }],
      handler: (input) => ({ id: input.id }),
    })
    expect(llmsFullTxt([pair], info)).toContain('curl -X GET "https://api.acme.test/v1/b/a"')
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
    const open = [getNote, updateNote, publicNote]
    const txt = llmsTxt(open, info)
    expect(txt).toContain("(`get_public_note`, no credential)")
    expect(txt).toContain(
      'Operations marked "no credential" need none (`get_public_note`); the rest do.',
    )
    expect(txt).not.toContain("Every request needs")
    expect(llmsTxt(ops, info)).not.toContain("no credential")
    const full = llmsFullTxt(open, info)
    expect(full).toContain("Credential: none. Anyone may call this.")
    expect(full).toContain("Permissions: note:update")
    // An anonymous operation's example must not send a credential.
    const anonymous = full.slice(full.indexOf("## get_public_note\n"))
    expect(anonymous).toContain('curl -X GET "https://api.acme.test/v1/notes/n%201?fields=all"')
    expect(anonymous).not.toContain("x-api-key")
    expect(llmsFullTxt(ops, info)).toContain("x-api-key")
  })

  it("tags operator operations in OpenAPI and leaves them out of llms.txt", () => {
    const operator = defineOperation({ ...updateNote, name: "ramp_note", audience: "operator" })
    const doc = openApiDocument([getNote, operator], info)
    expect(doc.paths["/v1/notes/{id}"]?.patch).toHaveProperty("x-audience", "operator")
    expect(doc.paths["/v1/notes/{id}"]?.get).not.toHaveProperty("x-audience")
    for (const txt of [
      llmsTxt([getNote, operator], info),
      llmsFullTxt([getNote, operator], info),
    ]) {
      expect(txt).toContain("get_note")
      expect(txt).not.toContain("ramp_note")
    }
  })

  it("documents a person-only operation with the session cookie as its only security", () => {
    const person = defineOperation({ ...updateNote, name: "person_note", auth: "person" })
    const doc = openApiDocument([getNote, person], info)
    const op = doc.paths["/v1/notes/{id}"]?.patch as { security: unknown[] }
    expect(op.security).toEqual([{ session: [] }])
    expect(doc.components.securitySchemes).toHaveProperty("session.in", "cookie")
    expect(openApiDocument([getNote], info).components.securitySchemes).not.toHaveProperty(
      "session",
    )
    expect(llmsTxt([person], info)).toContain("(`person_note`, web app only)")
    expect(llmsFullTxt([person], info)).toContain("Credential: a person's web app session only.")
  })

  it("documents a public operation with no security and no Idempotency-Key", () => {
    const doc = openApiDocument([publicNote], info)
    const read = doc.paths["/v1/notes/{id}"]?.get as { security: unknown[]; parameters: unknown[] }
    expect(read.security).toEqual([])
    expect(read.parameters.map((p) => (p as { name: string }).name)).not.toContain(
      "Idempotency-Key",
    )
  })
})
