// Provisional signup for agents: an account with no password anyone knows, a personal organization,
// and an API key, all usable at once. The person claims it later through an emailed reset link
// (which also marks the address verified). Until then the organization is held to a low quota
// elsewhere (see whoami's `claimed`).
import { randomBytes, randomUUID } from "node:crypto"

import type { Database } from "@starter/db"
import { signupAttempt } from "@starter/db/schema"
import { AppError } from "@starter/errors"
import { and, count, eq, gte } from "drizzle-orm"

import type { Auth } from "./index"
import { type Adapter, firstMembership } from "./membership"

// The signup-attempt table is ours, not better-auth's, so it is reached through the app's Drizzle
// database, which createAuth registers against the auth instance it returns.
const databases = new WeakMap<Auth, Database>()

/** Called by createAuth: the database provisionalSignup records attempts in. */
export function registerSignupDatabase(auth: Auth, db: Database): void {
  databases.set(auth, db)
}

/** Attempts (successful or not) allowed per IP per hour, and per email domain per day. */
export const SIGNUP_LIMITS = { perIpPerHour: 5, perDomainPerDay: 20 } as const

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** The key a provisional signup gets: the project operations, nothing else. */
const PROVISIONAL_PERMISSIONS = { project: ["read", "create", "update", "delete"] }

export interface ProvisionalSignup {
  organizationId: string
  userId: string
  /** An `sk_` key for the personal organization, with PROVISIONAL_PERMISSIONS. */
  apiKey: string
}

/** A user has claimed their account once its address is verified (the claim link does that). */
export const isClaimed = (user: { emailVerified?: boolean | null }): boolean =>
  user.emailVerified === true

// REST sends `headers` on the response, so the client sees Retry-After; `context` keeps the number.
const rateLimited = (retryAfter: number, message: string) =>
  new AppError("RATE_LIMITED", message, {
    headers: { "retry-after": String(retryAfter) },
    context: { retryAfter },
  })

/**
 * Create a provisional account and send one claim email (a password reset link to `/claim`).
 * Every attempt is recorded before the checks, so refused and conflicting attempts count toward
 * the limits too. Throws RATE_LIMITED past SIGNUP_LIMITS (`context.retryAfter` holds the seconds to
 * wait, for the caller to turn into a Retry-After header) and CONFLICT when the email is taken.
 */
export async function provisionalSignup(
  auth: Auth,
  input: { email: string; name?: string; ip: string },
): Promise<ProvisionalSignup> {
  const email = input.email.trim().toLowerCase()
  const at = email.lastIndexOf("@")
  const domain = email.slice(at + 1)
  if (at <= 0 || domain.length === 0)
    throw new AppError("BAD_REQUEST", "Enter a valid email address")

  const db = databases.get(auth)
  if (!db) throw new Error("provisionalSignup needs an auth instance from createAuth")
  const ctx = await auth.$context
  const adapter = ctx.adapter
  const now = Date.now()

  await db.insert(signupAttempt).values({
    id: randomUUID(),
    ip: input.ip,
    emailDomain: domain,
    createdAt: new Date(now),
  })
  const fromIp = await db
    .select({ n: count() })
    .from(signupAttempt)
    .where(
      and(eq(signupAttempt.ip, input.ip), gte(signupAttempt.createdAt, new Date(now - HOUR_MS))),
    )
  if ((fromIp[0]?.n ?? 0) > SIGNUP_LIMITS.perIpPerHour) {
    throw rateLimited(3600, "Too many signups from this network. Try again later.")
  }
  const fromDomain = await db
    .select({ n: count() })
    .from(signupAttempt)
    .where(
      and(
        eq(signupAttempt.emailDomain, domain),
        gte(signupAttempt.createdAt, new Date(now - DAY_MS)),
      ),
    )
  if ((fromDomain[0]?.n ?? 0) > SIGNUP_LIMITS.perDomainPerDay) {
    throw rateLimited(86_400, "Too many signups for this email domain today. Try again later.")
  }

  const existing = await adapter.findOne({
    model: "user",
    where: [{ field: "email", value: email }],
  })
  if (existing) {
    throw new AppError("CONFLICT", "An account already exists for this email. Use sign-in.")
  }

  // Created through better-auth's internals (not signUpEmail) so no session is minted: nobody holds
  // the password, and the only way in is the device grant or the claim link.
  // Provisioned like an email-and-password sign-up (the source is for user validation hooks).
  const user = await ctx.internalAdapter.createUser(
    { email, name: input.name?.trim() || email.slice(0, at), emailVerified: false },
    { method: "email-password" },
  )
  const password = randomBytes(32).toString("base64url")
  await ctx.internalAdapter.linkAccount({
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: await ctx.password.hash(password),
  })

  const member = await firstMembership(adapter, user.id)
  if (!member) throw new Error("provisional signup did not create a personal organization")
  const created = await auth.api.createApiKey({
    body: {
      organizationId: member.organizationId,
      userId: user.id,
      name: "Provisional",
      permissions: PROVISIONAL_PERMISSIONS,
      metadata: { provisional: true, userId: user.id },
    },
  })

  const baseURL = String(auth.options.baseURL ?? "").replace(/\/$/, "")
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `${baseURL}/claim` },
  })

  return { organizationId: member.organizationId, userId: user.id, apiKey: created.key }
}

/**
 * Turn off the user's provisional signup keys. Called when the address is verified (the claim):
 * anyone could have called signup with this address and kept the key, so once the person who owns
 * the mailbox takes over, the key stops working. The agent then signs in with the device grant,
 * which the person approves. Disabled, not deleted, so a call with the key gets a hint saying why.
 */
export async function endProvisionalKeys(db: Adapter, userId: string): Promise<void> {
  const memberships = await db.findMany<{ organizationId: string }>({
    model: "member",
    where: [{ field: "userId", value: userId }],
  })
  if (memberships.length === 0) return
  const keys = await db.findMany<{ id: string; metadata: unknown }>({
    model: "apikey",
    where: [
      { field: "referenceId", value: memberships.map((m) => m.organizationId), operator: "in" },
      { field: "enabled", value: true },
    ],
  })
  for (const key of keys) {
    if (!isProvisionalKeyOf(key.metadata, userId)) continue
    await db.updateMany({
      model: "apikey",
      where: [{ field: "id", value: key.id }],
      update: { enabled: false },
    })
  }
}

function isProvisionalKeyOf(metadata: unknown, userId: string): boolean {
  let value = metadata
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return false
    }
  }
  const m = value as { provisional?: unknown; userId?: unknown } | null
  return m?.provisional === true && m.userId === userId
}
