// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { CreateOrganizationContainer } from "./create-organization"

function renderContainer(auth = fakeAuth()) {
  const props = { auth, host: "app.example.com", onCreated: vi.fn(), onCancel: vi.fn() }
  renderWithClient(<CreateOrganizationContainer {...props} />)
  return props
}

const nameInput = () => screen.getByLabelText("Organization name")

describe("CreateOrganizationContainer", () => {
  it("checks the slug once it settles and shows the answer", async () => {
    const auth = fakeAuth()
    renderContainer(auth)
    await userEvent.type(nameInput(), "Acme Labs")
    expect(await screen.findByText("Available")).toBeTruthy()
    expect(auth.checkSlug).toHaveBeenCalledWith("acme-labs")
  })

  it("reports a taken slug", async () => {
    renderContainer(fakeAuth({ checkSlug: vi.fn(async () => false) }))
    await userEvent.type(nameInput(), "Babbage")
    expect(await screen.findByText("Taken")).toBeTruthy()
  })

  it("never asks the server about a reserved slug", async () => {
    const auth = fakeAuth()
    renderContainer(auth)
    await userEvent.type(nameInput(), "Admin")
    expect(await screen.findByText("That address is reserved. Choose another.")).toBeTruthy()
    expect(auth.checkSlug).not.toHaveBeenCalledWith("admin")
  })

  it("does not say Available when the check fails", async () => {
    renderContainer(fakeAuth({ checkSlug: vi.fn(async () => Promise.reject(new Error("down"))) }))
    await userEvent.type(nameInput(), "Acme")
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.queryByText("Available")).toBeNull()
  })

  it("creates the organization, makes it active and reports it", async () => {
    const auth = fakeAuth()
    const props = renderContainer(auth)
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
    const props = renderContainer(
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
})
