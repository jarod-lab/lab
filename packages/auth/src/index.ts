import { apiKey } from "@better-auth/api-key"
import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import type { Database } from "@starter/db"
import * as schema from "@starter/db/schema"
import { wraps } from "@wraps.dev/better-auth"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import {
  admin,
  haveIBeenPwned,
  jwt,
  lastLoginMethod,
  magicLink,
  organization,
  twoFactor,
} from "better-auth/plugins"
import { PASSWORD_COMPROMISED_MESSAGE } from "./constants"
import { type DeviceInterval, deviceAuthorizationPlugin } from "./device"
import { impersonationGuard } from "./guards"
import { endGrantsOnLeave, revokeMemberGrants } from "./member-grants"
import { type Adapter, findMember, firstMembership, personalOrganization } from "./membership"
import { ac, OAUTH_SCOPES, roles } from "./permissions"
import { isReservedOrgSlug, slugOf } from "./reserved-slugs"
import { resumeMagicLinkAuthorization } from "./resume"
import { endProvisionalKeys, registerSignupDatabase } from "./signup"

export { DEVICE_VERIFICATION_PATH } from "./device"
export { IMPERSONATION_REFUSED_PATHS } from "./guards"
export { isReservedOrgSlug, RESERVED_ORG_SLUGS } from "./reserved-slugs"
export { isClaimed, type ProvisionalSignup, provisionalSignup } from "./signup"

/** Where better-auth's routes are mounted; the OAuth issuer is `${baseURL}${AUTH_BASE_PATH}`. */
export const AUTH_BASE_PATH = "/api/auth"

export { PASSWORD_COMPROMISED_CODE, PASSWORD_COMPROMISED_MESSAGE } from "./constants"

/** Every API key starts with this, so a bearer token can be routed without a lookup. */
export const API_KEY_PREFIX = "sk_"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

const isLoopbackHttp = (uri: unknown) => {
  try {
    const url = new URL(String(uri))
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/**
 * Local MCP clients (Claude Code, Cursor, the MCP SDK) register with an http://localhost callback
 * but don't send `application_type`, which defaults to "web" and makes the provider reject them.
 * Loopback-only redirects mean a native app (RFC 8252), so default those to "native".
 */
export const nativeLoopbackRegistration = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/oauth2/register") return
  const body = ctx.body as { application_type?: string; redirect_uris?: unknown } | undefined
  const uris = body?.redirect_uris
  if (!body || body.application_type || !Array.isArray(uris) || uris.length === 0) return
  if (!uris.every(isLoopbackHttp)) return
  return { context: { body: { ...body, application_type: "native" } } }
})

export interface AuthOptions {
  db: Database
  secret: string
  baseURL: string
  /** "Name <addr@domain>" — sender for auth emails. */
  emailFrom: string
  appName?: string
  /** Wraps API key: syncs signups to Wraps contacts. Omit to disable. */
  wrapsApiKey?: string
  /**
   * App pages the OAuth flow sends people to. Defaults: `/sign-in`, `/consent`, and
   * `/select-organization` (shown when the user belongs to several orgs; it sets the active org,
   * then POSTs `/oauth2/continue` with `{ postLogin: true }`).
   */
  oauthPages?: { login?: string; consent?: string; selectOrganization?: string }
  /** Protected resources OAuth tokens are issued for (RFC 8707), e.g. `${baseURL}/mcp`. */
  oauthResources?: string[]
  /**
   * Per-key request limit. better-auth's default is 10 per day, which one agent session exhausts.
   * Defaults to 600 per minute; `false` turns it off (e.g. when a gateway rate-limits instead).
   */
  apiKeyRateLimit?: { timeWindow: number; maxRequests: number } | false
  /** Device-grant minimum poll interval (e.g. "5s"). Tests use a short one; the default is 5s. */
  deviceInterval?: DeviceInterval
  /** Passed to `WrapsEmail` for auth emails (`client`, `region`, `roleArn`, ...); tests inject a fake. */
  ses?: Record<string, unknown>
  /** Called when an auth email fails to send. Sends never block the auth flow. */
  onEmailError?: (error: Error) => void
  /** GitHub OAuth app. The sign-in button is offered only when both values are set. */
  github?: { clientId: string; clientSecret: string }
  /** Google OAuth client. Offered only when both values are set. */
  google?: { clientId: string; clientSecret: string }
  /**
   * Check new and changed passwords against Have I Been Pwned (sends a 5-character hash prefix).
   * Off by default so tests make no network calls; server.ts turns it on.
   */
  passwordBreachCheck?: boolean
}

const refuseReservedSlug = (slug: string) => {
  if (isReservedOrgSlug(slug)) {
    throw APIError.from("BAD_REQUEST", {
      message: "That address is reserved. Choose another organization URL.",
      code: "RESERVED_ORGANIZATION_SLUG",
    })
  }
}

export function createAuth(opts: AuthOptions) {
  // Callbacks below run after construction and need the adapter, so they read it from this ref.
  const ref: { context?: Promise<{ adapter: Adapter }> } = {}
  const adapter = async (): Promise<Adapter> => {
    if (!ref.context) throw new Error("auth is not initialised")
    return (await ref.context).adapter
  }

  // Auth emails go through the user's own SES via Wraps. The plugin fills in better-auth's top-level
  // senders (verification, reset, password changed); the invitation sender belongs to the
  // organization plugin, so it comes from `wrapsPlugin.emails` below and shares the SES client.
  // Invitation links point at the app's /accept-invitation/:id page.
  const wrapsPlugin = wraps({
    apiKey: opts.wrapsApiKey,
    email: {
      from: opts.emailFrom,
      appName: opts.appName ?? "Starter",
      appUrl: opts.baseURL,
      ses: opts.ses,
      onError: opts.onEmailError,
    },
  })

  const auth = betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: AUTH_BASE_PATH,
    database: drizzleAdapter(opts.db, { provider: "pg", schema }),
    // A reset means the password may be compromised: sign out every session, not just future ones.
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      // Wraps fills this gap only when it is unset, so the notice is sent from here. Resetting through
      // an emailed link proves the mailbox, so the address counts as verified: provisional signups
      // (see signup.ts) are claimed this way.
      onPasswordReset: async ({ user }) => {
        // Verified first: a failing notice must not leave the claim unrecorded. This write skips
        // the user update hook, so the provisional key is ended here too.
        const db = await adapter()
        await db.updateMany({
          model: "user",
          where: [{ field: "id", value: user.id }],
          update: { emailVerified: true },
        })
        await endProvisionalKeys(db, user.id)
        await wrapsPlugin.emails.passwordChanged({ user })
      },
    },
    // better-auth turns its origin/CSRF checks off under a test runner. Keep them on, so tests
    // exercise what production does (requests with cookies must come from a trusted origin).
    advanced: { disableOriginCheck: false },
    // The jwt plugin's session-to-JWT endpoint, and the device plugin's /device/token, which mints a
    // session token. OAuth clients get tokens from /oauth2/token instead (device grant included).
    disabledPaths: ["/token", "/device/token"],
    hooks: { before: nativeLoopbackRegistration, after: endGrantsOnLeave },
    socialProviders: {
      ...(opts.github && {
        github: { clientId: opts.github.clientId, clientSecret: opts.github.clientSecret },
      }),
      ...(opts.google && {
        google: { clientId: opts.google.clientId, clientSecret: opts.google.clientSecret },
      }),
    },
    databaseHooks: {
      // Every account works inside an organization: signing up creates a personal one.
      // A verified address is a claimed account (verify-email, or any other path that sets it).
      user: {
        create: { after: async (user) => personalOrganization(await adapter(), user) },
        update: {
          after: async (user) => {
            if (user.emailVerified) await endProvisionalKeys(await adapter(), user.id)
          },
        },
      },
      // New sessions start in the user's first organization. Membership is still checked per request.
      session: {
        create: {
          before: async (session) => {
            const member = await firstMembership(await adapter(), session.userId)
            return { data: { ...session, activeOrganizationId: member?.organizationId ?? null } }
          },
        },
      },
    },
    plugins: [
      wrapsPlugin,
      // Before the password is stored, so a breached one never reaches the hash.
      haveIBeenPwned({
        enabled: opts.passwordBreachCheck ?? false,
        customPasswordCompromisedMessage: PASSWORD_COMPROMISED_MESSAGE,
      }),
      // Recorded on the user row (lastLoginMethod) for the sign-in screens.
      lastLoginMethod({ storeInDatabase: true }),
      // Passkeys are bound to the app's own origin: the host of the base URL.
      passkey({
        rpID: new URL(opts.baseURL).hostname,
        rpName: opts.appName ?? "Starter",
        origin: opts.baseURL,
      }),
      // TOTP with backup codes and trusted devices. Signing in with a second factor pending answers
      // `twoFactorRedirect`; the web app sends the person to /two-factor (see client.ts).
      twoFactor({ issuer: opts.appName ?? "Starter" }),
      // Sign-in links; the wraps plugin sends them through the same SES path as other auth emails.
      magicLink({ sendMagicLink: wrapsPlugin.emails.magicLink }),
      // Platform admins: a user whose `role` is "admin". Impersonation is limited by impersonationGuard.
      admin({ adminRoles: ["admin"], defaultRole: "user" }),
      impersonationGuard,
      organization({
        ac,
        roles,
        creatorRole: "owner",
        sendInvitationEmail: wrapsPlugin.emails.invitation,
        // Organization slugs are URL segments, so the app's own paths are refused (RESERVED_ORG_SLUGS).
        organizationHooks: {
          beforeCreateOrganization: async ({ organization }) => {
            refuseReservedSlug(organization.slug ?? slugOf(organization.name ?? ""))
          },
          beforeUpdateOrganization: async ({ organization }) => {
            if (typeof organization.slug === "string") refuseReservedSlug(organization.slug)
          },
          // Removal ends the agent access the member granted here (leaving: `endGrantsOnLeave`).
          afterRemoveMember: async ({ member, organization }) =>
            revokeMemberGrants(await adapter(), member.userId, organization.id),
        },
      }),
      // Keys belong to an organization and carry an explicit permission subset (`create_api_key`
      // checks it against the creator). No defaults: a key without permissions can do nothing.
      apiKey({
        references: "organization",
        defaultPrefix: API_KEY_PREFIX,
        enableMetadata: true,
        rateLimit:
          opts.apiKeyRateLimit === false
            ? { enabled: false }
            : { enabled: true, timeWindow: 60_000, maxRequests: 600, ...opts.apiKeyRateLimit },
        permissions: { defaultPermissions: {} },
      }),
      // Signs OAuth access tokens. No `set-auth-jwt` on /get-session: a session JWT must never pass
      // as an OAuth token (resolvePrincipal also requires a client claim and the OAuth issuer).
      jwt({ disableSettingJwtHeader: true }),
      oauthProvider({
        loginPage: opts.oauthPages?.login ?? "/sign-in",
        consentPage: opts.oauthPages?.consent ?? "/consent",
        scopes: ["openid", "profile", "email", "offline_access", ...OAUTH_SCOPES],
        // MCP clients (Claude, ChatGPT, Cursor) register themselves (RFC 7591); PKCE stays required.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: ["openid", "offline_access", ...OAUTH_SCOPES],
        resources: opts.oauthResources,
        // Self-registered MCP clients must be able to ask for these resources, or authorize fails
        // with invalid_target (per-client resource links are enforced by default, RFC 8707 §3).
        clientRegistrationDefaultResources: opts.oauthResources,
        // A token acts in exactly one organization: the session's active one when the user consents.
        // The consent page should show it and offer a switcher (set-active, then accept). The
        // select-organization page is only shown when the session has no valid active org; it sets
        // one and POSTs /oauth2/continue with { postLogin: true }.
        postLogin: {
          page: opts.oauthPages?.selectOrganization ?? "/select-organization",
          shouldRedirect: async ({ user, session }): Promise<boolean> => {
            const orgId = session.activeOrganizationId
            if (typeof orgId !== "string") return true
            return !(await findMember(await adapter(), user.id, orgId))
          },
          consentReferenceId: async ({ user, session }): Promise<string> => {
            const orgId = session.activeOrganizationId
            const member =
              typeof orgId === "string" ? await findMember(await adapter(), user.id, orgId) : null
            if (!member) throw new Error("No organization selected for this authorization")
            return member.organizationId
          },
        },
        customAccessTokenClaims: ({ referenceId }) => (referenceId ? { org: referenceId } : {}),
      }),
      // A pending OAuth authorization survives the emailed link (see resume.ts). After oauthProvider,
      // so its signature check has already run on the sign-in request.
      resumeMagicLinkAuthorization({
        authorizeUrl: `${opts.baseURL}${AUTH_BASE_PATH}/oauth2/authorize`,
        signInUrl: `${opts.baseURL}${opts.oauthPages?.login ?? "/sign-in"}`,
      }),
      // RFC 8628 device grant on the same token endpoint (see device.ts).
      deviceAuthorizationPlugin({ interval: opts.deviceInterval }),
    ],
  })
  ref.context = auth.$context
  registerSignupDatabase(auth, opts.db)
  return auth
}

export type Auth = ReturnType<typeof createAuth>

export {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider"
export * from "./permissions"
export { oauthIssuer, type Principal, resolvePrincipal } from "./principal"
