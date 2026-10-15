import { describe, expect, it } from "vitest"
import { installSnippets, serverName } from "./llms"
import { DEFAULT_REGISTRY_META, SERVER_JSON_SCHEMA, serverJson } from "./server-json"

const info = {
  title: "Acme API",
  version: "1.2.0",
  description: "Acme API",
  baseURL: "https://api.acme.test",
}

describe("serverJson", () => {
  it("describes one streamable-http remote at /mcp", () => {
    expect(serverJson(info, { name: "io.github.acme/api", description: "Acme API." })).toEqual({
      $schema: SERVER_JSON_SCHEMA,
      name: "io.github.acme/api",
      title: "Acme API",
      description: "Acme API.",
      version: "1.2.0",
      websiteUrl: "https://api.acme.test/llms.txt",
      remotes: [{ type: "streamable-http", url: "https://api.acme.test/mcp" }],
    })
  })

  it("keeps the default registry meta within registry limits", () => {
    expect(DEFAULT_REGISTRY_META.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/)
    expect(DEFAULT_REGISTRY_META.description.length).toBeLessThanOrEqual(100)
    expect(serverJson(info).name).toBe(DEFAULT_REGISTRY_META.name)
  })
})

describe("install snippets", () => {
  it("slugs the title into the server name", () => {
    expect(serverName(info)).toBe("acme-api")
    expect(serverName({ ...info, title: "  --  " })).toBe("api")
  })

  it("names the MCP URL in the snippets and encodes the Cursor deeplink config", () => {
    const txt = installSnippets(info, ["signup"]).join("\n")
    expect(txt).toContain("claude mcp add --transport http acme-api https://api.acme.test/mcp")
    const link =
      /cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=acme-api&config=([^)\s]+)\)/.exec(
        txt,
      )
    expect(link).not.toBeNull()
    const config = JSON.parse(atob(decodeURIComponent(link?.[1] ?? "")))
    expect(config).toEqual({ url: "https://api.acme.test/mcp" })
  })

  it("includes the self-signup section only when signup is public", () => {
    expect(installSnippets(info).join("\n")).not.toContain("self-signup")
    expect(installSnippets(info, ["signup"]).join("\n")).toContain("/v1/signup")
  })
})
