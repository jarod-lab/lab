import {
  allowed,
  decodeCursor,
  defineRegistry,
  encodeCursor,
  operationsFor,
  paginated,
  paginationInput,
} from "@starter/api"
import { type Auth, type Catalog, statements } from "@starter/auth"
import { name, ProjectId, projectInOrg } from "@starter/auth-proofs"
import type { Database } from "@starter/db"
import { AppError } from "@starter/errors"
import { z } from "zod"

import { listConnectedAgents, revokeAgentAccess } from "./agents"
import { listAuditEvents } from "./data/audit"
import { createProject, deleteProject, listProjects } from "./data/projects"
import type { Meter } from "./meter"
import { inCallerOrg } from "./tenant"

// Example operations. Each one is a REST route, an MCP tool, and an entry in openapi.json and
// llms.txt. Replace them with your product's; keep descriptions written for an agent reader.
// `permissions` is checked against the catalog in @starter/auth at compile time.
const defineOperation = operationsFor<Catalog>()

const projectOutput = z.object({ id: z.string(), name: z.string(), createdAt: z.string() })
const toOutput = (p: { id: string; name: string; createdAt: Date }) => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt.toISOString(),
})

const catalog: Readonly<Record<string, readonly string[]>> = statements

/** `{ resource: [actions] }`, limited to the permission catalog. */
const permissionsInput = z.record(z.string(), z.array(z.string()).min(1)).refine(
  (p) =>
    Object.entries(p).every(
      ([resource, actions]) =>
        // Own keys only: `constructor` or `toString` would otherwise find Object.prototype's.
        Object.hasOwn(catalog, resource) && actions.every((a) => catalog[resource]?.includes(a)),
    ),
  { message: "Unknown resource or action; see the permission catalog" },
)

// Keyset cursors: the position after the last row of a page, as the sort key (time and id).
// Year 0 is a valid ISO date but outside Postgres' timestamp range, so it would fail in the query.
const keyset = z.object({
  at: z.iso.datetime().refine((at) => new Date(at).getUTCFullYear() >= 1),
  id: z.string().min(1),
})

function readCursor(cursor: string | undefined): z.output<typeof keyset> | undefined {
  if (cursor === undefined) return undefined
  const parsed = keyset.safeParse(decodeCursor(cursor))
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", "Invalid cursor", {
      hint: "Pass nextCursor from the previous page unchanged, or omit cursor to start from the first page.",
    })
  }
  return parsed.data
}

/** Cut one page from `limit + 1` rows: the extra row only says whether there is a next page. */
function cut<T extends { id: string }>(rows: readonly T[], limit: number, when: (row: T) => Date) {
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const nextCursor =
    rows.length > limit && last ? encodeCursor({ at: when(last).toISOString(), id: last.id }) : null
  return { page, nextCursor }
}

const auditEventOutput = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.object({ type: z.enum(["user", "apiKey"]), id: z.string() }),
  clientId: z.string().nullable(),
  operation: z.string(),
  outcome: z.string(),
  requestId: z.string().nullable(),
})

/**
 * Operations served only over REST. Signup needs no credentials, so it is not an MCP tool (an agent
 * with a key has no use for it there). It stays in the OpenAPI document and llms.txt.
 */
export const REST_ONLY_OPERATIONS: ReadonlySet<string> = new Set(["signup"])

/** POST /v1/signup's body. Shared with the unauthenticated route in app.ts. */
export const signupInput = z.object({
  email: z.email().describe("Address that claims the account; one claim email is sent to it"),
  name: z.string().trim().min(1).max(100).optional().describe("Display name"),
})

const actorType = (stored: string): "user" | "apiKey" => (stored === "apiKey" ? "apiKey" : "user")

const agentOutput = z.object({
  id: z.string(),
  type: z.enum(["oauthClient", "apiKey"]),
  clientId: z
    .string()
    .nullable()
    .describe("OAuth client id, as clientId on audit events; null for API keys"),
  keyId: z.string().nullable().describe("API key id, as actor.id on audit events; null for OAuth"),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  access: z.array(z.string()),
})

export function createOperations({ auth, db, meter }: { auth: Auth; db: Database; meter: Meter }) {
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
        actor:
          caller.actor.type === "user"
            ? { type: "user" as const, id: caller.actor.userId }
            : { type: "apiKey" as const, id: caller.actor.keyId },
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
    // With credentials the request is refused, whatever the input.
    examples: [{ input: { email: "agent@example.com" }, error: "BAD_REQUEST" }],
    // Served by the unauthenticated route in app.ts. Reached here only with credentials.
    handler: () => {
      throw new AppError("BAD_REQUEST", "Send signup without credentials", {
        hint: "Signup needs no API key or sign-in. Send the same request again without the Authorization and x-api-key headers.",
      })
    },
  })

  const list_projects = defineOperation({
    name: "list_projects",
    method: "GET",
    path: "/v1/projects",
    summary: "List the organization's projects",
    description:
      "Returns the organization's projects, oldest first, one page at a time. Pass nextCursor back " +
      "as cursor to get the next page; it is null on the last page. Use the ids with delete_project.",
    permissions: { project: ["read"] },
    input: paginationInput,
    output: paginated("projects", projectOutput),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const rows = await listProjects(db, org, proof, {
          after: readCursor(input.cursor),
          limit: input.limit + 1,
        })
        const { page, nextCursor } = cut(rows, input.limit, (p) => p.createdAt)
        return { projects: page.map(toOutput), nextCursor }
      }),
  })

  const create_project = defineOperation({
    name: "create_project",
    method: "POST",
    path: "/v1/projects",
    summary: "Create a project",
    description: "Creates a project in the caller's organization and returns it.",
    permissions: { project: ["create"] },
    input: z.object({ name: z.string().trim().min(1).max(100).describe("Project name") }),
    output: projectOutput,
    examples: [{ input: { name: "Website" } }],
    handler: ({ name: projectName }, { caller }) =>
      inCallerOrg(caller, async (org, proof) =>
        toOutput(await createProject(db, org, { name: projectName }, proof)),
      ),
  })

  const delete_project = defineOperation({
    name: "delete_project",
    method: "DELETE",
    path: "/v1/projects/:id",
    summary: "Delete a project",
    description:
      "Permanently deletes a project in the caller's organization. Returns NOT_FOUND for ids that " +
      "don't exist or belong to another organization. Confirm with the user before calling.",
    permissions: { project: ["delete"] },
    input: z.object({ id: z.string().describe("Project id from list_projects") }),
    output: z.object({ deleted: z.literal(true) }),
    hints: { destructive: true },
    examples: [{ input: { id: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, (org, actor) =>
        name(ProjectId(id), async (projectId) => {
          const inOrg = await projectInOrg(db, projectId, org)
          // Same answer for "missing" and "another org's": existence must not leak across tenants.
          if (!inOrg) throw new AppError("NOT_FOUND", "Project not found")
          await deleteProject(db, projectId, org, { inOrg, actor })
          return { deleted: true as const }
        }),
      ),
  })

  const create_api_key = defineOperation({
    name: "create_api_key",
    method: "POST",
    path: "/v1/api-keys",
    summary: "Create an organization API key",
    description:
      "Creates an API key for the caller's organization with the given permissions, which must be " +
      "within the caller's own. The key is returned once; store it securely. Only a signed-in user " +
      "(session or OAuth) can create keys, not another API key.",
    permissions: { apiKey: ["create"] },
    input: z.object({
      name: z.string().trim().min(1).max(100).describe("What the key is for"),
      permissions: permissionsInput.describe(
        'Permissions for the key, e.g. { "project": ["read"] }',
      ),
      expiresInDays: z.number().int().min(1).max(365).optional().describe("Omit for no expiry"),
    }),
    output: z.object({
      id: z.string(),
      key: z.string(),
      permissions: z.record(z.string(), z.array(z.string())),
    }),
    examples: [{ input: { name: "CI", permissions: { project: ["read"] }, expiresInDays: 90 } }],
    handler: async ({ name: keyName, permissions, expiresInDays }, { caller }) => {
      if (caller.actor.type !== "user") {
        throw new AppError("FORBIDDEN", "API keys can't create API keys; sign in as a user")
      }
      // Checked against the caller's effective grants (role ∩ credential), so a read-only OAuth
      // token can't mint a key with more than it has.
      if (!allowed(caller.grants, permissions)) {
        throw new AppError("FORBIDDEN", "A key can't have permissions its creator doesn't have")
      }
      const created = await auth.api.createApiKey({
        body: {
          organizationId: caller.organizationId,
          userId: caller.actor.userId,
          name: keyName,
          permissions,
          expiresIn: expiresInDays ? expiresInDays * 86_400 : undefined,
        },
      })
      return { id: created.id, key: created.key, permissions }
    },
  })

  const list_connected_agents = defineOperation({
    name: "list_connected_agents",
    method: "GET",
    path: "/v1/agents",
    summary: "List the agents connected to this organization",
    description:
      "Lists the organization's API keys and the OAuth clients (AI tools, CLIs) that hold consent or " +
      "a live refresh token for it. Each has an id for revoke_agent_access. Use it to audit access " +
      "before revoking. An OAuth client only shows while it holds a refresh token or consent.",
    // Admin-level, like revoking: the list names OAuth clients and their scopes, which members and
    // read-scoped tokens shouldn't enumerate.
    permissions: { apiKey: ["delete"] },
    input: z.object({}),
    output: z.object({ agents: z.array(agentOutput) }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => ({
        agents: await listConnectedAgents(db, org, proof, new Date()),
      })),
  })

  const revoke_agent_access = defineOperation({
    name: "revoke_agent_access",
    method: "DELETE",
    path: "/v1/agents/:id",
    summary: "Revoke an agent's access to this organization",
    description:
      "Deletes an API key, or for an OAuth client removes its consent and refresh tokens for this " +
      "organization. Its tokens stop working immediately, including access tokens it already holds. " +
      "The client itself is not deleted. Returns NOT_FOUND " +
      "for ids that aren't connected to this organization. Confirm with the user before calling.",
    permissions: { apiKey: ["delete"] },
    input: z.object({ id: z.string().describe("Agent id from list_connected_agents") }),
    output: z.object({ revoked: z.literal(true) }),
    hints: { destructive: true },
    examples: [{ input: { id: "key_00000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const revoked = await revokeAgentAccess(db, org, proof, id, new Date())
        if (!revoked) throw new AppError("NOT_FOUND", "Agent not found")
        return { revoked: true as const }
      }),
  })

  const list_audit_events = defineOperation({
    name: "list_audit_events",
    method: "GET",
    path: "/v1/audit-events",
    summary: "List who did what in this organization",
    description:
      "Lists recorded writes and refusals in this organization, newest first: the actor (a user or " +
      "an API key), the OAuth client if any, the operation, its outcome and the request id. Pass " +
      "nextCursor back as cursor for older events; it is null on the last page. Requires an " +
      "organization admin.",
    permissions: { organization: ["update"] },
    input: paginationInput,
    output: paginated("events", auditEventOutput),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const rows = await listAuditEvents(db, org, proof, {
          after: readCursor(input.cursor),
          limit: input.limit + 1,
        })
        const { page, nextCursor } = cut(rows, input.limit, (e) => e.at)
        return {
          events: page.map((e) => ({
            id: e.id,
            at: e.at.toISOString(),
            actor: { type: actorType(e.actorType), id: e.actorId },
            clientId: e.clientId,
            operation: e.operation,
            outcome: e.outcome,
            requestId: e.requestId,
          })),
          nextCursor,
        }
      }),
  })

  return defineRegistry([
    whoami,
    signup,
    list_projects,
    create_project,
    delete_project,
    create_api_key,
    list_connected_agents,
    revoke_agent_access,
    list_audit_events,
  ])
}
