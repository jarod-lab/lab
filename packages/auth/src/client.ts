import {
  oauthDeviceAuthorizationClient,
  oauthProviderClient,
} from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { ssoClient } from "@better-auth/sso/client"
import { stripeClient } from "@better-auth/stripe/client"
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
import { TWO_FACTOR_PATH } from "./constants"

export { RESERVED_ORG_SLUGS, isReservedOrgSlug } from "./reserved-slugs"
export {
  PASSWORD_COMPROMISED_CODE,
  PASSWORD_COMPROMISED_MESSAGE,
  TWO_FACTOR_PATH,
} from "./constants"

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
      ssoClient(),
      // Billing answers only when the server has Stripe configured (test mode); see index.ts.
      stripeClient({ subscription: true }),
      twoFactorClient({
        // The page keeps its query: a pending OAuth authorization rides on it into the code entry.
        onTwoFactorRedirect() {
          if (typeof window !== "undefined")
            window.location.href = `${TWO_FACTOR_PATH}${window.location.search}`
        },
      }),
    ],
  })
