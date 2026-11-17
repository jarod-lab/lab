import { agentEnvList } from "@lab/env/agent"
import type { SessionAuthContext } from "eve/context"

/**
 * Who may talk to the agent in Slack, and what that does and does not grant.
 *
 * @remarks
 * A valid Slack signature proves Slack sent the event, not that the sender should reach the agent.
 * Eve identifies a person as `slack:<team>:<user>`; only a person from a workspace listed in
 * SLACK_ALLOWED_TEAM_IDS gets a turn, and with none listed nobody does (fail closed).
 *
 * A Slack turn is deliberately not stamped trusted (`stampTrusted`): a Slack Connect user from
 * another org carries the installation's team id, so the team check cannot tell them from a member.
 * Their turns can answer questions and propose brain entries (a founder decides those); anything
 * that writes to the repository still waits for an approval.
 */

/** Whether a principal id is a person (`slack:<team>:<user>`) from one of the allowed workspaces. */
export function isAllowedSlackPrincipal(principalId: string, teams: readonly string[]): boolean {
  const [scheme, team, user, ...rest] = principalId.split(":")
  return (
    scheme === "slack" &&
    team !== undefined &&
    team !== "" &&
    user !== undefined &&
    user !== "" &&
    rest.length === 0 &&
    teams.includes(team)
  )
}

/** The auth to run a turn under, or null when the sender may not start one. */
export function allowedSlackAuth(auth: SessionAuthContext | null): SessionAuthContext | null {
  if (auth === null) {
    return null
  }
  return isAllowedSlackPrincipal(auth.principalId, agentEnvList("SLACK_ALLOWED_TEAM_IDS"))
    ? auth
    : null
}
