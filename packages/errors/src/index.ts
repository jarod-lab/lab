export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL"

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export interface AppErrorOptions {
  cause?: unknown
  /** Safe to show to end users. Defaults to true for 4xx, false for INTERNAL. */
  expose?: boolean
  /** Structured, loggable context. Never put secrets here. */
  context?: Record<string, unknown>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly expose: boolean
  readonly context: Record<string, unknown>

  constructor(code: ErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message, { cause: opts.cause })
    this.name = "AppError"
    this.code = code
    this.status = STATUS[code]
    this.expose = opts.expose ?? code !== "INTERNAL"
    this.context = opts.context ?? {}
  }

  /** What to send to a client: details only when `expose` is set. */
  toPublic(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.expose ? this.message : "Internal error" }
  }
}

/** Normalise anything thrown into an AppError (unknown errors become INTERNAL, cause preserved). */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  const message = e instanceof Error ? e.message : String(e)
  return new AppError("INTERNAL", message, { cause: e })
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E = AppError>(error: E): Result<never, E> => ({ ok: false, error })

/** Run a throwing function and capture the outcome as a Result. */
export async function attempt<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (e) {
    return err(toAppError(e))
  }
}

export type ErrorReporter = (error: AppError, context?: Record<string, unknown>) => void

let reporter: ErrorReporter | undefined

/** Register a reporter once at startup (e.g. Sentry.captureException). Pass undefined to clear. */
export function setErrorReporter(fn: ErrorReporter | undefined): void {
  reporter = fn
}

/** Report an error to the registered reporter. Never throws; reporting must not break the request. */
export function reportError(e: unknown, context?: Record<string, unknown>): AppError {
  const error = toAppError(e)
  try {
    reporter?.(error, { ...error.context, ...context })
  } catch {
    // swallow: a broken reporter must not take the app down
  }
  return error
}
