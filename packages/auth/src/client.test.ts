import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createClient, personalSlug } from "./client"

const importsOf = (file: string) =>
  [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/from "([^"]+)"/g)].map(
    (m) => m[1],
  )

describe("createClient", () => {
  it("creates a typed auth client", () => {
    const client = createClient("http://localhost:3000")
    expect(typeof client.signIn.email).toBe("function")
    expect(typeof client.organization.inviteMember).toBe("function")
  })

  it("calls the public sign-in methods endpoint without a session", async () => {
    const calls: string[] = []
    const client = createClient("http://localhost:3000", {
      customFetchImpl: async (url) => {
        calls.push(url instanceof Request ? url.url : String(url))
        return new Response(JSON.stringify({ password: true, social: ["github"] }), {
          headers: { "content-type": "application/json" },
        })
      },
    })
    const res = await client.signInMethods()
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ password: true, social: ["github"] })
    expect(calls).toEqual(["http://localhost:3000/api/auth/sign-in-methods"])
  })

  it("calls the notifications endpoints with their methods", async () => {
    const calls: string[] = []
    const client = createClient("http://localhost:3000", {
      customFetchImpl: async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url instanceof Request ? url.url : String(url)}`)
        return new Response("{}", { headers: { "content-type": "application/json" } })
      },
    })
    await client.inbox.list({ query: { filter: "unread" } })
    await client.inbox.unreadCount()
    await client.inbox.markRead({ id: "n1" })
    await client.inbox.markAllRead({})
    expect(calls).toEqual([
      "GET http://localhost:3000/api/auth/inbox/list?filter=unread",
      "GET http://localhost:3000/api/auth/inbox/unread-count",
      "POST http://localhost:3000/api/auth/inbox/mark-read",
      "POST http://localhost:3000/api/auth/inbox/mark-all-read",
    ])
  })

  it("re-exports the personal organization slug rule", () => {
    expect(personalSlug("u1")).toBe("personal-u1")
  })

  // The client ships to browsers: no server code (@starter/api, the DB, ./permissions) may reach it.
  it("imports only browser-safe modules", () => {
    const browserSafe =
      /^(better-auth\/client(\/plugins)?|better-auth\/plugins\/(organization\/)?access|@better-auth\/oauth-provider\/client|@better-auth\/passkey\/client|@better-auth\/sso\/client|@better-auth\/stripe\/client|@wraps\.dev\/better-auth\/client|@byo-oss\/notifications\/client|\.\/access|\.\/reserved-slugs|\.\/constants|\.\/membership|\.\/sign-in-methods-shared)$/
    const imports = [...importsOf("./client.ts"), ...importsOf("./access.ts")]
    expect(imports.filter((i) => !browserSafe.test(i ?? ""))).toEqual([])
  })
})
