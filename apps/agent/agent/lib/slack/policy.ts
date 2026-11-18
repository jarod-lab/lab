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

/** Whether a principal is a listed founder (AGENT_FOUNDER_PRINCIPALS). None listed: nobody is. */
export function isFounderPrincipal(principalId: string): boolean {
  return agentEnvList("AGENT_FOUNDER_PRINCIPALS").includes(principalId)
}

/**
 * The auth an approval or question answer is admitted under, or null to reject it and leave the
 * request open. Only a listed founder who also passes the workspace check gets through, so a
 * non-founder can neither approve nor deny anything in Slack. This is a ceiling, not the whole
 * rule: it is set once on the channel because eve has no agent-wide response policy, and it
 * combines with each tool's own response policy. Tools with no policy of their own (a repository
 * write, the ship gate) keep eve's default, "only the person whose turn requested the call can
 * answer it", so a founder can approve only a write they asked for themselves; a non-founder's
 * request can never be approved in Slack and stays open until withdrawn. That fails closed.
 * `request_bigger_model` has its own founder policy, so any founder may approve that one.
 * Open for P0 and Task 8: accept "founders ask and approve their own", or give the write and ship
 * tools a founder `response` policy.
 */
export function founderAnswerAuth(auth: SessionAuthContext | null): SessionAuthContext | null {
  const allowed = allowedSlackAuth(auth)
  return allowed !== null && isFounderPrincipal(allowed.principalId) ? allowed : null
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
