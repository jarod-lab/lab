import { defineRegistry } from "@starter/api"

import { type ApiNotifier, createApiNotifier } from "../notifications"
import { accountOperations } from "./account"
import { apiKeyOperations } from "./api-keys"
import { approvalOperations } from "./approvals"
import { auditOperations } from "./audit"
import { connectedAgentOperations } from "./connected-agents"
import { memberOperations } from "./members"
import { projectOperations } from "./projects"
import { runOperations } from "./runs"
import type { OperationDeps } from "./shared"
import { workspaceAgentOperations } from "./workspace-agents"

export { signupInput } from "./account"

/**
 * Every operation the API serves, one registry for REST, MCP, OpenAPI and llms.txt. The order here is
 * the order those documents list them in, so keep it stable.
 */
export function createOperations({
  auth,
  db,
  meter,
  now = () => new Date(),
  notifier = createApiNotifier({ auth, db }),
}: Omit<OperationDeps, "now" | "notifier"> & {
  /** The clock: approval windows and timestamps read it, so tests can move time. */
  now?: () => Date
  /** Defaults to the notifier over `auth` and `db`; tests pass one that fails, or reports elsewhere. */
  notifier?: ApiNotifier
}) {
  const deps: OperationDeps = { auth, db, meter, now, notifier }
  const account = accountOperations(deps)
  const projects = projectOperations(deps)
  const apiKeys = apiKeyOperations(deps)
  const connected = connectedAgentOperations(deps)
  const audit = auditOperations(deps)
  const workspace = workspaceAgentOperations(deps)
  const runs = runOperations(deps)
  const approvals = approvalOperations(deps)
  const members = memberOperations(deps)

  return defineRegistry([
    account.whoami,
    account.signup,
    projects.list_projects,
    projects.create_project,
    projects.delete_project,
    apiKeys.create_api_key,
    apiKeys.list_api_keys,
    connected.list_connected_agents,
    connected.revoke_agent_access,
    audit.list_audit_events,
    workspace.list_agents,
    workspace.get_agent,
    workspace.create_agent,
    workspace.update_agent,
    workspace.delete_agent,
    runs.start_run,
    runs.list_runs,
    runs.get_run,
    runs.update_run,
    runs.append_run_step,
    runs.update_run_step,
    approvals.request_approval,
    approvals.decide_approval,
    approvals.undo_approval,
    runs.steer_run,
    runs.defer_run,
    approvals.get_inbox,
    members.list_member_security,
    members.reset_member_two_factor,
  ])
}
