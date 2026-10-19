import { z } from "zod"

import { listConnectedAgents, revokeAgentAccess } from "../data/connected-agents"
import { inCallerOrg, orNotFound } from "../tenant"
import { defineOperation, notifySafely, type OperationDeps, personUserId } from "./shared"

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

export function connectedAgentOperations({ db, notifier }: Pick<OperationDeps, "db" | "notifier">) {
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
    fresh: true,
    input: z.object({ id: z.string().describe("Agent id from list_connected_agents") }),
    output: z.object({ revoked: z.literal(true) }),
    hints: { destructive: true },
    examples: [{ input: { id: "key_00000000" }, error: "NOT_FOUND" }],
    handler: ({ id }, { caller }) =>
      inCallerOrg(caller, async (org, proof) => {
        // The notice names what was revoked, so read its name before the row is gone. Only the notice
        // depends on this read: if it fails, the notice falls back to the id.
        let clientName = id
        await notifySafely(async () => {
          const known = await listConnectedAgents(db, org, proof, new Date())
          clientName = known.find((a) => a.id === id)?.name ?? id
        })
        orNotFound(await revokeAgentAccess(db, org, proof, id, new Date()), "Agent")
        await notifySafely(() =>
          notifier.inOrg(org, proof, {
            type: "agent_access.revoked",
            clientName,
            // A key with apiKey:delete revokes too; it has no person to leave out.
            actorUserId: personUserId(caller),
          }),
        )
        return { revoked: true as const }
      }),
  })

  return {
    list_connected_agents,
    revoke_agent_access,
  }
}
