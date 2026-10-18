import {
  allowed,
  type Caller,
  decodeCursor,
  defineRegistry,
  encodeCursor,
  operationsFor,
  paginated,
  paginationInput,
} from "@starter/api"
import { type Auth, type Catalog, PERSON_ONLY_RESOURCES, statements } from "@starter/auth"
import {
  AgentId,
  agentInOrg,
  ApprovalId,
  approvalInOrg,
  memberInOrg,
  name,
  ProjectId,
  projectInOrg,
  RunId,
  runInOrg,
  UserId,
} from "@starter/auth-proofs"
import type { Database } from "@starter/db"
import { AppError } from "@starter/errors"
import { z } from "zod"

import { listConnectedAgents, revokeAgentAccess } from "./data/connected-agents"
import { listAuditEvents } from "./data/audit"
import {
  type Agent,
  type AgentActivity,
  AUTONOMY,
  type Autonomy,
  agentActivity,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "./data/agents"
import { creatorOf, listApiKeys } from "./data/api-keys"
import { listMemberSecurity, resetMemberTwoFactor } from "./data/members"
import { createProject, deleteProject, listProjects } from "./data/projects"
import {
  appendRunStep,
  approvalView,
  countPendingApprovals,
  decideApproval,
  deferRun,
  getRunBundle,
  listRuns,
  RUN_STATUSES,
  type Run,
  requestApproval,
  type RunStep,
  STEP_STATUSES,
  startRun,
  steerRun,
  undoApproval,
  updateRun,
  updateRunStep,
} from "./data/runs"
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
  // `?cursor=` (empty), as forms and URL templates send it, means the first page like no cursor.
  if (cursor === undefined || cursor === "") return undefined
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

// ---- Workspace agents and runs: shapes and helpers --------------------------------------------

const agentSettingsInput = z.object({
  name: z.string().trim().min(1).max(100).describe("Name shown in the sidebar and the run list"),
  description: z.string().trim().max(500).nullable().optional().describe("What the agent does"),
  autonomy: z
    .enum(AUTONOMY)
    .optional()
    .describe(
      "suggest_only: it suggests and waits; ask_first: it works, then waits for approval before " +
        "anything leaves the organization; autonomous: it acts, asking only for the always-ask actions",
    ),
  alwaysAskExternalPost: z
    .boolean()
    .optional()
    .describe(
      "Posting outside the organization (guest Slack channels, email, public issues) always asks",
    ),
  alwaysAskMergeOrDeploy: z
    .boolean()
    .optional()
    .describe("Merging or deploying code always asks; agents may open pull requests"),
  alwaysAskOverEnergyBudget: z
    .boolean()
    .optional()
    .describe("Going past the run's energy budget pauses and asks instead of continuing"),
  energyBudgetWh: z
    .number()
    .positive()
    .max(1_000_000)
    .nullable()
    .optional()
    .describe("Energy budget per run, in watt-hours; null for none"),
  pinned: z.boolean().optional().describe("Pin to the sidebar"),
})

const workspaceAgentOutput = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  autonomy: z.enum(AUTONOMY),
  alwaysAskExternalPost: z.boolean(),
  alwaysAskMergeOrDeploy: z.boolean(),
  alwaysAskOverEnergyBudget: z.boolean(),
  energyBudgetWh: z.number().nullable(),
  pinned: z.boolean(),
  activity: z
    .enum(["running", "needs_you", "queued", "idle"])
    .describe("What the agent is doing now, from its open runs"),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const toAgentOutput = (r: Agent, activity: AgentActivity) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  autonomy: r.autonomy as Autonomy,
  alwaysAskExternalPost: r.alwaysAskExternalPost,
  alwaysAskMergeOrDeploy: r.alwaysAskMergeOrDeploy,
  alwaysAskOverEnergyBudget: r.alwaysAskOverEnergyBudget,
  energyBudgetWh: r.energyBudgetWh,
  pinned: r.pinned,
  activity,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

const footprintOutput = z.object({
  energyWh: z.number().describe("Energy the run has used so far, estimated, in watt-hours"),
  tokens: z.number().int(),
  toolCalls: z.number().int(),
})

const runSummaryOutput = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  status: z.enum(RUN_STATUSES),
  summary: z.string().nullable().describe("Markdown"),
  startedBy: z.object({ type: z.enum(["user", "apiKey"]), id: z.string() }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  deferredUntil: z.string().nullable().describe("Set while the run is deferred (status queued)"),
  durationMs: z.number().int().nullable().describe("Start to finish, or to now while it runs"),
  footprint: footprintOutput,
})

const runDetailFootprint = footprintOutput.extend({
  energyBudgetWh: z.number().nullable().describe("The agent's energy budget; null when unset"),
})

const stepInput = z.object({
  kind: z.string().trim().min(1).max(40).describe("Free-form category, e.g. collect, draft, test"),
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(2000).nullable().optional(),
  status: z.enum(["queued", "running", "done", "failed"]).optional().describe("Defaults to queued"),
  progressDone: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("With progressTotal: 38 of 61"),
  progressTotal: z.number().int().min(0).nullable().optional(),
})

const stepOutputSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  kind: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  status: z.enum(STEP_STATUSES),
  progressDone: z.number().int().nullable(),
  progressTotal: z.number().int().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
})

const approvalOutputSchema = z.object({
  id: z.string(),
  stepId: z.string().nullable(),
  action: z.string().describe("The exact action, in words"),
  detail: z.string().nullable(),
  requestedAt: z.string(),
  status: z
    .enum(["pending", "approved", "denied"])
    .describe("For an agent: pending until the decision takes effect"),
  decision: z
    .object({
      decidedBy: z.string().nullable(),
      decidedAt: z.string().nullable(),
      effectiveAt: z.string().nullable(),
      undoableUntil: z.string().nullable().describe("Until when undo_approval works"),
    })
    .nullable()
    .describe("Shown to people only; null for agents"),
})

const messageOutput = z.object({
  id: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
})

const durationMs = (start: Date | null, end: Date | null, at: Date): number | null =>
  start ? (end ?? at).getTime() - start.getTime() : null

const runSummary = (r: Run, at: Date) => ({
  id: r.id,
  agentId: r.agentId,
  title: r.title,
  status: r.status as (typeof RUN_STATUSES)[number],
  summary: r.summary,
  startedBy:
    r.startedByType && r.startedById
      ? { type: actorType(r.startedByType), id: r.startedById }
      : null,
  createdAt: r.createdAt.toISOString(),
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  deferredUntil: r.deferredUntil?.toISOString() ?? null,
  durationMs: durationMs(r.startedAt, r.finishedAt, at),
  footprint: { energyWh: r.energyWh, tokens: r.tokens, toolCalls: r.toolCalls },
})

const stepOutput = (s: RunStep, at: Date) => ({
  id: s.id,
  position: s.position,
  kind: s.kind,
  title: s.title,
  detail: s.detail,
  status: s.status as (typeof STEP_STATUSES)[number],
  progressDone: s.progressDone,
  progressTotal: s.progressTotal,
  startedAt: s.startedAt?.toISOString() ?? null,
  finishedAt: s.finishedAt?.toISOString() ?? null,
  durationMs: durationMs(s.startedAt, s.finishedAt, at),
})

/** Who is calling, as a run's startedBy records it. */
const actorOf = (caller: Caller): { type: "user" | "apiKey"; id: string } =>
  caller.actor.type === "user"
    ? { type: "user", id: caller.actor.userId }
    : { type: "apiKey", id: caller.actor.keyId }

/** People see decisions; agents (keys, AI clients) see approvals only as pending until effective. */
const viewerOf = (caller: Caller): "person" | "agent" =>
  caller.via === "session" ? "person" : "agent"

/** Only a person signed in to the web app decides approvals: never a key, never an OAuth token. */
function requirePerson(caller: Caller): void {
  if (caller.via !== "session" || caller.actor.type !== "user") {
    throw new AppError("FORBIDDEN", "Only a person can decide an approval", {
      hint: "Open the run in the web app and decide there. API keys and AI clients can't approve.",
    })
  }
}

export function createOperations({
  auth,
  db,
  meter,
  now = () => new Date(),
}: {
  auth: Auth
  db: Database
  meter: Meter
  /** The clock: approval windows and timestamps read it, so tests can move time. */
  now?: () => Date
}) {
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
      // Owner-only and billing resources, and deciding approvals, are for people: a key never holds them.
      const restricted = Object.keys(permissions).filter((r) =>
        (PERSON_ONLY_RESOURCES as readonly string[]).includes(r),
      )
      if (restricted.length > 0 || permissions.run?.includes("approve")) {
        throw new AppError(
          "FORBIDDEN",
          "A key can't hold owner-only permissions or approve actions",
          {
            hint: "Keys can't have sso, scim, subscription or twoFactor permissions, or run:approve. Those are for a person signed in to the web app (owners, and admins for subscription).",
          },
        )
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
          metadata: { createdBy: await creatorOf(db, caller.actor.userId) },
        },
      })
      return { id: created.id, key: created.key, permissions }
    },
  })

  const list_api_keys = defineOperation({
    name: "list_api_keys",
    method: "GET",
    path: "/v1/api-keys",
    summary: "List the organization's API keys (masked)",
    description:
      "Lists the organization's API keys, newest first: id, name, the masked start of the key (for telling " +
      "keys apart; the key itself is never shown again), its permissions, when it was created and who created " +
      "it (null for keys made before that was recorded), when it was last used, and when it expires (null for " +
      "no expiry). Use the id with revoke_agent_access to delete a key. Needs apiKey:read.",
    permissions: { apiKey: ["read"] },
    input: z.object({}),
    output: z.object({
      keys: z.array(
        z.object({
          id: z.string(),
          name: z.string().nullable(),
          start: z
            .string()
            .nullable()
            .describe("The first characters of the key, masked for display"),
          permissions: z.record(z.string(), z.array(z.string())),
          createdAt: z.string(),
          createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
          lastUsedAt: z.string().nullable(),
          expiresAt: z.string().nullable(),
        }),
      ),
    }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => ({
        keys: (await listApiKeys(db, org, proof)).map((k) => ({
          id: k.id,
          name: k.name,
          start: k.start,
          permissions: k.permissions,
          createdAt: k.createdAt.toISOString(),
          createdBy: k.createdBy,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
        })),
      })),
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

  // ---- Workspace agents and their runs -------------------------------------------------------

  const runDetailOutput = runSummaryOutput.extend({
    footprint: runDetailFootprint,
    steps: z.array(stepOutputSchema),
    approvals: z.array(approvalOutputSchema),
    messages: z.array(messageOutput),
  })

  const agentRef = z.object({ id: z.string().describe("Workspace agent id from list_agents") })
  const runRef = z.object({ id: z.string().describe("Run id from list_runs or start_run") })
  const approvalRef = z.object({ id: z.string().describe("Approval id from get_run") })

  const list_agents = defineOperation({
    name: "list_agents",
    method: "GET",
    path: "/v1/workspace-agents",
    summary: "List the workspace agents and what each is doing",
    description:
      "Lists the workers this organization has configured (for example a release-triage agent), with " +
      "their settings and what each is doing now: running, needs_you (waiting for an approval), queued " +
      "or idle. These are not the AI clients connected to the organization (those are list_connected_agents, " +
      "which lists credentials). Use an id with get_agent, start_run or list_runs.",
    permissions: { agent: ["read"] },
    input: z.object({}),
    output: z.object({ agents: z.array(workspaceAgentOutput) }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const rows = await listAgents(db, org, proof)
        const activity = await agentActivity(
          db,
          org,
          proof,
          rows.map((r) => r.id),
        )
        return { agents: rows.map((r) => toAgentOutput(r, activity.get(r.id) ?? "idle")) }
      }),
  })

  const get_agent = defineOperation({
    name: "get_agent",
    method: "GET",
    path: "/v1/workspace-agents/:id",
    summary: "Get one workspace agent and its settings",
    description:
      "Returns one workspace agent: its name, autonomy, the actions that always need a person's approval, " +
      "its energy budget, whether it is pinned, and what it is doing now. Returns NOT_FOUND for ids " +
      "outside this organization. Use the id with update_agent, start_run or list_runs.",
    permissions: { agent: ["read"] },
    input: agentRef,
    output: workspaceAgentOutput,
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: { id: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, (org, proof) =>
        name(AgentId(id), async (agentId) => {
          const inOrg = await agentInOrg(db, agentId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Agent not found")
          const row = await getAgent(db, agentId, org, inOrg)
          if (!row) throw new AppError("NOT_FOUND", "Agent not found")
          const activity = await agentActivity(db, org, proof, [id])
          return toAgentOutput(row, activity.get(id) ?? "idle")
        }),
      ),
  })

  const create_agent = defineOperation({
    name: "create_agent",
    method: "POST",
    path: "/v1/workspace-agents",
    summary: "Create a workspace agent",
    description:
      "Creates a workspace agent in the caller's organization. Defaults: ask_first autonomy, and the three " +
      "always-ask actions on. Start its work with start_run. Returns the agent.",
    permissions: { agent: ["create"] },
    input: agentSettingsInput,
    output: workspaceAgentOutput,
    examples: [{ input: { name: "Release triage", description: "Groups release blockers" } }],
    handler: (input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const row = await createAgent(db, org, proof, input, now())
        return toAgentOutput(row, "idle")
      }),
  })

  const update_agent = defineOperation({
    name: "update_agent",
    method: "PATCH",
    path: "/v1/workspace-agents/:id",
    summary: "Change a workspace agent's settings",
    description:
      "Changes the given settings of a workspace agent: name, description, autonomy, the three always-ask " +
      "actions, the energy budget, and pinned. Omitted settings stay as they are. Returns the agent, or " +
      "NOT_FOUND for ids outside this organization. Changing autonomy or the always-ask actions changes what " +
      "agents may do without asking: confirm with the user first.",
    permissions: { agent: ["update"] },
    input: agentRef.extend(agentSettingsInput.partial().shape),
    output: workspaceAgentOutput,
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", pinned: true },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, ...patch }, { caller }) =>
      inCallerOrg(caller, (org, proof) =>
        name(AgentId(id), async (agentId) => {
          const inOrg = await agentInOrg(db, agentId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Agent not found")
          const row = await updateAgent(db, agentId, org, { inOrg, actor: proof }, patch, now())
          if (!row) throw new AppError("NOT_FOUND", "Agent not found")
          const activity = await agentActivity(db, org, proof, [id])
          return toAgentOutput(row, activity.get(id) ?? "idle")
        }),
      ),
  })

  const delete_agent = defineOperation({
    name: "delete_agent",
    method: "DELETE",
    path: "/v1/workspace-agents/:id",
    summary: "Delete a workspace agent and all of its runs",
    description:
      "Permanently deletes a workspace agent together with its runs, their steps, approvals and messages. " +
      "Returns NOT_FOUND for ids outside this organization. Confirm with the user before calling: the " +
      "history can't be recovered.",
    permissions: { agent: ["delete"] },
    input: agentRef,
    output: z.object({ deleted: z.literal(true) }),
    hints: { destructive: true },
    examples: [{ input: { id: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, (org, proof) =>
        name(AgentId(id), async (agentId) => {
          const inOrg = await agentInOrg(db, agentId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Agent not found")
          await deleteAgent(db, agentId, org, { inOrg, actor: proof })
          return { deleted: true as const }
        }),
      ),
  })

  const start_run = defineOperation({
    name: "start_run",
    method: "POST",
    path: "/v1/workspace-agents/:id/runs",
    summary: "Start a run of a workspace agent",
    description:
      "Queues a new run of a workspace agent with a title and an optional summary (Markdown). The run " +
      "starts as queued; the agent moves it to running with update_run, then adds steps with " +
      "append_run_step. Returns NOT_FOUND for agents outside this organization.",
    permissions: { run: ["create"] },
    input: agentRef.extend({
      title: z.string().trim().min(1).max(200).describe("What the run is for"),
      summary: z.string().trim().max(2000).optional().describe("Markdown, optional"),
    }),
    output: runSummaryOutput,
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", title: "v2.8 triage" },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, title, summary }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(AgentId(id), async (agentId) => {
          const inOrg = await agentInOrg(db, agentId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Agent not found")
          const row = await startRun(
            db,
            agentId,
            org,
            inOrg,
            { title, summary },
            actorOf(caller),
            now(),
          )
          return runSummary(row, now())
        }),
      ),
  })

  const list_runs = defineOperation({
    name: "list_runs",
    method: "GET",
    path: "/v1/runs",
    summary: "List runs, newest first",
    description:
      "Lists the organization's runs, newest first, one page at a time. Filter by agentId and by status " +
      "(queued, running, needs_you, done, failed). Pass nextCursor back as cursor for older runs; it is " +
      "null on the last page. Use an id with get_run for the steps, approvals and messages.",
    permissions: { run: ["read"] },
    input: paginationInput.extend({
      agentId: z.string().optional().describe("Only runs of this workspace agent"),
      status: z.enum(RUN_STATUSES).optional().describe("Only runs in this status"),
    }),
    output: paginated("runs", runSummaryOutput),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }, { input: { status: "needs_you" } }],
    handler: (input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        const rows = await listRuns(db, org, proof, {
          after: readCursor(input.cursor),
          agentId: input.agentId,
          status: input.status,
          limit: input.limit + 1,
        })
        const { page, nextCursor } = cut(rows, input.limit, (r) => r.createdAt)
        const at = now()
        return { runs: page.map((r) => runSummary(r, at)), nextCursor }
      }),
  })

  const get_run = defineOperation({
    name: "get_run",
    method: "GET",
    path: "/v1/runs/:id",
    summary: "Get a run with its steps, approvals, messages and footprint",
    description:
      "Returns one run: status, summary, timing, footprint (energy against the agent's budget, tokens, tool " +
      "calls), its ordered steps, the approvals it asked for and the messages people sent it. An approval " +
      "shows as pending until its decision takes effect, 30 seconds after it was made; then it shows " +
      "approved or denied. Agents must wait for that before acting. Returns NOT_FOUND for runs outside " +
      "this organization.",
    permissions: { run: ["read"] },
    input: runRef,
    output: runDetailOutput,
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: { id: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const bundle = await getRunBundle(db, runId, org, inOrg)
          if (!bundle) throw new AppError("NOT_FOUND", "Run not found")
          const at = now()
          const viewer = viewerOf(caller)
          return {
            ...runSummary(bundle.run, at),
            footprint: {
              ...runSummary(bundle.run, at).footprint,
              energyBudgetWh: bundle.energyBudgetWh,
            },
            steps: bundle.steps.map((s) => stepOutput(s, at)),
            approvals: bundle.approvals.map((a) => approvalView(a, at, viewer)),
            messages: bundle.messages.map((m) => ({
              id: m.id,
              body: m.body,
              authorId: m.authorId,
              createdAt: m.createdAt.toISOString(),
            })),
          }
        }),
      ),
  })

  const update_run = defineOperation({
    name: "update_run",
    method: "PATCH",
    path: "/v1/runs/:id",
    summary: "Report a run's status, summary and footprint (agent side)",
    description:
      "How an agent reports its run: set status to running, done or failed; set the summary (Markdown); " +
      "and report footprint totals so far (energyWh, tokens, toolCalls). Omitted fields stay. Refused with " +
      "CONFLICT while an approval still blocks the run: wait until get_run shows it approved or denied. " +
      "Finished runs take no more updates.",
    permissions: { run: ["update"] },
    input: runRef.extend({
      status: z.enum(["running", "done", "failed"]).optional(),
      summary: z.string().max(20_000).nullable().optional(),
      energyWh: z.number().min(0).max(1_000_000).optional(),
      tokens: z.number().int().min(0).max(1_000_000_000).optional(),
      toolCalls: z.number().int().min(0).max(1_000_000).optional(),
    }),
    output: runSummaryOutput,
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", status: "running" },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, ...patch }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const row = await updateRun(db, runId, org, inOrg, patch, now())
          if (!row) throw new AppError("NOT_FOUND", "Run not found")
          return runSummary(row, now())
        }),
      ),
  })

  const append_run_step = defineOperation({
    name: "append_run_step",
    method: "POST",
    path: "/v1/runs/:id/steps",
    summary: "Add a step to a run (agent side)",
    description:
      "Appends a step to a run, in order, so people see what the agent is doing: a kind (such as collect, " +
      "draft or test), a title, optional detail, and progress (progressDone of progressTotal). Status " +
      "defaults to queued. Change it later with update_run_step. Refused once the run has finished.",
    permissions: { run: ["update"] },
    input: runRef.extend(stepInput.shape),
    output: stepOutputSchema,
    examples: [
      {
        input: {
          id: "00000000-0000-0000-0000-000000000000",
          kind: "collect",
          title: "Collect blockers",
        },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, ...step }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const row = await appendRunStep(db, runId, org, inOrg, step, now())
          if (!row) throw new AppError("NOT_FOUND", "Run not found")
          return stepOutput(row, now())
        }),
      ),
  })

  const update_run_step = defineOperation({
    name: "update_run_step",
    method: "PATCH",
    path: "/v1/runs/:id/steps/:stepId",
    summary: "Change one step of a run (agent side)",
    description:
      "Updates a step's status, title, detail or progress: move it to running, then to done or failed. " +
      "A step waiting for a person is set by request_approval, not here. Returns NOT_FOUND for steps " +
      "that aren't part of this run.",
    permissions: { run: ["update"] },
    input: runRef.extend({
      stepId: z.string().describe("Step id from get_run"),
      title: z.string().trim().min(1).max(200).optional(),
      detail: z.string().max(2000).nullable().optional(),
      status: z.enum(["queued", "running", "done", "failed"]).optional(),
      progressDone: z.number().int().min(0).nullable().optional(),
      progressTotal: z.number().int().min(0).nullable().optional(),
    }),
    output: stepOutputSchema,
    examples: [
      {
        input: {
          id: "00000000-0000-0000-0000-000000000000",
          stepId: "00000000-0000-0000-0000-000000000001",
          status: "done",
        },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, stepId, ...patch }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const row = await updateRunStep(db, runId, stepId, org, inOrg, patch, now())
          if (!row) throw new AppError("NOT_FOUND", "Step not found")
          return stepOutput(row, now())
        }),
      ),
  })

  const request_approval = defineOperation({
    name: "request_approval",
    method: "POST",
    path: "/v1/runs/:id/approvals",
    summary: "Ask a person to approve an action before the run takes it",
    description:
      "Use before any action that needs a person's go-ahead, per the agent's always-ask settings (for example " +
      "posting outside the organization). Give the exact action in words (action) and the content it will " +
      "send (detail). The run moves to needs_you and the approval counts in the inbox. Do not take the action " +
      "until get_run shows it approved; a denied one must not be taken. stepId attaches it to an existing " +
      "step; otherwise the request creates a step for it.",
    permissions: { run: ["update"] },
    input: runRef.extend({
      action: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .describe('The exact action, e.g. "Post summary to #releases"'),
      detail: z
        .string()
        .max(20_000)
        .nullable()
        .optional()
        .describe("The content the action will send"),
      stepId: z.string().optional().describe("Attach to this step instead of creating one"),
    }),
    output: approvalOutputSchema,
    examples: [
      {
        input: {
          id: "00000000-0000-0000-0000-000000000000",
          action: "Post summary to #releases",
          detail: "v2.8 triage: 4 themes",
        },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, ...request }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const row = await requestApproval(db, runId, org, inOrg, request, now())
          if (!row) throw new AppError("NOT_FOUND", "Run or step not found")
          return approvalView(row, now(), "agent")
        }),
      ),
  })

  const decide_approval = defineOperation({
    name: "decide_approval",
    method: "POST",
    path: "/v1/approvals/:id/decision",
    summary: "Approve or deny an action (a person's decision)",
    description:
      "A person allows (approve) or refuses (deny) an action a run asked for. The decision takes effect 30 " +
      "seconds after it is made: until then the agent sees the approval as pending and must not act, and " +
      "undo_approval can reverse it. Only a person signed in to the web app can decide; API keys and AI " +
      "clients can't. Returns CONFLICT if the approval was already decided. Confirm the decision with the " +
      "user before calling.",
    permissions: { run: ["approve"] },
    input: approvalRef.extend({ decision: z.enum(["approve", "deny"]) }),
    output: approvalOutputSchema,
    hints: { destructive: true },
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", decision: "approve" },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, decision }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(ApprovalId(id), async (approvalId) => {
          requirePerson(caller)
          const inOrg = await approvalInOrg(db, approvalId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Approval not found")
          const row = await decideApproval(
            db,
            approvalId,
            org,
            inOrg,
            decision,
            caller.actor.type === "user" ? caller.actor.userId : "",
            now(),
          )
          return approvalView(row, now(), "person")
        }),
      ),
  })

  const undo_approval = defineOperation({
    name: "undo_approval",
    method: "POST",
    path: "/v1/approvals/:id/undo",
    summary: "Take back a decision within 30 seconds",
    description:
      "Undoes a decision (approve or deny) before it takes effect, returning the approval to pending. After " +
      "30 seconds the decision stands and this returns CONFLICT. Only a person signed in to the web app can undo.",
    permissions: { run: ["approve"] },
    input: approvalRef,
    output: approvalOutputSchema,
    examples: [{ input: { id: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(ApprovalId(id), async (approvalId) => {
          requirePerson(caller)
          const inOrg = await approvalInOrg(db, approvalId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Approval not found")
          const row = await undoApproval(db, approvalId, org, inOrg, now())
          return approvalView(row, now(), "person")
        }),
      ),
  })

  const steer_run = defineOperation({
    name: "steer_run",
    method: "POST",
    path: "/v1/runs/:id/messages",
    summary: "Send a message to a run",
    description:
      "Sends a message from a person to a run while it works: an instruction or a correction. The agent reads " +
      "it with get_run. Refused once the run has finished.",
    permissions: { run: ["steer"] },
    input: runRef.extend({
      body: z.string().trim().min(1).max(5000).describe("What to tell the agent"),
    }),
    output: messageOutput,
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", body: "Skip the billing item" },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, body }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const author = actorOf(caller).id
          const row = await steerRun(db, runId, org, inOrg, body, author, now())
          if (!row) throw new AppError("NOT_FOUND", "Run not found")
          return {
            id: row.id,
            body: row.body,
            authorId: row.authorId,
            createdAt: row.createdAt.toISOString(),
          }
        }),
      ),
  })

  const defer_run = defineOperation({
    name: "defer_run",
    method: "POST",
    path: "/v1/runs/:id/defer",
    summary: "Wait with a run until a later time",
    description:
      "Defers a run until a time (ISO 8601, after now): it shows as queued with that time, and the agent picks " +
      "it up after. Use it to run work in a low-carbon window or after hours. Refused once the run has finished.",
    permissions: { run: ["steer"] },
    input: runRef.extend({
      until: z.iso.datetime().describe("When the run may start again, e.g. 2026-10-17T02:00:00Z"),
    }),
    output: runSummaryOutput,
    examples: [
      {
        input: { id: "00000000-0000-0000-0000-000000000000", until: "2030-01-01T00:00:00Z" },
        error: "NOT_FOUND",
      },
    ],
    handler: ({ id, until }, { caller }) =>
      inCallerOrg(caller, (org) =>
        name(RunId(id), async (runId) => {
          const at = now()
          const when = new Date(until)
          if (when.getTime() <= at.getTime()) {
            throw new AppError("BAD_REQUEST", "defer_run needs a time in the future", {
              hint: "Pass an ISO 8601 time later than the current time.",
            })
          }
          const inOrg = await runInOrg(db, runId, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Run not found")
          const row = await deferRun(db, runId, org, inOrg, when)
          if (!row) throw new AppError("NOT_FOUND", "Run not found")
          return runSummary(row, at)
        }),
      ),
  })

  const get_inbox = defineOperation({
    name: "get_inbox",
    method: "GET",
    path: "/v1/inbox",
    summary: "Count the approvals waiting for a person",
    description:
      'Returns how many approvals in this organization wait for a decision: the "needs you" count in the ' +
      "sidebar and top bar. Only a person who can approve gets a count; for everyone else it is 0. Open the " +
      "runs with list_runs (status needs_you).",
    permissions: { run: ["read"] },
    input: z.object({}),
    output: z.object({ needsYou: z.number().int().min(0) }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        if (caller.via !== "session" || !allowed(caller.grants, { run: ["approve"] })) {
          return { needsYou: 0 }
        }
        return { needsYou: await countPendingApprovals(db, org, proof) }
      }),
  })

  const list_member_security = defineOperation({
    name: "list_member_security",
    method: "GET",
    path: "/v1/members/security",
    summary: "List members with their two-factor state and last activity",
    description:
      "Lists this organization's members with their role, whether two-factor sign-in is on, and when they were " +
      "last active. Last active is the person's latest session (sessions belong to people, not organizations). " +
      "For organization admins and owners. Owners can turn a member's two-factor off with reset_member_two_factor.",
    permissions: { member: ["read"] },
    input: z.object({}),
    output: z.object({
      members: z.array(
        z.object({
          userId: z.string(),
          name: z.string(),
          email: z.string(),
          role: z.string(),
          twoFactorEnabled: z.boolean(),
          lastActiveAt: z.string().nullable(),
        }),
      ),
    }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => ({
        members: (await listMemberSecurity(db, org, proof)).map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          twoFactorEnabled: m.twoFactorEnabled,
          lastActiveAt: m.lastActiveAt ? m.lastActiveAt.toISOString() : null,
        })),
      })),
  })

  const reset_member_two_factor = defineOperation({
    name: "reset_member_two_factor",
    method: "POST",
    path: "/v1/members/:userId/two-factor/reset",
    summary: "Turn off a member's two-factor sign-in (owners only)",
    description:
      "Removes a member's authenticator and backup codes and turns their two-factor sign-in off, so they sign in " +
      "without the second factor. Only an owner can do it, and not for themselves (they use their own security " +
      "settings). Audited. Returns NOT_FOUND for users who are not members of this organization. Confirm with " +
      "the user before calling.",
    permissions: { twoFactor: ["reset"] },
    input: z.object({
      userId: z.string().describe("The member's user id, from list_member_security"),
    }),
    output: z.object({ reset: z.literal(true) }),
    hints: { destructive: true },
    examples: [{ input: { userId: "00000000-0000-0000-0000-000000000000" }, error: "NOT_FOUND" }],
    handler: ({ userId }, { caller }) =>
      inCallerOrg(caller, (org, proof) =>
        name(UserId(userId), async (user) => {
          if (caller.actor.type === "user" && caller.actor.userId === userId) {
            throw new AppError("BAD_REQUEST", "You can't reset your own two-factor here", {
              hint: "Turn it off in your own security settings.",
            })
          }
          const inOrg = await memberInOrg(db, user, org)
          if (!inOrg) throw new AppError("NOT_FOUND", "Member not found")
          await resetMemberTwoFactor(db, user, org, { member: inOrg, actor: proof })
          return { reset: true as const }
        }),
      ),
  })

  return defineRegistry([
    whoami,
    signup,
    list_projects,
    create_project,
    delete_project,
    create_api_key,
    list_api_keys,
    list_connected_agents,
    revoke_agent_access,
    list_audit_events,
    list_agents,
    get_agent,
    create_agent,
    update_agent,
    delete_agent,
    start_run,
    list_runs,
    get_run,
    update_run,
    append_run_step,
    update_run_step,
    request_approval,
    decide_approval,
    undo_approval,
    steer_run,
    defer_run,
    get_inbox,
    list_member_security,
    reset_member_two_factor,
  ])
}
