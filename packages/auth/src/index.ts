import { wraps } from "@wraps.dev/better-auth"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import * as schema from "@starter/db/schema"

type Db = Parameters<typeof drizzleAdapter>[0]

export interface AuthOptions {
  db: Db
  secret: string
  baseURL: string
  /** "Name <addr@domain>" — sender for auth emails. */
  emailFrom: string
  appName?: string
  /** Wraps API key: syncs signups to Wraps contacts. Omit to disable. */
  wrapsApiKey?: string
}

export function createAuth(opts: AuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    database: drizzleAdapter(opts.db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    plugins: [
      wraps({
        apiKey: opts.wrapsApiKey,
        email: { from: opts.emailFrom, appName: opts.appName ?? "Starter" },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
