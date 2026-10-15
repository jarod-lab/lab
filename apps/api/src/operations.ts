import { allowed, type Caller, defineRegistry, operationsFor } from "@starter/api"
import { type Auth, type Catalog, statements } from "@starter/auth"
import {
  type CallerActsFor,
  callerActsFor,
  type Named,
  name,
  OrganizationId,
  ProjectId,
  projectInOrg,
} from "@starter/auth-proofs"
import type { Database } from "@starter/db"
import { AppError } from "@starter/errors"
import { z } from "zod"

import { createProject, deleteProject, listProjects } from "./data/projects"

// Example operations. Each one is a REST route, an MCP tool, and an entry in openapi.json and
// llms.txt. Replace them with your product's; keep descriptions written for an agent reader.
// `permissions` is checked against the catalog in @starter/auth at compile time.
const defineOperation = operationsFor<Catalog>()

/** Run `fn` in the caller's organization, with the proof that tenant data access requires. */
function inCallerOrg<T>(
  caller: Caller,
  fn: <O>(org: Named<O, OrganizationId>, proof: CallerActsFor<O>) => Promise<T>,
): Promise<T> {
  return name(OrganizationId(caller.organizationId), (org) => {
    const proof = callerActsFor(caller, org)
    if (!proof) throw new AppError("FORBIDDEN", "Not acting for this organization")
    return fn(org, proof)
  })
}

const projectOutput = z.object({ id: z.string(), name: z.string(), createdAt: z.string() })
const toOutput = (p: { id: string; name: string; createdAt: Date }) => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt.toISOString(),
})

const catalog: Readonly<Record<string, readonly string[]>> = statements

/** `{ resource: [actions] }`, limited to the permission catalog. */
const permissionsInput = z
  .record(z.string(), z.array(z.string()).min(1))
  .refine(
    (p) =>
      Object.entries(p).every(([resource, actions]) =>
        actions.every((a) => catalog[resource]?.includes(a) ?? false),
      ),
    { message: "Unknown resource or action; see the permission catalog" },
  )

export function createOperations({ auth, db }: { auth: Auth; db: Database }) {
  const whoami = defineOperation({
    name: "whoami",
    method: "GET",
    path: "/v1/whoami",
    summary: "Show the caller, its organization and permissions",
    description:
      "Returns the organization this credential acts for, who is acting (a user or an API key), " +
      "how it authenticated, and its permission grants (a request is allowed when one grant " +
      "covers all of it). Call this first to check a credential.",
    permissions: {},
    input: z.object({}),
    output: z.object({
      organizationId: z.string(),
      actor: z.object({ type: z.enum(["user", "apiKey"]), id: z.string() }),
      via: z.string(),
      grants: z.array(z.record(z.string(), z.array(z.string()))),
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
        },
      },
    ],
    handler: (_input, { caller }) => ({
      organizationId: caller.organizationId,
      actor:
        caller.actor.type === "user"
          ? { type: "user" as const, id: caller.actor.userId }
          : { type: "apiKey" as const, id: caller.actor.keyId },
      via: caller.via,
      grants: caller.grants.map((g) =>
        Object.fromEntries(Object.entries(g).map(([r, a]) => [r, [...a]])),
      ),
    }),
  })

  const list_projects = defineOperation({
    name: "list_projects",
    method: "GET",
    path: "/v1/projects",
    summary: "List the organization's projects",
    description:
      "Returns every project in the caller's organization, oldest first. Use the ids with delete_project.",
    permissions: { project: ["read"] },
    input: z.object({}),
    output: z.object({ projects: z.array(projectOutput) }),
    hints: { readOnly: true, idempotent: true },
    examples: [{ input: {} }],
    handler: (_input, { caller }) =>
      inCallerOrg(caller, async (org, proof) => ({
        projects: (await listProjects(db, org, proof)).map(toOutput),
      })),
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

  return defineRegistry([whoami, list_projects, create_project, delete_project, create_api_key])
}
