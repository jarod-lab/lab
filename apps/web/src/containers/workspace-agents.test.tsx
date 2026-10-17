// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { OrgSettingsApi } from "../lib/org-settings-api"
import type { WorkspaceAgent, WorkspaceAgentsApi } from "../lib/workspace-agents-api"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { WorkspaceAgentsContainer } from "./workspace-agents"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }

// The catalog as the server states it: owner and admin hold every agent action, member creates and
// updates (not delete), viewer reads.
const ALLOWED: Record<string, string[]> = {
  owner: ["agent:create", "agent:read", "agent:update", "agent:delete", "run:read"],
  admin: ["agent:create", "agent:read", "agent:update", "agent:delete", "run:read"],
  member: ["agent:create", "agent:read", "agent:update", "run:read"],
  viewer: ["agent:read", "run:read"],
}

const settings = {
  roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
    const granted = ALLOWED[role] ?? []
    return Object.entries(permissions).every(([resource, actions]) =>
      actions.every((action) => granted.includes(`${resource}:${action}`)),
    )
  }),
} as unknown as Pick<OrgSettingsApi, "roleAllows">

const releaseTriage: WorkspaceAgent = {
  id: "agent-1",
  name: "Release triage",
  description: "Groups release blockers",
  autonomy: "ask_first",
  alwaysAskExternalPost: true,
  alwaysAskMergeOrDeploy: true,
  alwaysAskOverEnergyBudget: true,
  energyBudgetWh: null,
  pinned: false,
  activity: "needs_you",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
}

function fakeAgentsApi(overrides: Partial<WorkspaceAgentsApi> = {}): WorkspaceAgentsApi {
  return {
    list: vi.fn(async () => [releaseTriage]),
    create: vi.fn(async (_org, input) => ({ ...releaseTriage, id: "agent-2", name: input.name })),
    update: vi.fn(async (_org, id, patch) => ({ ...releaseTriage, id, ...patch })),
    remove: vi.fn(async () => undefined),
    countRuns: vi.fn(async () => 3),
    ...overrides,
  }
}

function renderAgents({
  role = "owner",
  api = fakeAgentsApi(),
  view = undefined as string | undefined,
  selectedId = undefined as string | undefined,
  onSelect = vi.fn(),
}: {
  role?: string
  api?: WorkspaceAgentsApi
  view?: string
  selectedId?: string
  onSelect?: (id: string | null) => void
} = {}) {
  renderWithClient(
    <WorkspaceAgentsContainer
      auth={fakeAuth({ memberRole: vi.fn(async () => role) })}
      api={api}
      settings={settings}
      organization={acme}
      view={view}
      selectedId={selectedId}
      onSelect={onSelect}
      connected={<p>Connected view</p>}
    />,
  )
  return { api, onSelect }
}

describe("WorkspaceAgentsContainer", () => {
  it("lists the agents with their status and the selected agent's permissions", async () => {
    renderAgents()
    expect(await screen.findByRole("button", { name: /Release triage/ })).toBeTruthy()
    expect(screen.getByText("Needs you")).toBeTruthy()
    const autonomy = screen.getByRole("button", { name: "Ask first" })
    expect(autonomy.getAttribute("aria-pressed")).toBe("true")
  })

  it("pins an agent through update_agent", async () => {
    const user = userEvent.setup()
    const { api } = renderAgents()
    await user.click(
      await screen.findByRole("switch", { name: "Pin Release triage to the sidebar" }),
    )
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("org-a", "agent-1", { pinned: true }),
    )
  })

  it("saves only the changed permissions", async () => {
    const user = userEvent.setup()
    const { api } = renderAgents()
    await user.click(await screen.findByRole("button", { name: "Autonomous" }))
    expect(screen.getByRole("status").textContent).toBe("1 unsaved change")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("org-a", "agent-1", { autonomy: "autonomous" }),
    )
  })

  it("creates an agent with a name, and asks for one first", async () => {
    const user = userEvent.setup()
    const { api } = renderAgents()
    await user.click(await screen.findByRole("button", { name: "Create agent" }))
    const dialog = screen.getByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Create agent" }))
    expect(await within(dialog).findByText(/Give the agent a name/)).toBeTruthy()
    await user.type(within(dialog).getByLabelText("Name"), "Docs bot")
    await user.click(within(dialog).getByRole("button", { name: "Create agent" }))
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith("org-a", { name: "Docs bot", description: null }),
    )
  })

  it("deletes an agent after naming its runs, and clears the selection", async () => {
    const user = userEvent.setup()
    const { api, onSelect } = renderAgents()
    await user.click(await screen.findByRole("button", { name: "Delete agent" }))
    const dialog = await screen.findByRole("alertdialog")
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          "Deletes Release triage and its 3 runs and their history. This can't be undone.",
        ),
      ).toBeTruthy(),
    )
    await user.click(within(dialog).getByRole("button", { name: "Delete agent" }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("org-a", "agent-1"))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null))
  })

  it("is read-only for a viewer: no create, no edits, no delete", async () => {
    renderAgents({ role: "viewer" })
    expect(await screen.findByRole("button", { name: "Create agent" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(await screen.findByRole("button", { name: "Save changes" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(
      screen.getByRole("switch", { name: "Pin Release triage to the sidebar" }),
    ).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Delete agent" })).toHaveProperty("disabled", true)
    expect(screen.getByText("You have view-only access to Acme Inc.")).toBeTruthy()
  })

  it("lets a member edit but not delete", async () => {
    renderAgents({ role: "member" })
    expect(await screen.findByRole("button", { name: "Delete agent" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(screen.getByRole("button", { name: "Create agent" })).toHaveProperty("disabled", false)
  })

  it("shows the connected view without loading the agent list", async () => {
    const { api } = renderAgents({ view: "connected" })
    expect(await screen.findByText("Connected view")).toBeTruthy()
    expect(api.list).not.toHaveBeenCalled()
  })

  it("shows the error with a retry when the list fails", async () => {
    const api = fakeAgentsApi({
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error("Service unavailable"))
        .mockResolvedValueOnce([releaseTriage]),
    })
    renderAgents({ api })
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText("Service unavailable")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: /Release triage/ })).toBeTruthy()
  })

  it("shows the server's refusal when a pin is not saved", async () => {
    const user = userEvent.setup()
    const api = fakeAgentsApi({
      update: vi.fn(async () => {
        throw new Error("Only owners can pin agents")
      }),
    })
    renderAgents({ api })
    await user.click(
      await screen.findByRole("switch", { name: "Pin Release triage to the sidebar" }),
    )
    expect(await screen.findByText("Only owners can pin agents")).toBeTruthy()
  })

  it("renames an agent, and the dialog opens on the new name next time", async () => {
    const user = userEvent.setup()
    // The server keeps the change, so the refetch after a save shows it.
    let stored = releaseTriage
    const api = fakeAgentsApi({
      list: vi.fn(async () => [stored]),
      update: vi.fn(async (_org, id, patch) => {
        stored = { ...stored, id, ...patch }
        return stored
      }),
    })
    renderAgents({ api })
    await user.click(await screen.findByRole("button", { name: "Edit details" }))
    let dialog = await screen.findByRole("dialog")
    const name = within(dialog).getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Launch triage")
    await user.click(within(dialog).getByRole("button", { name: "Save details" }))
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("org-a", "agent-1", {
        name: "Launch triage",
        description: "Groups release blockers",
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await user.click(await screen.findByRole("button", { name: "Edit details" }))
    dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Launch triage")
  })
})
