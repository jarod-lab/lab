// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { anchorLink } from "@starter/ui/dplus/shell/link"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { THEME_STORAGE_KEY } from "../lib/theme"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { AppShellContainer } from "./app-shell"

function renderShell(overrides: Partial<Parameters<typeof AppShellContainer>[0]> = {}) {
  const props = {
    auth: fakeAuth(),
    slug: "analytical",
    activeNav: "home" as const,
    crumbs: [{ label: "Analytical Ltd" }],
    onNavigate: vi.fn(),
    onSignedOut: vi.fn(),
    renderLink: anchorLink,
    ...overrides,
  }
  renderWithClient(
    <AppShellContainer {...props}>
      <h1>Analytical Ltd</h1>
    </AppShellContainer>,
  )
  return props
}

/** The picker's trigger names the current org once the organizations have loaded. */
const loaded = () => screen.findByRole("button", { name: /current Analytical Ltd/ })

describe("AppShellContainer", () => {
  it("shows nav for the URL's org, and the org picker lists the caller's organizations", async () => {
    renderShell()
    await loaded()
    const agents = screen.getByRole("link", { name: /^Agents/ })
    expect(agents.getAttribute("href")).toBe("/analytical/settings/agents")
    await userEvent.click(screen.getByRole("button", { name: /Switch organization/ }))
    expect(await screen.findByRole("menuitem", { name: /Babbage Labs/ })).toBeTruthy()
  })

  it("has no accessibility violations", async () => {
    renderShell()
    await loaded()
    await expectNoA11yViolations(document.body.innerHTML)
  })

  it("G then H navigates to the org home; the other G keys to agents and settings", async () => {
    const props = renderShell()
    await loaded()
    await userEvent.keyboard("gh")
    expect(props.onNavigate).toHaveBeenLastCalledWith("/analytical")
    await userEvent.keyboard("ga")
    expect(props.onNavigate).toHaveBeenLastCalledWith("/analytical/settings/agents")
    await userEvent.keyboard("go")
    expect(props.onNavigate).toHaveBeenLastCalledWith("/analytical/settings/general")
  })

  it("does not fire G keys while typing in a field", async () => {
    const props = renderShell()
    await loaded()
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    await userEvent.keyboard("gh")
    expect(props.onNavigate).not.toHaveBeenCalled()
    input.remove()
  })

  it("opens the command palette with Ctrl+K and Cmd+K, and runs a theme item", async () => {
    renderShell()
    await loaded()
    await userEvent.keyboard("{Control>}k{/Control}")
    const palette = await screen.findByRole("dialog", { name: "Command palette" })
    await userEvent.click(within(palette).getByText("Dark theme"))
    await waitFor(() => expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark"))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    document.documentElement.classList.remove("dark")
    window.localStorage.clear()

    await userEvent.keyboard("{Meta>}k{/Meta}")
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy()
  })

  it("the palette switches org by navigating to its slug", async () => {
    const props = renderShell()
    await loaded()
    await userEvent.keyboard("{Control>}k{/Control}")
    const palette = await screen.findByRole("dialog", { name: "Command palette" })
    await userEvent.click(within(palette).getByText("Switch to Babbage Labs"))
    expect(props.onNavigate).toHaveBeenCalledWith("/babbage")
  })

  it("? opens the shortcut list", async () => {
    renderShell()
    await loaded()
    await userEvent.keyboard("?")
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
    expect(within(dialog).getByText("Go to agents")).toBeTruthy()
  })

  it("signs out and reports it", async () => {
    const auth = fakeAuth()
    const props = renderShell({ auth })
    await loaded()
    await userEvent.click(screen.getByRole("button", { name: /Account menu/ }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /Sign out/ }))
    await waitFor(() => expect(props.onSignedOut).toHaveBeenCalled())
    expect(auth.signOut).toHaveBeenCalled()
  })
})
