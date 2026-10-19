// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { ADMIN_PATHS, createAdminApi } from "./admin-api"

const BASE = "https://app.example.com"

/** A fetch stub that answers every path with `body` and records each call. */
function stubFetch(body: unknown = {}, status = 200) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      search: url.search,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe("createAdminApi", () => {
  it("reads the role and the impersonator from the session", async () => {
    const { fetchImpl } = stubFetch({
      user: { id: "u1", name: "Ada", email: "ada@acme.dev", role: "admin" },
      session: { impersonatedBy: "a9" },
    })
    const api = createAdminApi(BASE, fetchImpl)
    expect(await api.getSession()).toEqual({
      userId: "u1",
      name: "Ada",
      email: "ada@acme.dev",
      role: "admin",
      impersonatedBy: "a9",
    })
  })

  it("answers null when signed out", async () => {
    const { fetchImpl } = stubFetch(null)
    expect(await createAdminApi(BASE, fetchImpl).getSession()).toBeNull()
  })

  it("lists users by email, with limit and offset", async () => {
    const { calls, fetchImpl } = stubFetch({
      users: [
        {
          id: "u2",
          name: "Grace",
          email: "grace@acme.dev",
          emailVerified: true,
          role: "user",
          banned: true,
          banReason: "Spam",
          banExpires: null,
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      total: 51,
    })
    const page = await createAdminApi(BASE, fetchImpl).listUsers({
      search: "grace",
      offset: 50,
      limit: 50,
    })
    expect(page.total).toBe(51)
    expect(page.users[0]).toMatchObject({ id: "u2", banned: true, banReason: "Spam" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe("GET")
    expect(calls[0]?.path).toBe(ADMIN_PATHS.listUsers)
    const query = new URLSearchParams(calls[0]?.search)
    expect(query.get("searchValue")).toBe("grace")
    expect(query.get("searchField")).toBe("email")
    expect(query.get("searchOperator")).toBe("contains")
    expect(query.get("offset")).toBe("50")
    expect(query.get("limit")).toBe("50")
  })

  it("sends no search value when the box is empty", async () => {
    const { calls, fetchImpl } = stubFetch({ users: [], total: 0 })
    await createAdminApi(BASE, fetchImpl).listUsers({ search: "", offset: 0, limit: 50 })
    expect(new URLSearchParams(calls[0]?.search).has("searchValue")).toBe(false)
  })

  it("bans with a reason and the expiry in seconds", async () => {
    const { calls, fetchImpl } = stubFetch({ user: {} })
    await createAdminApi(BASE, fetchImpl).banUser({
      userId: "u2",
      reason: "Spam",
      expiresInSeconds: 86400,
    })
    expect(calls).toEqual([
      {
        method: "POST",
        path: ADMIN_PATHS.banUser,
        search: "",
        body: { userId: "u2", banReason: "Spam", banExpiresIn: 86400 },
      },
    ])
  })

  it("bans permanently with no expiry and no reason", async () => {
    const { calls, fetchImpl } = stubFetch({ user: {} })
    await createAdminApi(BASE, fetchImpl).banUser({ userId: "u2" })
    expect(calls[0]?.body).toEqual({ userId: "u2" })
  })

  it("calls each user action on its own path", async () => {
    const { calls, fetchImpl } = stubFetch({ status: true })
    const api = createAdminApi(BASE, fetchImpl)
    await api.unbanUser("u2")
    await api.impersonateUser("u2")
    await api.stopImpersonating()
    await api.revokeUserSessions("u2")
    await api.setRole({ userId: "u2", role: "admin" })
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ["POST", ADMIN_PATHS.unbanUser, { userId: "u2" }],
      ["POST", ADMIN_PATHS.impersonateUser, { userId: "u2" }],
      ["POST", ADMIN_PATHS.stopImpersonating, {}],
      ["POST", ADMIN_PATHS.revokeUserSessions, { userId: "u2" }],
      ["POST", ADMIN_PATHS.setRole, { userId: "u2", role: "admin" }],
    ])
  })

  it("keeps the server's refusal code", async () => {
    const { fetchImpl } = stubFetch(
      { code: "YOU_CANNOT_IMPERSONATE_ADMINS", message: "You cannot impersonate admins" },
      403,
    )
    await expect(createAdminApi(BASE, fetchImpl).impersonateUser("u9")).rejects.toMatchObject({
      message: "You cannot impersonate admins",
      status: 403,
      code: "YOU_CANNOT_IMPERSONATE_ADMINS",
    })
  })
})
