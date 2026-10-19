// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import {
  AccountError,
  SessionNotFreshError,
  accountErrorMessage,
  createAccountApi,
  totpSecretOf,
} from "./account-api"
import { isSessionNotFresh } from "./reauth"

const BASE = "https://app.example.com"

/** A fetch stub that answers each path from a table, and records what it was asked. */
function stubFetch(answers: Record<string, { status: number; body: unknown }>) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    })
    const answer = answers[url.pathname] ?? { status: 200, body: null }
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe("createAccountApi", () => {
  it("reads the profile from the session, with the current session's token", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/get-session": {
        status: 200,
        body: {
          user: { id: "u1", name: "Jordan Lee", email: "j@acme.dev", emailVerified: true },
          session: { token: "tok-now" },
        },
      },
    })
    const api = createAccountApi(BASE, fetchImpl)
    expect(await api.getProfile()).toEqual({
      id: "u1",
      name: "Jordan Lee",
      email: "j@acme.dev",
      emailVerified: true,
      image: null,
      currentSessionToken: "tok-now",
    })
  })

  it("lists sessions with how each was signed in, marking this browser's", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/get-session": {
        status: 200,
        body: { user: { id: "u1" }, session: { token: "tok-now" } },
      },
      "/api/auth/list-sessions": {
        status: 200,
        body: [
          {
            id: "s1",
            token: "tok-now",
            userAgent: "Firefox",
            createdAt: "2026-10-01T00:00:00.000Z",
            loginMethod: "passkey",
            loginTwoFactor: false,
          },
          { id: "s2", token: "tok-old", createdAt: "2026-09-01T00:00:00.000Z" },
        ],
      },
    })
    const api = createAccountApi(BASE, fetchImpl)
    const sessions = await api.listSessions()
    expect(sessions).toMatchObject([
      { token: "tok-now", userAgent: "Firefox", loginMethod: "passkey", loginTwoFactor: false },
      { token: "tok-old", userAgent: null, loginMethod: null, loginTwoFactor: false },
    ])
    expect(sessions.map((session) => session.current)).toEqual([true, false])
  })

  it("sends the new name to update-user", async () => {
    const { calls, fetchImpl } = stubFetch({
      "/api/auth/update-user": { status: 200, body: { status: true } },
    })
    const api = createAccountApi(BASE, fetchImpl)
    await api.updateName("Jordan")
    expect(calls).toEqual([
      { method: "POST", path: "/api/auth/update-user", body: { name: "Jordan" } },
    ])
  })

  it("keeps the server's error code on a refusal", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/unlink-account": {
        status: 400,
        body: { code: "LAST_SIGN_IN_METHOD", message: "This is your only way to sign in." },
      },
    })
    const api = createAccountApi(BASE, fetchImpl)
    const caught = await api.unlinkAccount("acc-1").catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(AccountError)
    expect((caught as AccountError).code).toBe("LAST_SIGN_IN_METHOD")
    expect(accountErrorMessage(caught)).toBe("You can't disconnect your last way to sign in.")
  })

  it("reads the secret out of the setup URI", () => {
    expect(
      totpSecretOf(
        "otpauth://totp/Starter:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Starter",
      ),
    ).toBe("JBSWY3DPEHPK3PXP")
    expect(totpSecretOf("not a uri")).toBe("")
  })
})

describe("createAccountApi: the call each method makes", () => {
  // Every method is checked against the server path and HTTP method it must hit (better-auth's routes,
  // and the security summary's). A call with no body that went out as GET would pass a looser test.
  const SESSION = {
    user: { id: "u1", name: "Ada", email: "ada@example.com", emailVerified: true },
    session: { token: "tok-now" },
  }
  const cases: [
    string,
    (api: ReturnType<typeof createAccountApi>) => Promise<unknown>,
    string,
    string,
  ][] = [
    ["getProfile", (api) => api.getProfile(), "GET", "/api/auth/get-session"],
    ["updateName", (api) => api.updateName("Ada"), "POST", "/api/auth/update-user"],
    [
      "changeEmail",
      (api) => api.changeEmail("b@example.com", "/account/profile"),
      "POST",
      "/api/auth/change-email",
    ],
    [
      "requestAccountDeletion",
      (api) => api.requestAccountDeletion("/account/profile"),
      "POST",
      "/api/auth/delete-user",
    ],
    ["listAccounts", (api) => api.listAccounts(), "GET", "/api/auth/list-accounts"],
    [
      "linkSocial",
      (api) => api.linkSocial("github", "/account/security"),
      "POST",
      "/api/auth/link-social",
    ],
    ["unlinkAccount", (api) => api.unlinkAccount("acc-1"), "POST", "/api/auth/unlink-account"],
    ["listPasskeys", (api) => api.listPasskeys(), "GET", "/api/auth/passkey/list-user-passkeys"],
    [
      "renamePasskey",
      (api) => api.renamePasskey("pk-1", "Phone"),
      "POST",
      "/api/auth/passkey/update-passkey",
    ],
    [
      "deletePasskey",
      (api) => api.deletePasskey("pk-1"),
      "POST",
      "/api/auth/passkey/delete-passkey",
    ],
    ["listSessions", (api) => api.listSessions(), "GET", "/api/auth/list-sessions"],
    ["revokeSession", (api) => api.revokeSession("t-2"), "POST", "/api/auth/revoke-session"],
    [
      "revokeOtherSessions",
      (api) => api.revokeOtherSessions(),
      "POST",
      "/api/auth/revoke-other-sessions",
    ],
    ["securitySummary", (api) => api.securitySummary(), "GET", "/api/auth/security/summary"],
    ["enableTwoFactor", (api) => api.enableTwoFactor("pw"), "POST", "/api/auth/two-factor/enable"],
    [
      "confirmTwoFactor",
      (api) => api.confirmTwoFactor("123456"),
      "POST",
      "/api/auth/two-factor/verify-totp",
    ],
    [
      "disableTwoFactor",
      (api) => api.disableTwoFactor("pw"),
      "POST",
      "/api/auth/two-factor/disable",
    ],
    [
      "newBackupCodes",
      (api) => api.newBackupCodes("pw"),
      "POST",
      "/api/auth/two-factor/generate-backup-codes",
    ],
    [
      "changePassword",
      (api) =>
        api.changePassword({ currentPassword: "a", newPassword: "b", revokeOtherSessions: false }),
      "POST",
      "/api/auth/change-password",
    ],
    [
      "completeSignInWithCode",
      (api) => api.completeSignInWithCode("123456"),
      "POST",
      "/api/auth/two-factor/verify-totp",
    ],
    [
      "completeSignInWithBackupCode",
      (api) => api.completeSignInWithBackupCode("aaaa-1111"),
      "POST",
      "/api/auth/two-factor/verify-backup-code",
    ],
  ]

  it.each(cases)("%s sends %s to %s", async (_name, call, method, path) => {
    const { calls, fetchImpl } = stubFetch({
      "/api/auth/get-session": { status: 200, body: SESSION },
      "/api/auth/two-factor/enable": {
        status: 200,
        body: { method: "totp", totpURI: "otpauth://totp/x?secret=A", backupCodes: [] },
      },
      "/api/auth/two-factor/generate-backup-codes": { status: 200, body: { backupCodes: ["x"] } },
      "/api/auth/passkey/list-user-passkeys": { status: 200, body: [] },
      "/api/auth/list-sessions": { status: 200, body: [] },
      "/api/auth/list-accounts": { status: 200, body: [] },
      "/api/auth/security/summary": {
        status: 200,
        body: {
          passwordChangedAt: null,
          twoFactorEnabled: false,
          twoFactorEnabledAt: null,
          backupCodesRemaining: null,
        },
      },
    })
    await call(createAccountApi(BASE, fetchImpl))
    const hit = calls.find((call) => call.path === path)
    expect(hit, `no call to ${path}`).toBeDefined()
    expect(hit?.method).toBe(method)
  })
})

describe("accountErrorMessage", () => {
  it("shows the breached-password copy exactly", () => {
    const error = new AccountError("raw", 400, "PASSWORD_COMPROMISED")
    expect(accountErrorMessage(error)).toBe(
      "This password has shown up in a known data breach. Choose a different one.",
    )
  })

  it("asks for a recent sign-in when the session is too old", () => {
    expect(accountErrorMessage(new AccountError("x", 403, "SESSION_NOT_FRESH"))).toMatch(
      /Sign in again/,
    )
  })

  it("keeps the server's message for the organization refusal", () => {
    const error = new AccountError(
      "You own Acme Inc. Transfer or delete it first.",
      400,
      "OWNS_ORGANIZATION",
    )
    expect(accountErrorMessage(error)).toBe("You own Acme Inc. Transfer or delete it first.")
  })

  it("falls back for anything it does not know", () => {
    expect(accountErrorMessage(new Error("boom"))).toBe("boom")
    expect(accountErrorMessage("nope")).toBe("Something went wrong. Try again.")
  })
})

describe("createAccountApi: a refusal for a stale session", () => {
  it("surfaces SESSION_NOT_FRESH as its own error, with the person's copy, on every guarded call", async () => {
    const refusal = {
      "/api/auth/revoke-session": {
        status: 403,
        body: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
      },
      "/api/auth/change-password": {
        status: 403,
        body: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
      },
      "/api/auth/revoke-other-sessions": {
        status: 403,
        body: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
      },
    }
    const { fetchImpl } = stubFetch(refusal)
    const api = createAccountApi(BASE, fetchImpl)
    const attempts = [
      api.revokeSession("t-2"),
      api.changePassword({ currentPassword: "a", newPassword: "b", revokeOtherSessions: false }),
      api.revokeOtherSessions(),
    ]
    for (const attempt of attempts) {
      const caught = await attempt.catch((error: unknown) => error)
      expect(caught).toBeInstanceOf(SessionNotFreshError)
      expect(caught).toBeInstanceOf(AccountError)
      expect(isSessionNotFresh(caught)).toBe(true)
      expect(accountErrorMessage(caught)).toBe(
        "Sign in again to continue. Changes like this need a recent sign-in.",
      )
    }
  })

  it("keeps the server's message for a refusal that is not about freshness", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/revoke-session": {
        status: 400,
        body: { code: "SOMETHING_ELSE", message: "Nope" },
      },
    })
    const caught = await createAccountApi(BASE, fetchImpl)
      .revokeSession("t-2")
      .catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(AccountError)
    expect(caught).not.toBeInstanceOf(SessionNotFreshError)
    expect(isSessionNotFresh(caught)).toBe(false)
  })
})
