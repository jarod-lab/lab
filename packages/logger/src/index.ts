import pino, { type DestinationStream, type Logger } from "pino"

export type { Logger } from "pino"

/**
 * Keys whose values are replaced with [Redacted], at the top level and up to two levels deep. Paths
 * match exact keys, so the spellings OAuth bodies and headers use are listed too.
 */
const SENSITIVE = [
  "password",
  "Password",
  "newPassword",
  "currentPassword",
  "token",
  "Token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "secret",
  "clientSecret",
  "client_secret",
  "apiKey",
  "api_key",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
]

/** Credential headers, redacted in any `headers` object up to two levels below the log line. */
const SENSITIVE_HEADERS = [
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie",
  "x-api-key",
  "X-API-Key",
  "X-Api-Key",
]

const redactPaths = [
  ...SENSITIVE,
  ...SENSITIVE.map((k) => `*.${k}`),
  ...SENSITIVE.map((k) => `*.*.${k}`),
  ...["headers", "*.headers", "*.*.headers"].flatMap((at) =>
    SENSITIVE_HEADERS.map((h) => `${at}["${h}"]`),
  ),
]

export interface LoggerOptions {
  name?: string
  /** Defaults to LOG_LEVEL, then "info" (or "silent" under test). */
  level?: string
  /** For tests: capture output. */
  destination?: DestinationStream
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level =
    opts.level || process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info")
  return pino(
    {
      name: opts.name,
      level,
      redact: { paths: redactPaths, censor: "[Redacted]" },
      serializers: { err: pino.stdSerializers.err },
    },
    opts.destination,
  )
}
