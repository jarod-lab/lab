import { AppError, type ErrorCode } from "@starter/errors"
import { z } from "zod"

import { allowed, type PermissionSet, type PermissionsOf } from "./permissions"

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
 * Run an operation for a caller: check permissions, validate input, call the handler, validate output.
 * Throws AppError (FORBIDDEN, BAD_REQUEST); anything else the handler throws propagates.
 */
export async function invoke(op: AnyOperation, raw: unknown, ctx: OperationContext) {
  if (!allowed(ctx.caller.grants, op.permissions)) {
    throw new AppError("FORBIDDEN", `Missing permission: ${formatPermissions(op.permissions)}`, {
      context: { operation: op.name, organizationId: ctx.caller.organizationId },
    })
  }
  const parsed = op.input.safeParse(raw ?? {})
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", z.prettifyError(parsed.error), {
      context: { operation: op.name },
    })
  }
  const result = await op.handler(parsed.data, ctx)
  const out = op.output.safeParse(result)
  if (!out.success) {
    throw new AppError("INTERNAL", `${op.name} returned an invalid result`, {
      cause: out.error,
      context: { operation: op.name },
    })
  }
  return out.data
}

/** `{ project: ["read", "update"] }` -> "project:read, project:update" */
export function formatPermissions(p: PermissionSet): string {
  return Object.entries(p)
    .flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`))
    .join(", ")
}
