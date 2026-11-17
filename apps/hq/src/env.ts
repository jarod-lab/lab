import { env } from "@lab/env"

/** The default port when neither a launcher nor PORT names one. */
const DEFAULT_PORT = 3100

/**
 * What apps/hq needs to boot, from @lab/env (the only place env vars are read). `portArg` is the
 * port the launcher passes as an argument (the e2e runner picks a free one); HQ_DATABASE_URL has
 * no default, so hq never falls back to the product's database.
 */
export function hqEnv(portArg?: string) {
  const databaseUrl = env.HQ_DATABASE_URL
  if (!databaseUrl) {
    throw new Error("HQ_DATABASE_URL is not set: hq has its own database (see .env.example)")
  }
  const port = portArg === undefined ? (env.PORT ?? DEFAULT_PORT) : Number(portArg)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Not a port: ${portArg}`)
  return {
    databaseUrl,
    port,
    baseURL: (env.HQ_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, ""),
    secret: env.BETTER_AUTH_SECRET,
    emailFrom: env.EMAIL_FROM,
  }
}
