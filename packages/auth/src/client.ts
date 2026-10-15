import { wrapsClient } from "@wraps.dev/better-auth/client"
import type { BetterAuthClientOptions } from "better-auth/client"
import { createAuthClient } from "better-auth/client"
import { organizationClient } from "better-auth/client/plugins"
import { ac, roles } from "./access"

/** The browser client for this server's auth: sessions, passwords and organizations. */
export const createClient = (
  baseURL?: string,
  fetchOptions?: BetterAuthClientOptions["fetchOptions"],
) =>
  createAuthClient({
    baseURL,
    fetchOptions,
    // ./access, not ./permissions: this ships to browsers (client.test.ts checks the imports).
    plugins: [wrapsClient(), organizationClient({ ac, roles })],
  })
