// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { OrgSettingsApi } from "../lib/org-settings-api"
import { qk } from "../lib/query-keys"

import type { UploadsApi } from "../lib/uploads-api"
import { fakeAuth } from "../test/fake-auth"
import { fakeUploads } from "../test/fake-uploads"
import { renderWithClient } from "../test/render"
import { OrgGeneralContainer } from "./org-general"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }
const babbage = { id: "org-b", name: "Babbage Labs", slug: "babbage" }

// The server's rules as the plugin states them: owner may do all, admin may update, viewer nothing.
const ALLOWED: Record<string, string[]> = {
  owner: ["organization:update", "organization:delete"],
  admin: ["organization:update"],
  member: [],
  viewer: [],
}

function fakeApi(overrides: Partial<OrgSettingsApi> = {}): OrgSettingsApi {
  return {
    getOrganization: vi.fn(async () => ({
      id: "org-a",
      name: "Acme Inc",
      slug: "acme",
      logo: null,
      metadata: { defaultInviteRole: "viewer", region: "eu" },
    })),
    listMembers: vi.fn(async () => ({
      total: 3,
      members: [
        { id: "m-self", userId: "user-1", role: "owner", name: "Ada", email: "ada@example.com" },
        { id: "m-bo", userId: "user-2", role: "admin", name: "Bo", email: "bo@example.com" },
        { id: "m-cy", userId: "user-3", role: "member", name: "Cy", email: "" },
      ],
    })),
    updateOrganization: vi.fn(async (_id, data) => ({
      id: "org-a",
      name: data.name ?? "Acme Inc",
      slug: data.slug ?? "acme",
      logo: null,
      metadata: data.metadata,
    })),
    updateMemberRole: vi.fn(async () => undefined),
    leaveOrganization: vi.fn(async () => undefined),
    deleteOrganization: vi.fn(async () => undefined),
    countApiKeys: vi.fn(async () => 3),
    roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
      const granted = role.split(",").flatMap((part) => ALLOWED[part.trim()] ?? [])
      return Object.entries(permissions).every(([resource, actions]) =>
        actions.every((action: string) => granted.includes(`${resource}:${action}`)),
      )
    }),
    ...overrides,
  }
}

const twoAgents = { list: vi.fn(async () => [{ id: "a1" }, { id: "a2" }]) } as never

function setup(options: { role?: string; api?: OrgSettingsApi; uploads?: UploadsApi } = {}) {
  const auth = fakeAuth({ memberRole: vi.fn(async () => options.role ?? "owner") })
  const api = options.api ?? fakeApi()
  const onSlugChanged = vi.fn()
  const onExit = vi.fn()
  const uploads = options.uploads ?? fakeUploads()
  const rendered = renderWithClient(
    <OrgGeneralContainer
      auth={auth}
      api={api}
      organization={acme}
      host="app.example.com"
      onSlugChanged={onSlugChanged}
      onExit={onExit}
      agentsApi={twoAgents}
      uploads={uploads}
    />,
  )
  rendered.queryClient.setQueryData(qk.organizations(), [acme, babbage])
  return { auth, api, uploads, onSlugChanged, onExit, ...rendered }
}

describe("OrgGeneralContainer", () => {
  it("names the real number of agents a deletion removes", async () => {
    setup()
    expect(await screen.findByText(/Permanently deletes 2 agents/)).toBeTruthy()
  })

  it("saves a new name and keeps the metadata the server already holds", async () => {
    const user = userEvent.setup()
    const { api, onSlugChanged } = setup()
    const name = await screen.findByRole("textbox", { name: "Organization name" })
    await user.type(name, " Labs")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(api.updateOrganization).toHaveBeenCalledWith("org-a", {
        name: "Acme Inc Labs",
        slug: "acme",
        metadata: { defaultInviteRole: "viewer", region: "eu" },
      }),
    )
    expect(onSlugChanged).not.toHaveBeenCalled()
  })

  it("navigates to the new address once a slug change is saved", async () => {
    const user = userEvent.setup()
    const { api, onSlugChanged, queryClient } = setup()
    const slug = await screen.findByLabelText("URL")
    await user.clear(slug)
    await user.type(slug, "acme-labs")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(onSlugChanged).toHaveBeenCalledWith("acme-labs"))
    expect(api.updateOrganization).toHaveBeenCalledWith(
      "org-a",
      expect.objectContaining({ slug: "acme-labs" }),
    )
    // The shell's list already shows the new slug when the page moves there.
    const list = queryClient.getQueryData<{ id: string; slug: string }[]>(qk.organizations())
    expect(list?.find((org) => org.id === "org-a")?.slug).toBe("acme-labs")
  })

  it("transfers ownership: the new owner first, then the caller steps down to admin", async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole("button", { name: "Transfer…" }))
    await user.click(screen.getByRole("button", { name: "Transfer ownership" }))
    await waitFor(() => expect(api.updateMemberRole).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.updateMemberRole).mock.calls).toEqual([
      ["org-a", "m-bo", "owner"],
      ["org-a", "m-self", "admin"],
    ])
  })

  it("leaves the organization and goes to the next one the caller belongs to", async () => {
    const user = userEvent.setup()
    const { api, onExit } = setup({ role: "viewer" })
    await user.click(await screen.findByRole("button", { name: "Leave organization" }))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave organization" }),
    )
    await waitFor(() => expect(onExit).toHaveBeenCalledWith("babbage"))
    expect(api.leaveOrganization).toHaveBeenCalledWith("org-a")
  })

  it("deletes the organization and goes to /new when it was the last one", async () => {
    const user = userEvent.setup()
    const { api, onExit, queryClient } = setup()
    queryClient.setQueryData(qk.organizations(), [acme])
    await user.click(await screen.findByRole("button", { name: "Delete organization" }))
    const dialog = within(screen.getByRole("alertdialog"))
    await user.type(dialog.getByLabelText("Type Acme Inc to confirm"), "Acme Inc")
    await user.click(dialog.getByRole("button", { name: "Delete organization" }))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith(null))
    expect(api.deleteOrganization).toHaveBeenCalledWith("org-a")
  })

  it("is read-only for a viewer, with no danger zone and no save", async () => {
    setup({ role: "viewer" })
    expect(await screen.findByText("You have view-only access to Acme Inc.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Transfer…" })).toBeNull()
  })

  it("lets an admin edit but not delete the organization", async () => {
    const { api } = setup({ role: "admin" })
    expect(await screen.findByRole("textbox", { name: "Organization name" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull()
    expect(api.countApiKeys).not.toHaveBeenCalled()
  })

  describe("logo", () => {
    it("uploads a picked logo for this organization and shows the one the server returns", async () => {
      const user = userEvent.setup()
      let logo: string | null = null
      const api = fakeApi({
        getOrganization: vi.fn(async () => ({
          id: "org-a",
          name: "Acme Inc",
          slug: "acme",
          logo,
          metadata: {},
        })),
      })
      const uploads = fakeUploads({
        setLogo: vi.fn(async () => {
          logo = "https://files.example.com/org/org-a/logo-1.png"
          return logo
        }),
      })
      const { container } = setup({ api, uploads })
      await screen.findByText("Square, at least 128px. PNG, JPEG, WebP or GIF, up to 1 MB.")
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')
      if (!input) throw new Error("no file input")
      await user.upload(
        input,
        new File([new Uint8Array([0x89])], "logo.png", { type: "image/png" }),
      )
      await waitFor(() => expect(uploads.setLogo).toHaveBeenCalledWith("org-a", expect.any(File)))
      await waitFor(() =>
        expect(container.querySelector('[data-slot="org-mark"] img')?.getAttribute("src")).toBe(
          logo,
        ),
      )
      expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy()
    })

    it("offers no upload to a member, and does not ask about limits", async () => {
      const { uploads } = setup({ role: "member" })
      await screen.findByText(/Owners and admins can upload one/)
      expect(screen.queryByRole("button", { name: "Upload" })).toBeNull()
      expect(uploads.limits).not.toHaveBeenCalled()
    })
  })
})
