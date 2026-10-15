import {
  oauthDeviceAuthorizationClient,
  oauthProviderClient,
} from "@better-auth/oauth-provider/client"
import { wrapsClient } from "@wraps.dev/better-auth/client"
import type { BetterAuthClientOptions } from "better-auth/client"
import { createAuthClient } from "better-auth/client"
import { organizationClient } from "better-auth/client/plugins"
import { ac, roles } from "./access"

/**
 * The browser client for this server's auth: sessions, passwords, organizations and the OAuth
 * provider's sign-in continuation (its fetch plugins carry the signed OAuth query), plus the
 * device-authorization endpoints.
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
    ],
  })
