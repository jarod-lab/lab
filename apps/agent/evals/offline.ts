import { agentEnv } from "@lab/env/agent"
import { createHqClient, type HqClient } from "../agent/lib/hq/client.js"

/**
 * What the offline evals share: the real hq the harness started (`scripts/run.ts`), the probe that
 * records what the scripted agent did, and the clock that gives each eval an empty ledger day.
 * These evals run only through `pnpm eval`, which sets all of it; they carry the `offline` tag.
 */

export const OFFLINE_TAG = "offline"

const need = (name: "HQ_BASE_URL" | "HQ_AGENT_API_KEY" | "AGENT_PROBE_URL"): string => {
  const value = agentEnv(name)
  if (!value) {
    throw new Error(
      `${name} is not set: run the offline evals with \`pnpm --filter @lab/agent eval\`.`,
    )
  }
  return value
}

/** hq, as the agent's key sees it: the same client and scope the deployed agent has. */
export const hq = (): HqClient =>
  createHqClient({ baseUrl: need("HQ_BASE_URL"), apiKey: need("HQ_AGENT_API_KEY") })

/** Starts a fresh UTC day in hq (an empty ledger) and clears the probe. */
export async function freshDay(): Promise<void> {
  await fetch(`${need("AGENT_PROBE_URL")}/day/next`, { method: "POST" })
}

export interface ProbeEvent {
  event: string
  detail: unknown
}

/** What the scripted agent reported since the last `freshDay`: model calls, bigger-model runs. */
export async function probeEvents(): Promise<ProbeEvent[]> {
  const reply = await fetch(`${need("AGENT_PROBE_URL")}/events`)
  return ((await reply.json()) as { events: ProbeEvent[] }).events
}

/** Today's eve spend as hq reports it. */
export const allowance = () => hq().getSpendAllowance()

export interface RunRow {
  task: string
  runner: string
  outcome: string | null
  costUsd: number
  costEstimated: boolean
  summary: { worked: string[]; failed: string[]; stop: string[] } | null
}

/** The newest run hq logged, read with the agent's key (the day's runs start empty). */
export async function latestRun(): Promise<RunRow | undefined> {
  const reply = await fetch(`${need("HQ_BASE_URL")}/v1/runs`, {
    headers: { "x-api-key": need("HQ_AGENT_API_KEY") },
  })
  return ((await reply.json()) as { runs: RunRow[] }).runs[0]
}

/** hq's pending proposals, read with the agent's key. */
export async function pendingProposals(): Promise<
  { title: string; status: string; entryId: string | null }[]
> {
  const reply = await fetch(`${need("HQ_BASE_URL")}/v1/proposals?status=pending`, {
    headers: { "x-api-key": need("HQ_AGENT_API_KEY") },
  })
  return (
    (await reply.json()) as {
      proposals: { title: string; status: string; entryId: string | null }[]
    }
  ).proposals
}
