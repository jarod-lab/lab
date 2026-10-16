import {
  oauthDeviceAuthorizationClient,
  oauthProviderClient,
} from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { wrapsClient } from "@wraps.dev/better-auth/client"
import type { BetterAuthClientOptions } from "better-auth/client"
import { createAuthClient } from "better-auth/client"
import {
  adminClient,
  lastLoginMethodClient,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins"
import { ac, roles } from "./access"

export { RESERVED_ORG_SLUGS, isReservedOrgSlug } from "./reserved-slugs"
export { PASSWORD_COMPROMISED_CODE, PASSWORD_COMPROMISED_MESSAGE } from "./constants"

/** The app page a sign-in sends a person to when a second factor is still needed. */
export const TWO_FACTOR_PATH = "/two-factor"

/**
 * The browser client for this server's auth: sessions, passwords, organizations and the OAuth
 * provider's sign-in continuation (its fetch plugins carry the signed OAuth query), plus the
 * device-authorization endpoints, passkeys, two-factor, magic links and admin/impersonation.
 * A sign-in that needs a second factor reports `twoFactorRedirect`; the app goes to /two-factor.
 */
export const createClient = (
  baseURL?: string,
  fetchOptions?: BetterAuthClientOptions["fetchOptions"],
) =>
  createAuthClient({
    baseURL,
    fetchOptions,
    // ./access, not ./permissions: this ships to browsers (client.test.ts checks the imports).
    plugins: [
      wrapsClient(),
      organizationClient({ ac, roles }),
      oauthProviderClient(),
      oauthDeviceAuthorizationClient(),
      passkeyClient(),
      magicLinkClient(),
      lastLoginMethodClient(),
      adminClient(),
      twoFactorClient({
        // The page keeps its query: a pending OAuth authorization rides on it into the code entry.
        onTwoFactorRedirect() {
          if (typeof window !== "undefined")
            window.location.href = `${TWO_FACTOR_PATH}${window.location.search}`
        },
      }),
    ],
  })
