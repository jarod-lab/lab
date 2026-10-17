import { describe, expect, it } from "vitest"

import {
  ACTIVITY_STATUS,
  agentFormSchema,
  agentHref,
  agentViewOf,
  changedPermissions,
  deleteConsequence,
  pinnedAgentsOf,
  runsLabel,
  unsavedCopy,
} from "./workspace-agents"
import type { PermissionSettings, WorkspaceAgent } from "./workspace-agents-api"

const saved: PermissionSettings = {
  autonomy: "ask_first",
  alwaysAskExternalPost: true,
  alwaysAskMergeOrDeploy: true,
  alwaysAskOverEnergyBudget: true,
}

function agent(overrides: Partial<WorkspaceAgent> = {}): WorkspaceAgent {
  return {
    id: "agent-1",
    name: "Release triage",
    description: null,
    ...saved,
    energyBudgetWh: null,
    pinned: false,
    activity: "idle",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("changedPermissions", () => {
  it("sends only the fields that differ", () => {
    expect(changedPermissions(saved, saved)).toEqual({})
    expect(
      changedPermissions(saved, {
        ...saved,
        autonomy: "autonomous",
        alwaysAskMergeOrDeploy: false,
      }),
    ).toEqual({ autonomy: "autonomous", alwaysAskMergeOrDeploy: false })
  })

  it("counts unsaved changes in words", () => {
    expect(unsavedCopy(saved, saved)).toBeNull()
    expect(unsavedCopy(saved, { ...saved, alwaysAskExternalPost: false })).toBe("1 unsaved change")
    expect(
      unsavedCopy(saved, { ...saved, alwaysAskExternalPost: false, autonomy: "suggest_only" }),
    ).toBe("2 unsaved changes")
  })
})

describe("status", () => {
  it("draws idle with the dashed queued mark and the word Idle", () => {
    expect(ACTIVITY_STATUS.idle).toEqual({ state: "queued", label: "Idle" })
    expect(ACTIVITY_STATUS.needs_you).toEqual({ state: "needs-you", label: "Needs you" })
  })
})

describe("delete consequence", () => {
  it("names the runs and their history, and the count once known", () => {
    expect(deleteConsequence("Release triage", 3)).toBe(
      "Deletes Release triage and its 3 runs and their history. This can't be undone.",
    )
    expect(deleteConsequence("Release triage", undefined)).toContain("its runs and their history")
    expect(runsLabel(1)).toBe("1 run")
  })
})

describe("pinned agents", () => {
  it("lists only pinned agents, each linking to the page with that agent selected", () => {
    const pinned = pinnedAgentsOf(
      [
        agent({ id: "a", pinned: true, activity: "needs_you" }),
        agent({ id: "b", pinned: false }),
        agent({ id: "c", name: "Docs", pinned: true, activity: "idle" }),
      ],
      "acme",
    )
    expect(pinned).toEqual([
      {
        id: "a",
        name: "Release triage",
        href: "/acme/settings/agents?agent=a",
        state: "needs-you",
        label: "Needs you",
      },
      {
        id: "c",
        name: "Docs",
        href: "/acme/settings/agents?agent=c",
        state: "queued",
        label: "Idle",
      },
    ])
    expect(agentHref("acme", "a b")).toBe("/acme/settings/agents?agent=a%20b")
  })
})

describe("views", () => {
  it("falls back to the permissions view for anything unknown", () => {
    expect(agentViewOf("connected")).toBe("connected")
    expect(agentViewOf("nonsense")).toBe("permissions")
    expect(agentViewOf(undefined)).toBe("permissions")
  })
})

describe("agentFormSchema", () => {
  it("requires a name and trims both fields", () => {
    expect(agentFormSchema.safeParse({ name: "   ", description: "" }).success).toBe(false)
    expect(agentFormSchema.parse({ name: " Release triage ", description: " x " })).toEqual({
      name: "Release triage",
      description: "x",
    })
    expect(agentFormSchema.safeParse({ name: "a".repeat(101), description: "" }).success).toBe(
      false,
    )
    expect(agentFormSchema.safeParse({ name: "a", description: "d".repeat(501) }).success).toBe(
      false,
    )
  })
})
