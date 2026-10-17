import {
  ACTIVE_SUBSCRIPTION_CODE,
  LAST_SIGN_IN_METHOD_CODE,
  OWNS_ORGANIZATION_CODE,
  PASSWORD_COMPROMISED_CODE,
  PASSWORD_COMPROMISED_MESSAGE,
  createClient,
} from "@starter/auth/client"

import { WebError } from "./web-auth"

// The person's own account calls (profile, security): their name and email, sign-in methods, passkeys,
// two-factor, password and sessions. Nothing here names an organization. Each call is made by the
// signed-in person, so the server checks the session on every request.

export interface AccountProfile {
  id: string
  name: string
  email: string
  emailVerified: boolean
  /** The session's id of the current browser session (matches a SessionInfo's `token`). */
  currentSessionToken: string | null
}

export interface LinkedAccount {
  id: string
  providerId: string
  createdAt: string | Date | null
}

export interface PasskeyInfo {
  id: string
  name: string | null
  createdAt: string | Date | null
}

export interface SessionInfo {
  token: string
  userAgent: string | null
  createdAt: string | Date | null
  loginMethod: string | null
  loginTwoFactor: boolean
  current: boolean
}

export interface SecuritySummary {
  passwordChangedAt: string | Date | null
  twoFactorEnabled: boolean
  twoFactorEnabledAt: string | Date | null
  backupCodesRemaining: number | null
}

export interface TotpSetup {
  /** otpauth:// URI for an authenticator app. */
  totpURI: string
  backupCodes: string[]
}

/** A refused account call. `code` is better-auth's error code, when it has one. */
export class AccountError extends WebError {
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message, status)
    this.name = "AccountError"
    this.code = code
  }
}

/** The secret the authenticator app needs, from the otpauth URI's `secret` parameter. */
export function totpSecretOf(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}

type Failure = { message?: string; status?: number; code?: string }
type Result<T> = { data: T | null; error: Failure | null }

function unwrap<T>(result: Result<T>, fallback: string): T {
  if (result.error) {
    throw new AccountError(
      result.error.message || fallback,
      result.error.status ?? 0,
      result.error.code,
    )
  }
  return result.data as T
}

/** The copy the person sees for a refused account call. Server messages are already written for people. */
export function accountErrorMessage(
  caught: unknown,
  fallback = "Something went wrong. Try again.",
) {
  if (!(caught instanceof AccountError)) {
    return caught instanceof Error && caught.message ? caught.message : fallback
  }
  switch (caught.code) {
    case PASSWORD_COMPROMISED_CODE:
      return PASSWORD_COMPROMISED_MESSAGE
    case LAST_SIGN_IN_METHOD_CODE:
      return "You can't disconnect your last way to sign in."
    case OWNS_ORGANIZATION_CODE:
    case ACTIVE_SUBSCRIPTION_CODE:
      return caught.message
    case "SESSION_NOT_FRESH":
    case "SESSION_EXPIRED":
      return "Sign in again to continue. Changes like this need a recent sign-in."
    case "PROVIDER_NOT_FOUND":
      return "This sign-in method isn't set up on this server yet."
    case "INVALID_PASSWORD":
      return "That password isn't right."
    case "INVALID_CODE":
      return "That code isn't right. Check the app and try again."
    case "INVALID_BACKUP_CODE":
      return "That backup code isn't right, or it has already been used."
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "This account signs in without a password."
    default:
      return caught.message || fallback
  }
}

export interface AccountApi {
  getProfile(): Promise<AccountProfile>
  updateName(name: string): Promise<void>
  changeEmail(newEmail: string, callbackURL: string): Promise<void>
  /** Sends the confirmation link; nothing is deleted until it is opened. */
  requestAccountDeletion(callbackURL: string): Promise<void>
  listAccounts(): Promise<LinkedAccount[]>
  /** Starts the provider's sign-in to connect it; resolves with the URL to go to. */
  linkSocial(provider: string, callbackURL: string): Promise<string | undefined>
  unlinkAccount(accountId: string): Promise<void>
  listPasskeys(): Promise<PasskeyInfo[]>
  /** Registers a passkey on this device (WebAuthn). Rejects when the browser declines. */
  addPasskey(name: string): Promise<void>
  renamePasskey(id: string, name: string): Promise<void>
  deletePasskey(id: string): Promise<void>
  listSessions(): Promise<SessionInfo[]>
  revokeSession(token: string): Promise<void>
  revokeOtherSessions(): Promise<void>
  securitySummary(): Promise<SecuritySummary>
  /** Step one of switching two-factor on: checks the password, returns the secret and the backup codes. */
  enableTwoFactor(password: string): Promise<TotpSetup>
  /** Step two: the first code from the app switches it on. */
  confirmTwoFactor(code: string): Promise<void>
  disableTwoFactor(password: string): Promise<void>
  /** New backup codes; the old ones stop working. */
  newBackupCodes(password: string): Promise<string[]>
  changePassword(input: {
    currentPassword: string
    newPassword: string
    revokeOtherSessions: boolean
  }): Promise<void>
  /** The second step of a sign-in that needs two-factor: an app code. Resolves with the URL to go to. */
  /** `trustDevice` skips the code on this browser for 30 days (better-auth's trusted-device cookie). */
  completeSignInWithCode(code: string, trustDevice?: boolean): Promise<string | undefined>
  /** The second step with a backup code, when the app is not to hand. */
  completeSignInWithBackupCode(code: string): Promise<string | undefined>
}

/** The browser implementation. Same origin as the page, so the session cookie goes with each call. */
export function createAccountApi(baseURL?: string, fetchImpl?: typeof fetch): AccountApi {
  const client = createClient(baseURL, fetchImpl ? { customFetchImpl: fetchImpl } : undefined)
  // The client's typed methods come from several plugins; the calls below use the same names and
  // shapes better-auth documents for each. Typed through `unknown` so one missing plugin type can't
  // hide a real error at the call site.
  const c = client as unknown as {
    getSession: () => Promise<
      Result<{
        user: { id: string; name: string; email: string; emailVerified: boolean }
        session: { token: string }
      }>
    >
    updateUser: (body: { name: string }) => Promise<Result<unknown>>
    changeEmail: (body: { newEmail: string; callbackURL: string }) => Promise<Result<unknown>>
    deleteUser: (body: { callbackURL: string }) => Promise<Result<unknown>>
    listAccounts: () => Promise<
      Result<{ id: string; providerId: string; createdAt: string | Date }[]>
    >
    linkSocial: (body: {
      provider: string
      callbackURL: string
    }) => Promise<Result<{ url?: string }>>
    unlinkAccount: (body: { accountId: string }) => Promise<Result<unknown>>
    // The passkey plugin's client exposes only addPasskey; the list, rename and remove are its server
    // endpoints, called the way the security summary is.
    passkey: {
      addPasskey: (body: { name: string }) => Promise<Result<unknown>>
    }
    $fetch: <T>(
      path: string,
      options: { method: "GET" | "POST"; body?: unknown },
    ) => Promise<Result<T>>
    listSessions: () => Promise<Result<Array<Omit<SessionInfo, "current">>>>
    revokeSession: (body: { token: string }) => Promise<Result<unknown>>
    revokeOtherSessions: () => Promise<Result<unknown>>
    securitySummary: () => Promise<Result<SecuritySummary>>
    twoFactor: {
      enable: (body: { password: string }) => Promise<Result<TotpSetup>>
      verifyTotp: (body: { code: string }) => Promise<Result<{ url?: string } | null>>
      disable: (body: { password: string }) => Promise<Result<unknown>>
      generateBackupCodes: (body: {
        password: string
      }) => Promise<Result<{ backupCodes: string[] }>>
      verifyBackupCode: (body: { code: string }) => Promise<Result<{ url?: string } | null>>
    }
    changePassword: (body: {
      currentPassword: string
      newPassword: string
      revokeOtherSessions: boolean
    }) => Promise<Result<unknown>>
  }

  // The sign-in step's answer carries the continuation URL (the OAuth resume), as on the sign-in page.
  const continuation = (data: { url?: string } | null | undefined) => data?.url ?? undefined

  return {
    async getProfile() {
      const result = await c.getSession()
      const session = unwrap(result, "Could not load your account")
      return {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        currentSessionToken: session.session.token,
      }
    },
    async updateName(name) {
      unwrap(await c.updateUser({ name }), "Could not save your name")
    },
    async changeEmail(newEmail, callbackURL) {
      unwrap(await c.changeEmail({ newEmail, callbackURL }), "Could not change your email")
    },
    async requestAccountDeletion(callbackURL) {
      unwrap(await c.deleteUser({ callbackURL }), "Could not start account deletion")
    },
    async listAccounts() {
      return unwrap(await c.listAccounts(), "Could not load connected accounts")
    },
    async linkSocial(provider, callbackURL) {
      const data = unwrap(await c.linkSocial({ provider, callbackURL }), "Could not connect")
      return data?.url ?? undefined
    },
    async unlinkAccount(accountId) {
      unwrap(await c.unlinkAccount({ accountId }), "Could not disconnect")
    },
    async listPasskeys() {
      return unwrap(
        await c.$fetch<PasskeyInfo[]>("/passkey/list-user-passkeys", { method: "GET" }),
        "Could not load passkeys",
      )
    },
    async addPasskey(name) {
      unwrap(await c.passkey.addPasskey({ name }), "Could not add the passkey")
    },
    async renamePasskey(id, name) {
      unwrap(
        await c.$fetch("/passkey/update-passkey", { method: "POST", body: { id, name } }),
        "Could not rename the passkey",
      )
    },
    async deletePasskey(id) {
      unwrap(
        await c.$fetch("/passkey/delete-passkey", { method: "POST", body: { id } }),
        "Could not remove the passkey",
      )
    },
    async listSessions() {
      const [sessions, current] = await Promise.all([c.listSessions(), c.getSession()])
      const currentToken = current.data?.session.token
      return unwrap(sessions, "Could not load your sessions").map((session) => ({
        ...session,
        current: session.token === currentToken,
      }))
    },
    async revokeSession(token) {
      unwrap(await c.revokeSession({ token }), "Could not sign out that session")
    },
    async revokeOtherSessions() {
      unwrap(await c.revokeOtherSessions(), "Could not sign out the other sessions")
    },
    async securitySummary() {
      return unwrap(await c.securitySummary(), "Could not load your security settings")
    },
    async enableTwoFactor(password) {
      return unwrap(await c.twoFactor.enable({ password }), "Could not start two-factor")
    },
    async confirmTwoFactor(code) {
      unwrap(await c.twoFactor.verifyTotp({ code }), "That code isn't right")
    },
    async disableTwoFactor(password) {
      unwrap(await c.twoFactor.disable({ password }), "Could not turn off two-factor")
    },
    async newBackupCodes(password) {
      const data = unwrap(
        await c.twoFactor.generateBackupCodes({ password }),
        "Could not make new backup codes",
      )
      return data.backupCodes
    },
    async changePassword(input) {
      unwrap(await c.changePassword(input), "Could not change your password")
    },
    async completeSignInWithCode(code, trustDevice) {
      // The typed client omits trustDevice for verify-totp; the server schema accepts it (only when set).
      const body = trustDevice ? { code, trustDevice: true } : { code }
      return continuation(
        unwrap(
          await c.$fetch<{ url?: string; twoFactorRedirect?: boolean }>("/two-factor/verify-totp", {
            method: "POST",
            body,
          }),
          "That code isn't right",
        ),
      )
    },
    async completeSignInWithBackupCode(code) {
      return continuation(
        unwrap(await c.twoFactor.verifyBackupCode({ code }), "That backup code isn't right"),
      )
    },
  }
}

let shared: AccountApi | undefined

/** The page's own account API, created on first use in the browser. */
export function getAccountApi(): AccountApi {
  shared ??= createAccountApi(typeof window === "undefined" ? undefined : window.location.origin)
  return shared
}
