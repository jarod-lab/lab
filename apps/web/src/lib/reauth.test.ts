// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { SessionNotFreshError } from "./account-api"
import { WebError } from "./web-auth"
import {
  checkReauthed,
  createReauthAuth,
  isSessionNotFresh,
  signInAgainPath,
  withReauth,
} from "./reauth"

const BASE = "https://app.example.com"

/** A fetch stub that answers each path from a table. */
function stubFetch(answers: Record<string, { status: number; body: unknown }>) {
  const calls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    calls.push(url.pathname)
    const answer = answers[url.pathname] ?? { status: 200, body: null }
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe("isSessionNotFresh", () => {
  it("recognises better-auth's client error, which carries the code at the top", () => {
    expect(
      isSessionNotFresh({
        status: 403,
        message: "Session is not fresh",
        code: "SESSION_NOT_FRESH",
      }),
    ).toBe(true)
  })

  it("recognises the product's raw error body, which nests the code under error", () => {
    expect(isSessionNotFresh({ error: { code: "SESSION_NOT_FRESH", message: "x" } })).toBe(true)
  })

  it("recognises the app's own errors: the typed refusal and a WebError carrying the code", () => {
    expect(isSessionNotFresh(new SessionNotFreshError(403))).toBe(true)
    expect(isSessionNotFresh(new WebError("Session is not fresh", 403, "SESSION_NOT_FRESH"))).toBe(
      true,
    )
  })

  it("is false for other refusals, other codes and non-objects", () => {
    expect(isSessionNotFresh({ code: "SESSION_EXPIRED" })).toBe(false)
    expect(isSessionNotFresh({ error: { code: "FORBIDDEN" } })).toBe(false)
    expect(isSessionNotFresh(new Error("Session is not fresh"))).toBe(false)
    expect(isSessionNotFresh("SESSION_NOT_FRESH")).toBe(false)
    expect(isSessionNotFresh(null)).toBe(false)
  })
})

describe("withReauth", () => {
  it("returns the result without asking when the call succeeds", async () => {
    const confirm = vi.fn(async () => true)
    expect(await withReauth(async () => "ok", confirm)).toBe("ok")
    expect(confirm).not.toHaveBeenCalled()
  })

  it("asks once after a refusal and retries exactly once", async () => {
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new SessionNotFreshError(403))
      .mockResolvedValueOnce("done")
    const confirm = vi.fn(async () => true)
    expect(await withReauth(action, confirm)).toBe("done")
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("does not retry when the person cancels, and rethrows the original refusal", async () => {
    const refusal = new SessionNotFreshError(403)
    const action = vi.fn(async () => {
      throw refusal
    })
    await expect(withReauth(action, async () => false)).rejects.toBe(refusal)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("does not retry a second time: a repeated refusal is thrown", async () => {
    const action = vi.fn(async () => {
      throw new SessionNotFreshError(403)
    })
    await expect(withReauth(action, async () => true)).rejects.toBeInstanceOf(SessionNotFreshError)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("passes other errors through without asking", async () => {
    const failure = new WebError("Nope", 500)
    const confirm = vi.fn(async () => true)
    await expect(
      withReauth(async () => {
        throw failure
      }, confirm),
    ).rejects.toBe(failure)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe("checkReauthed", () => {
  const before = { userId: "u1", token: "old", activeOrganizationId: null }

  it("accepts a new session for the same person", () => {
    expect(checkReauthed(before, { userId: "u1", token: "new", activeOrganizationId: null })).toBe(
      "ok",
    )
  })

  it("rejects the same token: the old cookie is still in use", () => {
    expect(checkReauthed(before, { userId: "u1", token: "old", activeOrganizationId: null })).toBe(
      "not-replaced",
    )
    expect(checkReauthed(before, null)).toBe("not-replaced")
  })

  it("rejects a session for another person (a passkey picked a different account)", () => {
    expect(checkReauthed(before, { userId: "u2", token: "new", activeOrganizationId: null })).toBe(
      "other-account",
    )
  })
})

describe("signInAgainPath", () => {
  it("sends the person to sign-in with the page they were on as next", () => {
    expect(signInAgainPath("/account/security?tab=a&b=c")).toBe(
      "/sign-in?next=%2Faccount%2Fsecurity%3Ftab%3Da%26b%3Dc",
    )
  })
})

describe("createReauthAuth", () => {
  it("reports a second factor as 'two-factor' without navigating, and leaves no session yet", async () => {
    const { fetchImpl, calls } = stubFetch({
      "/api/auth/sign-in/email": { status: 200, body: { twoFactorRedirect: true } },
    })
    const outcome = await createReauthAuth(BASE, fetchImpl).signInWithPassword(
      "ada@example.com",
      "pw",
    )
    expect(outcome).toBe("two-factor")
    expect(calls).toEqual(["/api/auth/sign-in/email"])
  })

  it("reads the session's organization, and sets one back as the active organization", async () => {
    const bodies: unknown[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (typeof init?.body === "string")
        bodies.push({ path: url.pathname, body: JSON.parse(init.body) })
      const body =
        url.pathname === "/api/auth/get-session"
          ? { user: { id: "u1" }, session: { token: "t", activeOrganizationId: "org-b" } }
          : { status: true }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch
    const auth = createReauthAuth(BASE, fetchImpl)
    expect(await auth.session()).toEqual({
      userId: "u1",
      token: "t",
      activeOrganizationId: "org-b",
    })
    await auth.setActiveOrganization("org-b")
    expect(bodies).toEqual([
      { path: "/api/auth/organization/set-active", body: { organizationId: "org-b" } },
    ])
  })

  it("reports a finished sign-in as 'done'", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/sign-in/email": { status: 200, body: { redirect: false, token: "t" } },
    })
    expect(
      await createReauthAuth(BASE, fetchImpl).signInWithPassword("ada@example.com", "pw"),
    ).toBe("done")
  })

  it("shows the server's refusal for a wrong password", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/sign-in/email": {
        status: 401,
        body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      },
    })
    await expect(
      createReauthAuth(BASE, fetchImpl).signInWithPassword("ada@example.com", "bad"),
    ).rejects.toThrow("Invalid email or password")
  })
})
