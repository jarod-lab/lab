// CORS is for bearer surfaces only: same-origin pages and /api/auth/* never get Access-Control-Allow-Origin.
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestApp } from "./app.test.helpers"

const ORIGIN = "https://agent-client.example"

describe("CORS on bearer surfaces", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.close())

  it("answers a preflight for the REST surface with the headers an agent client needs", async () => {
    const res = await t.req("/v1/projects", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,idempotency-key,content-type",
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    const allowed = res.headers.get("access-control-allow-headers") ?? ""
    for (const header of ["authorization", "content-type", "idempotency-key", "x-api-key"]) {
      expect(allowed).toContain(header)
    }
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
    expect(res.headers.get("access-control-allow-credentials")).toBeNull()
  })

  it("exposes retry, rate-limit, request and MCP session headers on success and errors", async () => {
    const exposed = (res: Response) => res.headers.get("access-control-expose-headers") ?? ""

    const ok = await t.req("/v1/whoami", t.as(t.readKey, { headers: { origin: ORIGIN } }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get("access-control-allow-origin")).toBe("*")
    for (const header of [
      "retry-after",
      "ratelimit-limit",
      "ratelimit-remaining",
      "ratelimit-reset",
      "x-request-id",
      "mcp-session-id",
    ]) {
      expect(exposed(ok)).toContain(header)
    }
    expect(ok.headers.get("access-control-allow-credentials")).toBeNull()

    const denied = await t.req("/mcp", { method: "POST", headers: { origin: ORIGIN } })
    expect(denied.status).toBe(401)
    expect(denied.headers.get("access-control-allow-origin")).toBe("*")
    expect(exposed(denied)).toContain("www-authenticate")
  })

  it("covers the discovery and docs paths", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/openapi.json",
      "/llms.txt",
      "/llms-full.txt",
    ]) {
      const res = await t.req(path, { headers: { origin: ORIGIN } })
      expect(res.headers.get("access-control-allow-origin"), path).toBe("*")
    }
  })

  it("never adds CORS headers to /api/auth/*, even for a preflight", async () => {
    const preflight = await t.req("/api/auth/sign-in/email", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    })
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull()
    expect(preflight.headers.get("access-control-allow-headers")).toBeNull()

    const post = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-here" }),
    })
    expect(post.headers.get("access-control-allow-origin")).toBeNull()
    expect(post.headers.get("access-control-allow-credentials")).toBeNull()
  })
})
