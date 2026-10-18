import { provisionalSignup } from "@starter/auth"
import { z } from "zod"

import { actorOf, defineOperation, type OperationDeps } from "./shared"

/** POST /v1/signup's body. */
export const signupInput = z.object({
  email: z.email().describe("Address that claims the account; one claim email is sent to it"),
  name: z.string().trim().min(1).max(100).optional().describe("Display name"),
})

export function accountOperations({ auth, meter }: Pick<OperationDeps, "auth" | "meter">) {
  const whoami = defineOperation({
    name: "whoami",
    method: "GET",
    path: "/v1/whoami",
    summary: "Show the caller, its organization, permissions and usage",
    description:
      "Returns the organization this credential acts for, who is acting (a user or an API key), " +
      "how it authenticated, its permission grants (a request is allowed when one grant covers all " +
      "of it), today's usage against the daily limit, and whether the owner has claimed the " +
      "account (verified the email). Call this first to check a credential.",
    permissions: {},
    input: z.object({}),
    output: z.object({
      organizationId: z.string(),
      actor: z.object({ type: z.enum(["user", "apiKey"]), id: z.string() }),
      via: z.string(),
      grants: z.array(z.record(z.string(), z.array(z.string()))),
      usage: z.object({
        day: z.string().describe("The UTC day the counter covers (YYYY-MM-DD)"),
        total: z.number().int().describe("Requests so far today, including this one"),
        limit: z.number().int().describe("Requests allowed per day for this organization"),
      }),
      claimed: z.boolean().describe("False while the owner's email is unverified (lower limit)"),
    }),
    hints: { readOnly: true, idempotent: true },
    examples: [
      {
        input: {},
        output: {
          organizationId: "org_123",
          actor: { type: "apiKey", id: "key_123" },
          via: "api-key",
          grants: [{ project: ["read", "create"] }],
          usage: { day: "2026-10-15", total: 3, limit: 500 },
          claimed: false,
        },
      },
    ],
    handler: async (_input, { caller }) => {
      const [status, usage] = await Promise.all([meter.status(caller), meter.usageToday(caller)])
      return {
        organizationId: caller.organizationId,
        actor: actorOf(caller),
        via: caller.via,
        grants: caller.grants.map((g) =>
          Object.fromEntries(Object.entries(g).map(([r, a]) => [r, [...a]])),
        ),
        usage: { day: usage.day, total: usage.total, limit: status.limit },
        claimed: status.claimed,
      }
    },
  })

  const signup = defineOperation({
    name: "signup",
    method: "POST",
    path: "/v1/signup",
    // Public: no credential is read, so the request runs with no caller (see OperationAuth).
    auth: "none",
    summary: "Create an agent account without signing in",
    description:
      "Creates a personal organization, an API key with project permissions, and sends one email " +
      "to the address to claim the account. Send it with no credentials: this is the only " +
      "operation that needs none. Use the returned apiKey straight away, as x-api-key or a Bearer " +
      "token. The key is temporary: it stops working when the person claims the account by opening " +
      "the emailed link, since whoever called signup holds it. Tell them that. After the claim, " +
      "calls with it get UNAUTHORIZED; sign in with the device grant (POST /api/auth/device/code, " +
      "which the person approves at /device). Until the claim the organization has a lower daily " +
      "request limit (see limits). Limits: 5 signups per client IP per hour and 20 per email " +
      "domain per day.",
    permissions: {},
    input: signupInput,
    output: z.object({
      organizationId: z.string(),
      apiKey: z.string().describe("Shown once. Stores project read, create, update and delete."),
      claimUrlSentTo: z.string(),
      apiKeyEndsWhenClaimed: z
        .literal(true)
        .describe(
          "apiKey stops working once the person claims the account; then use the device grant",
        ),
      limits: z.object({
        requestsPerDay: z.number().int().describe("Until the email is verified"),
      }),
    }),
    examples: [{ input: { email: "agent@example.com" } }],
    handler: async (input, ctx) => {
      const created = await provisionalSignup(auth, {
        email: input.email,
        name: input.name,
        ip: ctx.public.ip,
      })
      return {
        organizationId: created.organizationId,
        apiKey: created.apiKey,
        claimUrlSentTo: input.email.trim().toLowerCase(),
        apiKeyEndsWhenClaimed: true as const,
        limits: { requestsPerDay: meter.limits.unclaimed },
      }
    },
  })

  return {
    whoami,
    signup,
  }
}
