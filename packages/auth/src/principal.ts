import type { PermissionSet } from "@starter/api"
import { AppError } from "@starter/errors"
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose"

import { API_KEY_PREFIX, AUTH_BASE_PATH, type Auth } from "./index"
import { findMember } from "./membership"
import { narrow, rolePermissions, scopePermissions } from "./permissions"

export type Actor = { type: "user"; userId: string } | { type: "apiKey"; keyId: string }

/** Who is calling, for which organization, and what they may do there. */
export interface Principal {
  organizationId: string
  actor: Actor
  via: "session" | "api-key" | "oauth"
  /**
   * One grant per role, each narrowed to what the credential allows. A request is allowed when one
   * grant covers all of it (better-auth's multi-role semantics). Use `allowed` from `@starter/api`.
   */
  grants: PermissionSet[]
  /** OAuth client id, or the API key id. */
  clientId?: string
}

export interface ResolveOptions {
  /** This resource's URL(s). OAuth tokens minted for another audience are rejected. */
  audience: string | string[]
}

function bearer(headers: Headers): string | undefined {
  const match = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

/** The OAuth provider's issuer: better-auth's base URL plus its base path. */
export function oauthIssuer(auth: Auth): string {
  const base = String(auth.options.baseURL ?? "").replace(/\/$/, "")
  return `${base}${AUTH_BASE_PATH}`
}

/**
 * Authenticate a request: an organization API key (`x-api-key` or `Bearer sk_…`), an OAuth access
 * token (JWT bound to one organization), or a session cookie (its active organization).
 * Membership is checked on every call, so removing a member takes effect immediately.
 * Returns null when nothing valid is present; throws AppError RATE_LIMITED for an over-limit key.
 */
export async function resolvePrincipal(
  auth: Auth,
  headers: Headers,
  opts: ResolveOptions,
): Promise<Principal | null> {
  const token = bearer(headers)
  const key = headers.get("x-api-key") ?? (token?.startsWith(API_KEY_PREFIX) ? token : undefined)
  if (key) return fromApiKey(auth, key)
  if (token) return fromAccessToken(auth, token, opts)
  return fromSession(auth, headers)
}

async function fromSession(auth: Auth, headers: Headers): Promise<Principal | null> {
  const session = await auth.api.getSession({ headers })
  const orgId = session?.session.activeOrganizationId
  if (!session || !orgId) return null
  const member = await findMember((await auth.$context).adapter, session.user.id, orgId)
  if (!member) return null
  return {
    organizationId: orgId,
    actor: { type: "user", userId: session.user.id },
    via: "session",
    grants: rolePermissions(member.role),
  }
}

async function fromApiKey(auth: Auth, key: string): Promise<Principal | null> {
  const res = await auth.api.verifyApiKey({ body: { key } })
  if (res.error?.code === "RATE_LIMITED") {
    throw new AppError("RATE_LIMITED", "API key rate limit exceeded; retry later")
  }
  if (!res.valid || !res.key) return null
  // Keys reference their organization without a foreign key; a deleted org's keys must stop working.
  const org = await (await auth.$context).adapter.findOne({
    model: "organization",
    where: [{ field: "id", value: res.key.referenceId }],
  })
  if (!org) return null
  const permissions = (res.key.permissions ?? {}) as PermissionSet
  return {
    organizationId: res.key.referenceId,
    actor: { type: "apiKey", keyId: res.key.id },
    via: "api-key",
    grants: Object.keys(permissions).length > 0 ? [permissions] : [],
    clientId: res.key.id,
  }
}

async function fromAccessToken(
  auth: Auth,
  token: string,
  opts: ResolveOptions,
): Promise<Principal | null> {
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"]
  try {
    // The keys are this server's own, so a valid signature already means we issued the token.
    const jwks = createLocalJWKSet((await auth.api.getJwks()) as JSONWebKeySet)
    ;({ payload } = await jwtVerify(token, jwks, {
      audience: opts.audience,
      issuer: oauthIssuer(auth),
    }))
  } catch {
    return null
  }
  // OAuth access tokens always name the client and the organization they were granted for.
  const clientId = payload.azp ?? payload.client_id
  if (!payload.sub || typeof clientId !== "string" || typeof payload.org !== "string") return null
  const member = await findMember((await auth.$context).adapter, payload.sub, payload.org)
  if (!member) return null
  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : []
  return {
    organizationId: payload.org,
    actor: { type: "user", userId: payload.sub },
    via: "oauth",
    grants: narrow(rolePermissions(member.role), scopePermissions(scopes)),
    clientId,
  }
}
