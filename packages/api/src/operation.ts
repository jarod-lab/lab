import { AppError, type ErrorCode, reportError, toAppError } from "@starter/errors"
import { z } from "zod"

import { allowed, isEmpty, type PermissionSet, type PermissionsOf } from "./permissions"

/**
 * Who is calling, for which organization, and what they may do there. `Principal` from
 * `@starter/auth` satisfies this; the registry doesn't depend on auth.
 */
export interface Caller {
  organizationId: string
  actor: { type: "user"; userId: string } | { type: "apiKey"; keyId: string }
  /** Allowed when one grant covers the whole request (see `allowed`). */
  grants: readonly PermissionSet[]
  via: string
  clientId?: string
}

export interface OperationContext {
  caller: Caller
  requestId?: string
  /** Client-chosen key for safe retries of non-readOnly operations (see `Idempotency-Key`). */
  idempotencyKey?: string
}

export interface InvokeEvent {
  op: AnyOperation
  input: unknown
  ctx: OperationContext
}

export interface InvokeHooks {
  /**
   * After permission + input validation, before the handler. Return `{ result }` to short-circuit: the
   * handler is skipped and `result` is returned as stored (a replay), without output validation, because
   * it was validated when first produced. Throwing an AppError aborts the call (e.g. CONFLICT,
   * RATE_LIMITED); `after` does not run then, since the handler was never reached.
   */
  before?(e: InvokeEvent): Promise<{ result: unknown } | undefined | void>
  /**
   * Runs once per call that reached the handler or was short-circuited, with the outcome. Errors thrown
   * here are reported via `reportError` and swallowed: they never change what the caller receives.
   */
  after?(e: InvokeEvent & { outcome: InvokeOutcome }): Promise<void>
}

export type InvokeOutcome =
  | { ok: true; result: unknown; replayed: boolean }
  | { ok: false; error: AppError }

export interface InvokeOptions {
  hooks?: InvokeHooks
  /**
   * Text for FORBIDDEN hints, e.g. "Needs project:read; OAuth scope `read` or an API key with project:read".
   * Receives the permissions the caller lacks, measured against their closest grant.
   */
  permissionHint?: (missing: PermissionSet) => string
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type AnyObject = z.ZodObject<z.ZodRawShape>

export interface OperationSpec<I extends AnyObject, O extends z.ZodType, P = PermissionSet> {
  /** snake_case. The MCP tool name and the OpenAPI operationId. */
  name: string
  method: HttpMethod
  /** Hono-style path, e.g. `/v1/notes/:id`. Path params must be keys of `input`. */
  path: string
  /** One line: what it does. Shown in tool lists and llms.txt. */
  summary: string
  /** Written for an agent: when to use it, what it returns, what to call next. */
  description: string
  /** Required permissions, all of them, in the caller's organization. `{}` means any caller. */
  permissions: P
  /**
   * Path params, query and JSON body are merged into one object and validated against this.
   * Query values arrive as strings: use `z.coerce` for numbers and booleans in GET operations.
   */
  input: I
  output: O
  /** Hints for agents (MCP tool annotations). */
  hints?: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean }
  /**
   * Shown in llms-full.txt; the first becomes the OpenAPI example. Contract tests run each one as an
   * organization owner: `output` must validate, and `error` documents an expected failure instead.
   */
  examples?: { input: z.input<I>; output?: z.input<O>; error?: ErrorCode }[]
  handler: (input: z.output<I>, ctx: OperationContext) => Promise<z.input<O>> | z.input<O>
}

export type Operation<
  I extends AnyObject = AnyObject,
  O extends z.ZodType = z.ZodType,
> = OperationSpec<I, O>

// Method syntax keeps handler parameters bivariant, so typed operations fit in one list.
// biome-ignore lint: an array of differently-typed operations needs this escape hatch
export type AnyOperation = Operation<any, any>

const NAME = /^[a-z][a-z0-9_]{0,63}$/

/** Declare an operation once; REST routes, MCP tools, OpenAPI and llms.txt are generated from it. */
export function defineOperation<I extends AnyObject, O extends z.ZodType>(
  spec: OperationSpec<I, O>,
): Operation<I, O> {
  for (const [resource, actions] of Object.entries(spec.permissions)) {
    if (actions.length === 0) throw new Error(`${spec.name}: no actions listed for ${resource}`)
  }
  if (!NAME.test(spec.name)) throw new Error(`Operation name must be snake_case: ${spec.name}`)
  for (const param of pathParams(spec.path)) {
    if (!(param in spec.input.shape)) {
      throw new Error(`${spec.name}: path param :${param} is not in the input schema`)
    }
  }
  return spec
}

/**
 * `defineOperation` with permissions checked against a catalog at compile time:
 * `const defineOperation = operationsFor<Catalog>()`, then `permissions: { project: ["read"] }`.
 */
export function operationsFor<C extends PermissionSet>() {
  return <I extends AnyObject, O extends z.ZodType>(
    spec: OperationSpec<I, O, PermissionsOf<C>>,
  ): Operation<I, O> => defineOperation(spec as OperationSpec<I, O>)
}

/** Names of `:params` in a path. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1] ?? "")
}

/** Check names are unique and method+path pairs don't collide. Call once at startup. */
export function defineRegistry<const T extends readonly AnyOperation[]>(ops: T): T {
  const names = new Set<string>()
  const routes = new Set<string>()
  for (const op of ops) {
    if (names.has(op.name)) throw new Error(`Duplicate operation name: ${op.name}`)
    const route = `${op.method} ${op.path.replace(/:[A-Za-z0-9_]+/g, ":")}`
    if (routes.has(route)) throw new Error(`Duplicate route: ${op.method} ${op.path}`)
    names.add(op.name)
    routes.add(route)
  }
  return ops
}

/**
 * Throws FORBIDDEN, with the permission hint, unless the caller's grants cover the operation. `invoke`
 * runs it first; a surface that reads its own arguments (MCP's idempotencyKey) runs it before those.
 */
export function assertAllowed(
  op: AnyOperation,
  caller: Caller,
  options: Pick<InvokeOptions, "permissionHint"> = {},
): void {
  if (allowed(caller.grants, op.permissions)) return
  const missing = missingPermissions(caller.grants, op.permissions)
  throw new AppError("FORBIDDEN", `Missing permission: ${formatPermissions(missing)}`, {
    context: { operation: op.name, organizationId: caller.organizationId },
    hint: options.permissionHint?.(missing),
  })
}

/**
 * Run an operation for a caller: check permissions, validate input, run `before` hooks, call the handler,
 * validate output, then run `after` hooks. Throws AppError (FORBIDDEN, BAD_REQUEST, or whatever a hook
 * throws); anything else the handler throws propagates unchanged.
 */
export async function invoke(
  op: AnyOperation,
  raw: unknown,
  ctx: OperationContext,
  options: InvokeOptions = {},
) {
  assertAllowed(op, ctx.caller, options)
  const parsed = op.input.safeParse(raw ?? {})
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", z.prettifyError(parsed.error), {
      context: { operation: op.name },
    })
  }
  const event: InvokeEvent = { op, input: parsed.data, ctx }
  const hooks = options.hooks
  const replay = await hooks?.before?.(event)
  if (replay) {
    await runAfter(hooks, event, { ok: true, result: replay.result, replayed: true })
    return replay.result
  }
  let result: unknown
  try {
    const out = op.output.safeParse(await op.handler(parsed.data, ctx))
    if (!out.success) {
      throw new AppError("INTERNAL", `${op.name} returned an invalid result`, {
        cause: out.error,
        context: { operation: op.name },
      })
    }
    result = out.data
  } catch (e) {
    await runAfter(hooks, event, { ok: false, error: toAppError(e) })
    throw e
  }
  await runAfter(hooks, event, { ok: true, result, replayed: false })
  return result
}

/** Errors from `after` are reported and dropped: they must not change the response. */
async function runAfter(
  hooks: InvokeHooks | undefined,
  event: InvokeEvent,
  outcome: InvokeOutcome,
): Promise<void> {
  if (!hooks?.after) return
  try {
    await hooks.after({ ...event, outcome })
  } catch (e) {
    reportError(e, { operation: event.op.name, phase: "after" })
  }
}

const countActions = (p: PermissionSet) => Object.values(p).reduce((n, a) => n + a.length, 0)

/**
 * The permissions a caller lacks for `need`, measured against the grant closest to covering it, so the
 * hint names the smallest missing set. With no grants at all, everything in `need` is missing.
 */
export function missingPermissions(
  grants: readonly PermissionSet[],
  need: PermissionSet,
): PermissionSet {
  if (isEmpty(need)) return {}
  const missingIn = (g: PermissionSet): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    for (const [resource, actions] of Object.entries(need)) {
      const lacking = actions.filter((a) => !g[resource]?.includes(a))
      if (lacking.length > 0) out[resource] = lacking
    }
    return out
  }
  if (grants.length === 0) return need
  return grants
    .map(missingIn)
    .reduce((best, cur) => (countActions(cur) < countActions(best) ? cur : best))
}

/** `{ project: ["read", "update"] }` -> "project:read, project:update" */
export function formatPermissions(p: PermissionSet): string {
  return Object.entries(p)
    .flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`))
    .join(", ")
}
