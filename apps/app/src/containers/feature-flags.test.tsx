// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { OperatorContext } from "../lib/operator"
import { fakeAuth } from "../test/fake-auth"
import { detailFixture, fakeFeatureFlagsApi, flagFixture } from "../test/fake-feature-flags"
import { renderWithClient } from "../test/render"
import { FeatureFlagsContainer } from "./feature-flags"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }

function renderContainer(api = fakeFeatureFlagsApi(), operator = true) {
  return {
    api,
    ...renderWithClient(
      <OperatorContext.Provider value={operator}>
        <FeatureFlagsContainer auth={fakeAuth()} api={api} organization={acme} />
      </OperatorContext.Provider>,
    ),
  }
}

describe("FeatureFlagsContainer", () => {
  it("loads the flags for the organization, and a flag's detail when managed", async () => {
    const user = userEvent.setup()
    const { api } = renderContainer()
    await user.click(await screen.findByRole("button", { name: "Manage new-search" }))
    expect(await screen.findByRole("region", { name: "new-search" })).toBeTruthy()
    expect(api.list).toHaveBeenCalledWith("org-a")
    expect(api.get).toHaveBeenCalledWith("org-a", "new-search")
    expect(await screen.findByText("Acme Inc · you are Owner")).toBeTruthy()
  })

  it("refreshes the list and the flag after a write", async () => {
    const user = userEvent.setup()
    const list = vi
      .fn()
      .mockResolvedValueOnce([flagFixture()])
      .mockResolvedValue([flagFixture({ percentage: 50 })])
    const { api } = renderContainer(fakeFeatureFlagsApi({ list }))
    await user.click(await screen.findByRole("button", { name: "Manage new-search" }))
    const detail = await screen.findByRole("region", { name: "new-search" })
    await user.click(within(detail).getByRole("button", { name: "50%" }))
    expect(api.update).toHaveBeenCalledWith("org-a", "new-search", { percentage: 50 })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("50%", { selector: "td" })).toBeTruthy()
  })

  it("closes the flag once its rollout is deleted", async () => {
    const user = userEvent.setup()
    const orphan = { key: "old-banner", status: "orphaned" as const, inCatalog: false }
    const api = fakeFeatureFlagsApi({
      list: vi.fn(async () => [flagFixture(orphan)]),
      get: vi.fn(async () => detailFixture({ ...orphan, targets: [] })),
    })
    renderContainer(api)
    await user.click(await screen.findByRole("button", { name: "Manage old-banner" }))
    const detail = await screen.findByRole("region", { name: "old-banner" })
    await user.click(within(detail).getByRole("button", { name: "Delete rollout" }))
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete rollout",
      }),
    )
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("org-a", "old-banner"))
    await waitFor(() => expect(screen.queryByRole("region", { name: "old-banner" })).toBeNull())
  })

  it("asks nothing outside the operator organization", async () => {
    const { api } = renderContainer(fakeFeatureFlagsApi(), false)
    expect(await screen.findByText(/managed by the operator organization/)).toBeTruthy()
    expect(api.list).not.toHaveBeenCalled()
  })

  it("shows a failed list", async () => {
    renderContainer(
      fakeFeatureFlagsApi({
        list: vi.fn(async () => {
          throw new Error("Only the operator organization can do this")
        }),
      }),
    )
    expect(await screen.findByText("Only the operator organization can do this")).toBeTruthy()
  })
})
