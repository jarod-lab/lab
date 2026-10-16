// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OrgHomePage } from "./org-home-page"
import { OrgNotFoundPage } from "./org-not-found-page"

describe("OrgHomePage", () => {
  it("shows the organization, the caller's role, and links to what exists", async () => {
    render(
      <OrgHomePage
        organization={{ name: "Analytical Ltd", slug: "analytical" }}
        roleLabel="Owner"
      />,
    )
    expect(screen.getByRole("heading", { name: "Analytical Ltd" })).toBeTruthy()
    expect(screen.getByText(/Your role: Owner/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Agents" }).getAttribute("href")).toBe(
      "/analytical/settings/agents",
    )
    expect(screen.getByText(/\[PLACEHOLDER\]/)).toBeTruthy()
    await expectNoA11yViolations(document.body.innerHTML)
  })
})

describe("OrgNotFoundPage", () => {
  it("says there is no such organization and links to create one", async () => {
    render(<OrgNotFoundPage slug="nowhere" />)
    expect(screen.getByRole("heading", { name: "No organization at this address" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Create an organization" }).getAttribute("href")).toBe(
      "/new",
    )
    await expectNoA11yViolations(document.body.innerHTML)
  })
})
