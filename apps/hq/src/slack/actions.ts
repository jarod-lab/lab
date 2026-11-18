// A founder's click on a Slack card, decided by hq. The agent only forwards the request (raw body
// and Slack's headers, unchanged); hq verifies Slack's signature over exactly those bytes, maps the
// Slack user to a founder, and runs the decision as that founder. The agent's key is never involved:
// this path has no credential but Slack's signature and takes no key from the request.
import type { Database } from "@lab/db"
import { AppError } from "@lab/errors"

import { founderForSlackUser } from "../data/founders"
import { toPositiveUnits } from "../data/money"
import { decideProposal, getProposal } from "../data/proposals"
import { grantSpend } from "../data/spend"
import { slackActions } from "../db/schema"
import { verifySlackSignature } from "./verify"

export interface SlackActionRequest {
  /** The body exactly as Slack sent it (bytes, or the text they decode to). */
  rawBody: string | Uint8Array
  /** `X-Slack-Signature`. */
  signature: string
  /** `X-Slack-Request-Timestamp`. */
  timestamp: string
}

/** 200 done; 403 refused (not Slack, not a founder, malformed, not configured); 409 nothing changed. */
export interface SlackActionResult {
  status: 200 | 403 | 409
  text: string
}

export interface SlackActionDeps {
  db: Database
  now: () => Date
  /** The Slack app's signing secret. Unset: every click is refused. */
  signingSecret: string | undefined
  /** The one workspace whose clicks count. Unset: every click is refused. */
  teamId: string | undefined
}

/** The most one click may grant, in dollars (grant_spend itself allows more, to a signed-in founder). */
export const MAX_SLACK_GRANT_USD = 25

/**
 * What a card's button carries in its `action_id`. Proposal buttons name the proposal and the
 * version it was proposed against (`new` for a new entry); grant buttons name the request and the
 * amount in cents. The agent builds these (`agent/lib/slack/proposal-card.ts`); the two are held
 * together by a test.
 */
export type CardAction =
  | {
      kind: "proposal"
      decision: "approve" | "reject"
      proposalId: string
      baseVersion: number | null
    }
  | { kind: "grant"; approve: boolean; requestId: string; cents: number }

const ID = "[A-Za-z0-9_-]{1,64}"
const PROPOSAL_ACTION = new RegExp(`^hq_proposal_(approve|reject):(${ID}):(new|[1-9][0-9]{0,8})$`)
const GRANT_ACTION = new RegExp(`^hq_grant_(approve|deny):(${ID}):([1-9][0-9]{0,6})$`)

export function parseActionId(actionId: string): CardAction | null {
  const proposal = PROPOSAL_ACTION.exec(actionId)
  if (proposal) {
    const [, decision, proposalId = "", version = ""] = proposal
    return {
      kind: "proposal",
      decision: decision === "approve" ? "approve" : "reject",
      proposalId,
      baseVersion: version === "new" ? null : Number(version),
    }
  }
  const grant = GRANT_ACTION.exec(actionId)
  if (grant) {
    const [, verb, requestId = "", cents = ""] = grant
    return { kind: "grant", approve: verb === "approve", requestId, cents: Number(cents) }
  }
  return null
}

export const proposalActionId = (
  decision: "approve" | "reject",
  proposalId: string,
  baseVersion: number | null,
) => `hq_proposal_${decision}:${proposalId}:${baseVersion ?? "new"}`

export const grantActionId = (approve: boolean, requestId: string, cents: number) =>
  `hq_grant_${approve ? "approve" : "deny"}:${requestId}:${cents}`

const refuse = (text: string): SlackActionResult => ({ status: 403, text })
const unchanged = (text: string): SlackActionResult => ({ status: 409, text })

interface Click {
  teamId: string
  slackUserId: string
  actionId: string
  actionTs: string | null
}

/** The one click in a signed block_actions payload, or null when the payload is anything else. */
function readClick(rawBody: string | Uint8Array): Click | null {
  const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody)
  const payloadText = new URLSearchParams(text).get("payload")
  if (payloadText === null) return null
  let payload: unknown
  try {
    payload = JSON.parse(payloadText)
  } catch {
    return null
  }
  if (typeof payload !== "object" || payload === null) return null
  const p = payload as {
    type?: unknown
    team?: { id?: unknown }
    user?: { id?: unknown; team_id?: unknown }
    actions?: unknown
  }
  if (p.type !== "block_actions" || !Array.isArray(p.actions) || p.actions.length !== 1) return null
  const action = p.actions[0] as { action_id?: unknown; action_ts?: unknown }
  const teamId = p.team?.id ?? p.user?.team_id
  if (
    typeof teamId !== "string" ||
    typeof p.user?.id !== "string" ||
    typeof action.action_id !== "string"
  ) {
    return null
  }
  return {
    teamId,
    slackUserId: p.user.id,
    actionId: action.action_id,
    actionTs: typeof action.action_ts === "string" ? action.action_ts : null,
  }
}

/**
 * Handle a forwarded Slack click. Returns what to tell the founder; changes state only for a click
 * that is signed by Slack, from the configured workspace, by a founder, on a card that is current
 * and undecided. Everything else is refused (403) or leaves the world as it was (409).
 */
export function createSlackActionHandler(deps: SlackActionDeps) {
  const { db, now } = deps

  return async function handleSlackAction(req: SlackActionRequest): Promise<SlackActionResult> {
    // Fail closed: without the secret and the workspace nothing can be told from a forgery.
    if (!deps.signingSecret || !deps.teamId) {
      return refuse("Slack approvals are not configured on this hq.")
    }
    const verified = verifySlackSignature({
      rawBody: req.rawBody,
      signature: req.signature,
      timestamp: req.timestamp,
      secret: deps.signingSecret,
      now: now(),
    })
    if (!verified.ok) return refuse("This request was not signed by Slack.")

    // From here the bytes are Slack's. What they say is still checked: who, where, and what.
    const click = readClick(req.rawBody)
    if (!click) return refuse("This is not a card button click.")
    if (click.teamId !== deps.teamId) return refuse("This click is from another workspace.")
    const action = parseActionId(click.actionId)
    if (!action) return refuse("This is not one of hq's buttons.")

    const founder = await founderForSlackUser(db, click.slackUserId)
    if (!founder) return refuse("Only a founder can decide this.")

    try {
      return action.kind === "proposal"
        ? await decideCard(action, founder.userId)
        : await decideGrant(action, founder.userId, click)
    } catch (error) {
      // The same refusals decide_proposal gives (CONFLICT: decided, or the entry moved on).
      if (error instanceof AppError && (error.code === "CONFLICT" || error.code === "NOT_FOUND")) {
        return unchanged(error.message)
      }
      throw error
    }
  }

  async function decideCard(
    action: Extract<CardAction, { kind: "proposal" }>,
    userId: string,
  ): Promise<SlackActionResult> {
    const proposal = await getProposal(db, action.proposalId)
    // The card names the version it was proposed against: a card for any other is out of date.
    if (proposal.baseVersion !== action.baseVersion) {
      return unchanged("This card is out of date: the proposal is for another version.")
    }
    const decision = await decideProposal(db, {
      proposalId: action.proposalId,
      decision: action.decision,
      note: "Decided in Slack",
      decidedBy: userId,
      now: now(),
    })
    return {
      status: 200,
      text:
        decision.status === "approved"
          ? `Approved: ${proposal.title}`
          : `Rejected: ${proposal.title}`,
    }
  }

  async function decideGrant(
    action: Extract<CardAction, { kind: "grant" }>,
    userId: string,
    click: Click,
  ): Promise<SlackActionResult> {
    if (action.cents > MAX_SLACK_GRANT_USD * 100) {
      return refuse(`A click can grant at most $${MAX_SLACK_GRANT_USD}.`)
    }
    const at = now()
    // The key and the grant go in together: a replay finds the key and grants nothing.
    return db.transaction(async (tx) => {
      const claimed = await tx
        .insert(slackActions)
        .values({
          key: `grant:${action.requestId}`,
          outcome: action.approve ? "grant" : "deny",
          slackUserId: click.slackUserId,
          userId,
          actionTs: click.actionTs,
          createdAt: at,
        })
        .onConflictDoNothing()
        .returning({ key: slackActions.key })
      if (claimed.length === 0) return unchanged("This request was already decided.")
      if (!action.approve) return { status: 200 as const, text: "Dismissed: nothing was granted." }
      const dollars = action.cents / 100
      await grantSpend(tx, {
        amount: toPositiveUnits(dollars, "amount"),
        reason: `Slack approval ${action.requestId}`,
        grantedBy: userId,
        now: at,
      })
      return { status: 200 as const, text: `Granted $${dollars.toFixed(2)} for today.` }
    })
  }
}
