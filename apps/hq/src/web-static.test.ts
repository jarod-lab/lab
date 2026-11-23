import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { OUTPUT_CONFIG } from "../scripts/build-vercel.mjs"
import { createWebApp } from "./web-static"

const SHELL = "<!doctype html><div id=root></div>"
let dir = ""

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hq-web-"))
  mkdirSync(join(dir, "assets"))
  writeFileSync(join(dir, "index.html"), SHELL)
  writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log(1)")
  writeFileSync(join(dir, "assets", "index-abc123.css"), "a{}")
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const app = () => {
  const web = createWebApp({ dir })
  if (!web) throw new Error("expected a web app")
  return web
}
const routeHeaders = (index: number) => OUTPUT_CONFIG.routes[index]?.headers ?? {}

describe("createWebApp", () => {
  it("serves the shell for the same paths the Build Output route does (one table)", async () => {
    const route = OUTPUT_CONFIG.routes.find((r) => r.dest === "/app/index.html")
    const shell = new RegExp(route?.src ?? "")
    const paths = [
      "/app",
      "/app/",
      "/app/digest",
      "/app/approvals/",
      "/app/a/b/c",
      "/app/assets/x.js",
      "/app/assets/",
      "/application",
      "/admin/proposals",
      "/v1/status",
    ]
    for (const path of paths) {
      const res = await app().request(path)
      if (shell.test(path)) {
        expect(res.status, path).toBe(200)
        expect(res.headers.get("content-type"), path).toContain("text/html")
        expect(res.headers.get("cache-control"), path).toBe("no-store")
        expect(await res.text(), path).toBe(SHELL)
      } else if (path.startsWith("/app/assets/")) {
        expect(res.status, path).toBe(404)
      } else {
        expect(res.status, path).toBe(404)
        expect(await res.text(), path).not.toBe(SHELL)
      }
    }
  })

  it("serves a hashed asset with immutable caching and an unknown asset as 404, not the shell", async () => {
    const js = await app().request("/app/assets/index-abc123.js")
    expect(js.status).toBe(200)
    expect(js.headers.get("cache-control")).toBe(routeHeaders(1)["cache-control"])
    expect(js.headers.get("content-type")).toContain("javascript")
    expect(await js.text()).toBe("console.log(1)")
    const css = await app().request("/app/assets/index-abc123.css")
    expect(css.headers.get("content-type")).toContain("text/css")

    const missing = await app().request("/app/assets/missing.js")
    expect(missing.status).toBe(404)
    expect(missing.headers.get("cache-control")).toBe("no-store")
    expect(await missing.text()).not.toBe(SHELL)
  })

  it("carries the same four security headers as config.json", async () => {
    const expected = routeHeaders(0)
    expect(Object.keys(expected)).toHaveLength(4)
    for (const path of ["/app/digest", "/app/assets/index-abc123.js", "/app/assets/missing.js"]) {
      const res = await app().request(path)
      for (const [name, value] of Object.entries(expected)) {
        expect(res.headers.get(name), `${path} ${name}`).toBe(value)
      }
    }
  })

  it("returns null without an index.html", () => {
    expect(createWebApp({ dir: join(dir, "assets") })).toBeNull()
    expect(createWebApp({ dir: join(dir, "nope") })).toBeNull()
  })

  it("never serves a path outside dir", async () => {
    writeFileSync(join(dir, "..", "hq-web-secret.txt"), "secret")
    try {
      for (const path of [
        "/app/../src/server.ts",
        "/app/%2e%2e/package.json",
        "/app/assets/..%2f..%2fhq-web-secret.txt",
        "/app/assets/%2e%2e/%2e%2e/hq-web-secret.txt",
        "/app/assets/..%5c..%5chq-web-secret.txt",
      ]) {
        const res = await app().request(path)
        expect(await res.text(), path).not.toContain("secret")
        expect(res.status, path).toBe(404)
      }
    } finally {
      rmSync(join(dir, "..", "hq-web-secret.txt"), { force: true })
    }
  })

  it("answers only GET and HEAD", async () => {
    expect((await app().request("/app/digest", { method: "POST" })).status).toBe(404)
    expect((await app().request("/app/digest", { method: "HEAD" })).status).toBe(200)
  })
})
