import pino, { type DestinationStream, type Logger } from "pino"

export type { Logger } from "pino"

/** Keys whose values are replaced with [Redacted], at the top level and one level deep. */
const SENSITIVE = [
  "password",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
]

export const redactPaths = [
  ...SENSITIVE,
  ...SENSITIVE.map((k) => `*.${k}`),
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
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
