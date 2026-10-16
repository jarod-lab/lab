// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { ApiKeysApi } from "../lib/api-keys-api"
import type { OrgSettingsApi } from "../lib/org-settings-api"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { ApiKeysContainer } from "./api-keys"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }

// The plugin's rules as the server states them: owner and admin hold apiKey; member reads only.
const ALLOWED: Record<string, string[]> = {
  owner: [
    "apiKey:create",
    "apiKey:read",
    "apiKey:update",
    "apiKey:delete",
    "project:read",
    "project:create",
    "run:approve",
  ],
  admin: [
    "apiKey:create",
    "apiKey:read",
    "apiKey:update",
    "apiKey:delete",
    "project:read",
    "project:create",
    "run:approve",
  ],
  member: ["apiKey:read", "project:read"],
  viewer: ["project:read"],
}

const settings = {
  roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
    const granted = role.split(",").flatMap((part) => ALLOWED[part.trim()] ?? [])
    return Object.entries(permissions).every(([resource, actions]) =>
      actions.every((action) => granted.includes(`${resource}:${action}`)),
    )
  }),
} as unknown as Pick<OrgSettingsApi, "roleAllows">

function fakeKeysApi(overrides: Partial<ApiKeysApi> = {}): ApiKeysApi {
  return {
    listKeys: vi.fn(async () => [
      {
        id: "key_1",
        name: "CI deploy",
        access: ["project:read"],
        createdAt: "2026-10-01T00:00:00.000Z",
        lastUsedAt: null,
      },
    ]),
    createKey: vi.fn(async (_org, input) => ({
      id: "1",
      key: "sk_test_once",
      permissions: input.permissions,
    })),
    revokeKey: vi.fn(async () => undefined),
    ...overrides,
  }
}

function setup(options: { role?: string; api?: ApiKeysApi } = {}) {
  const auth = fakeAuth({ memberRole: vi.fn(async () => options.role ?? "owner") })
  const api = options.api ?? fakeKeysApi()
  const rendered = renderWithClient(
    <ApiKeysContainer auth={auth} api={api} settings={settings} organization={acme} />,
  )
  return { api, ...rendered }
}

describe("ApiKeysContainer", () => {
  it("lists the keys for an owner", async () => {
    const { api } = setup()
    expect(await screen.findByText("CI deploy")).toBeTruthy()
    expect(api.listKeys).toHaveBeenCalledWith("org-a")
  })

  it("never asks a viewer or member for the list", async () => {
    for (const role of ["viewer", "member"]) {
      const { api, unmount } = setup({ role })
      expect(await screen.findByText("You have view-only access to Acme Inc.")).toBeTruthy()
      expect(api.listKeys).not.toHaveBeenCalled()
      unmount()
    }
  })

  it("creates a key, shows its secret, and forgets the secret on dismiss", async () => {
    const user = userEvent.setup()
    const { api, queryClient, unmount } = setup()
    await screen.findByText("CI deploy")
    await user.click(screen.getByRole("button", { name: "Create API key" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Support bot")
    await user.click(within(dialog).getByRole("button", { name: "Create key" }))
    await waitFor(() =>
      expect(api.createKey).toHaveBeenCalledWith("org-a", {
        name: "Support bot",
        permissions: { project: ["read"] },
        expiresInDays: undefined,
      }),
    )
    expect((await screen.findByLabelText("Secret key")) as HTMLInputElement).toBeTruthy()
    expect((screen.getByLabelText("Secret key") as HTMLInputElement).value).toBe("sk_test_once")
    // The secret never enters the query cache.
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("sk_test_once")

    await user.click(screen.getByRole("button", { name: "I've saved it" }))
    expect(screen.queryByLabelText("Secret key")).toBeNull()

    // Remounting (another visit) does not bring it back.
    unmount()
    setup()
    await screen.findByText("CI deploy")
    expect(screen.queryByLabelText("Secret key")).toBeNull()
  })

  it("revokes a key and refreshes the list", async () => {
    const user = userEvent.setup()
    const api = fakeKeysApi()
    api.listKeys = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "key_1",
          name: "CI deploy",
          access: ["project:read"],
          createdAt: "2026-10-01T00:00:00.000Z",
          lastUsedAt: null,
        },
      ])
      .mockResolvedValue([])
    setup({ api })
    await screen.findByText("CI deploy")
    await user.click(screen.getByRole("button", { name: "Revoke CI deploy" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }))
    await waitFor(() => expect(api.revokeKey).toHaveBeenCalledWith("org-a", "key_1"))
    expect(await screen.findByRole("heading", { name: "No API keys yet" })).toBeTruthy()
  })

  it("shows a list error with the server's message", async () => {
    setup({
      api: fakeKeysApi({
        listKeys: vi.fn(async () => {
          throw new Error("Server is busy")
        }),
      }),
    })
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("Server is busy")
  })
})
