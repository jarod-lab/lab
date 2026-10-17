// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { CreateOrganizationPage } from "./create-organization-page"

function renderPage(auth = fakeAuth()) {
  const props = { auth, host: "app.example.com", onCreated: vi.fn(), onCancel: vi.fn() }
  renderWithClient(<CreateOrganizationPage {...props} />)
  return props
}

const nameInput = () => screen.getByLabelText("Organization name")
const urlInput = () => screen.getByRole("textbox", { name: "URL" })

describe("CreateOrganizationPage", () => {
  it("suggests a slug from the name until the URL is edited", async () => {
    renderPage()
    await userEvent.type(nameInput(), "Acme Labs")
    expect((urlInput() as HTMLInputElement).value).toBe("acme-labs")

    await userEvent.clear(urlInput())
    await userEvent.type(urlInput(), "acme-x")
    await userEvent.type(nameInput(), " Ltd")
    expect((urlInput() as HTMLInputElement).value).toBe("acme-x")
  })

  it("shows the availability of the slug once it settles", async () => {
    const auth = fakeAuth()
    renderPage(auth)
    await userEvent.type(nameInput(), "Acme Labs")
    expect(await screen.findByText("Available")).toBeTruthy()
    expect(auth.checkSlug).toHaveBeenCalledWith("acme-labs")
  })

  it("reports a taken slug", async () => {
    renderPage(fakeAuth({ checkSlug: vi.fn(async () => false) }))
    await userEvent.type(nameInput(), "Babbage")
    expect(await screen.findByText("Taken")).toBeTruthy()
  })

  it("refuses a reserved slug client-side, without asking the server", async () => {
    const auth = fakeAuth()
    renderPage(auth)
    await userEvent.type(nameInput(), "Admin")
    await userEvent.clear(urlInput())
    await userEvent.type(urlInput(), "admin")
    expect(await screen.findByText("That address is reserved. Choose another.")).toBeTruthy()
    expect(urlInput().getAttribute("aria-invalid")).toBe("true")
    expect(auth.checkSlug).not.toHaveBeenCalledWith("admin")
  })

  it("names the reserved address in the status its field points at", async () => {
    renderPage()
    await userEvent.type(nameInput(), "Admin")
    await userEvent.clear(urlInput())
    await userEvent.type(urlInput(), "admin")
    await screen.findByText("That address is reserved. Choose another.")
    const describedBy = urlInput().getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "That address is reserved. Choose another.",
    )
    expect(screen.queryByText(/Use lowercase letters/)).toBeNull()
    expect(screen.queryByText("Choose a valid organization URL.")).toBeNull()
  })

  it("does not say Available when the check fails", async () => {
    renderPage(fakeAuth({ checkSlug: vi.fn(async () => Promise.reject(new Error("down"))) }))
    await userEvent.type(nameInput(), "Acme")
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.queryByText("Available")).toBeNull()
  })

  it("creates the organization, makes it active and reports it", async () => {
    const auth = fakeAuth()
    const props = renderPage(auth)
    await userEvent.type(nameInput(), "Acme Labs")
    await screen.findByText("Available")
    await userEvent.click(screen.getByRole("button", { name: "Create organization" }))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalled())
    expect(auth.createOrganization).toHaveBeenCalledWith({ name: "Acme Labs", slug: "acme-labs" })
    expect(auth.setActiveOrganization).toHaveBeenCalledWith("org-new")
    expect(props.onCreated).toHaveBeenCalledWith({
      id: "org-new",
      name: "Acme Labs",
      slug: "acme-labs",
    })
  })

  it("shows the server's refusal and does not navigate", async () => {
    const props = renderPage(
      fakeAuth({
        createOrganization: vi.fn(async () => {
          throw new Error("That slug is taken")
        }),
      }),
    )
    await userEvent.type(nameInput(), "Acme Labs")
    await screen.findByText("Available")
    await userEvent.click(screen.getByRole("button", { name: "Create organization" }))
    expect((await screen.findByRole("alert")).textContent).toContain("That slug is taken")
    expect(props.onCreated).not.toHaveBeenCalled()
  })

  it("explains that logo upload is unavailable", () => {
    renderPage()
    expect(screen.getByRole("button", { name: "Upload" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(/Logo upload is not available yet/)).toBeTruthy()
  })

  it("has no accessibility violations", async () => {
    renderPage()
    await userEvent.type(nameInput(), "Acme")
    await screen.findByText("Available")
    await expectNoA11yViolations(document.body.innerHTML)
  })
})
