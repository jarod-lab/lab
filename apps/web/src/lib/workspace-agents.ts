// Pure helpers for the workspace agents page (the agent-permissions board). No network, no React.
import { z } from "zod"

import type {
  ActivityState,
  Autonomy,
  PermissionSettings,
  WorkspaceAgent,
} from "./workspace-agents-api"

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  suggest_only: "Suggest only",
  ask_first: "Ask first",
  autonomous: "Autonomous",
}

/** The board's copy under the autonomy control, per setting. */
export const AUTONOMY_HINT: Record<Autonomy, string> = {
  suggest_only: "It suggests the work and waits until you act on it yourself.",
  ask_first:
    "Agents do the work, then wait for your approval before anything leaves the workspace.",
  autonomous: "It acts on its own and only stops for the actions below.",
}

/** Status for a row: the shape and word the board uses. Idle shares the dashed mark with queued. */
export const ACTIVITY_STATUS: Record<
  ActivityState,
  { state: "running" | "needs-you" | "queued"; label: string }
> = {
  running: { state: "running", label: "Running" },
  needs_you: { state: "needs-you", label: "Needs you" },
  queued: { state: "queued", label: "Queued" },
  idle: { state: "queued", label: "Idle" },
}

/** The three actions that always wait for a person, in the board's order. */
export const ALWAYS_ASK = [
  {
    key: "alwaysAskExternalPost",
    label: "Post outside the organization",
    detail: "Slack channels with guests, email, public issues",
  },
  {
    key: "alwaysAskMergeOrDeploy",
    label: "Merge or deploy code",
    detail: "Agents can open pull requests but not merge them",
  },
  {
    key: "alwaysAskOverEnergyBudget",
    label: "Go over a run's energy budget",
    detail: "Pause and ask instead of continuing past the limit",
  },
] as const
/** The permission settings of an agent, as the board edits them. */
export function permissionsOf(agent: WorkspaceAgent): PermissionSettings {
  return {
    autonomy: agent.autonomy,
    alwaysAskExternalPost: agent.alwaysAskExternalPost,
    alwaysAskMergeOrDeploy: agent.alwaysAskMergeOrDeploy,
    alwaysAskOverEnergyBudget: agent.alwaysAskOverEnergyBudget,
  }
}

/** Only the settings that differ from the saved ones: the PATCH body. */
export function changedPermissions(
  saved: PermissionSettings,
  draft: PermissionSettings,
): Partial<PermissionSettings> {
  const patch: Partial<PermissionSettings> = {}
  if (draft.autonomy !== saved.autonomy) patch.autonomy = draft.autonomy
  for (const { key } of ALWAYS_ASK) {
    if (draft[key] !== saved[key]) patch[key] = draft[key]
  }
  return patch
}

/** "1 unsaved change", "2 unsaved changes", or null when nothing differs. */
export function unsavedCopy(saved: PermissionSettings, draft: PermissionSettings): string | null {
  const count = Object.keys(changedPermissions(saved, draft)).length
  if (count === 0) return null
  return count === 1 ? "1 unsaved change" : `${count} unsaved changes`
}

/** "1 run" or "3 runs". */
export function runsLabel(count: number): string {
  return count === 1 ? "1 run" : `${count} runs`
}

/** The delete consequence, in full. The count is shown only once it is known. */
export function deleteConsequence(name: string, runCount: number | undefined): string {
  if (runCount === undefined) {
    return `Deletes ${name} and its runs and their history. This can't be undone.`
  }
  return `Deletes ${name} and its ${runsLabel(runCount)} and their history. This can't be undone.`
}

/** The sidebar's pinned list: pinned agents only, each linking to its page with the agent selected. */
export function pinnedAgentsOf(agents: WorkspaceAgent[], slug: string) {
  return agents
    .filter((agent) => agent.pinned)
    .map((agent) => {
      const status = ACTIVITY_STATUS[agent.activity]
      return {
        id: agent.id,
        name: agent.name,
        href: agentHref(slug, agent.id),
        state: status.state,
        label: status.label,
      }
    })
}

/** The page's URL with one agent selected. */
export function agentHref(slug: string, agentId: string): string {
  return `/${slug}/settings/agents?agent=${encodeURIComponent(agentId)}`
}

/** The views of the agents settings page: the board's own tabs first, then the placeholders and connected agents. */
export const AGENT_VIEWS = ["permissions", "guardrails", "budgets", "connected"] as const
export type AgentView = (typeof AGENT_VIEWS)[number]

export function agentViewOf(value: unknown): AgentView {
  return AGENT_VIEWS.find((view) => view === value) ?? "permissions"
}

/** Name and description, for creating and renaming an agent. Only what create_agent and update_agent accept. */
export const agentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the agent a name, so people can tell it apart.")
    .max(100, "Use 100 characters or fewer."),
  description: z.string().trim().max(500, "Use 500 characters or fewer."),
})

export type AgentFormValues = z.infer<typeof agentFormSchema>

/** The energy budget field: empty means no budget, otherwise a positive number of watt-hours. */
export const energyBudgetSchema = z.object({
  energyBudgetWh: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (Number(value) > 0 && Number(value) <= 1_000_000),
      "Enter watt-hours above 0, or leave it empty for no budget.",
    ),
})

export type EnergyBudgetValues = z.infer<typeof energyBudgetSchema>

/** The PATCH value for a budget field: null clears it. */
export function energyBudgetPatch(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : Number(trimmed)
}

/** "0.6 Wh per run" or "No budget set". */
export function energyBudgetLabel(wh: number | null): string {
  return wh === null ? "No budget set" : `${wh} Wh per run`
}
