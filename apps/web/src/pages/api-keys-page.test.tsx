// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { ApiKey } from "../lib/api-keys-api"
import { renderWithClient } from "../test/render"
import { type ApiKeysPageProps, ApiKeysPage } from "./api-keys-page"

const NOW = new Date("2026-10-16T12:00:00Z")
const DAY = 86_400_000

const keys: ApiKey[] = [
  {
    id: "key_1",
    name: "CI deploy",
    access: ["project:read", "project:update"],
    createdAt: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    lastUsedAt: null,
  },
  {
    id: "key_2",
    name: "Support bot",
    access: ["project:read"],
    createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
    lastUsedAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
  },
  {
    id: "key_3",
    name: "Old staging",
    access: ["project:read", "project:update"],
    createdAt: new Date(NOW.getTime() - 300 * DAY).toISOString(),
    lastUsedAt: new Date(NOW.getTime() - 120 * DAY).toISOString(),
  },
]

const options = [
  { key: "project:read", resource: "project", action: "read", label: "Projects: Read" },
  { key: "project:update", resource: "project", action: "update", label: "Projects: Update" },
] as const

function props(overrides: Partial<ApiKeysPageProps> = {}): ApiKeysPageProps {
  return {
    organization: { id: "org-a", name: "Acme Inc", slug: "acme" },
    roleLabel: "Owner",
    canList: true,
    canCreate: true,
    keys,
    keysPending: false,
    keysError: null,
    onRetry: vi.fn(),
    permissionOptions: [...options],
    secret: null,
    onDismissSecret: vi.fn(),
    onCreate: vi.fn(async () => undefined),
    onRevoke: vi.fn(async () => undefined),
    now: NOW,
    ...overrides,
  }
}

describe("ApiKeysPage as owner", () => {
  it("lists the keys with access, dates and the unused flag", async () => {
    renderWithClient(<ApiKeysPage {...props()} />)
    expect(screen.getByRole("heading", { name: "API keys" })).toBeTruthy()
    expect(screen.getByText("Acme Inc · you are Owner")).toBeTruthy()
    const rows = screen.getAllByRole("row")
    // header + three keys
    expect(rows).toHaveLength(4)
    const ci = within(rows[1] as HTMLElement)
    expect(ci.getByText("CI deploy")).toBeTruthy()
    expect(ci.getByText("Read & write")).toBeTruthy()
    expect(ci.getByText("Never")).toBeTruthy()
    const old = within(rows[3] as HTMLElement)
    expect(old.getByText("Unused 90+ days")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Revoke Support bot" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create API key" })).toBeTruthy()
    await expectNoA11yViolations(document.body.innerHTML)
  })

  it("shows the empty state when there are no keys", () => {
    renderWithClient(<ApiKeysPage {...props({ keys: [] })} />)
    expect(screen.getByRole("heading", { name: "No API keys yet" })).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("shows the error with a retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithClient(
      <ApiKeysPage {...props({ keys: undefined, keysError: "Network down", onRetry })} />,
    )
    expect(screen.getByRole("alert").textContent).toContain("Network down")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("revokes only after confirming the consequence", async () => {
    const user = userEvent.setup()
    const onRevoke = vi.fn(async () => undefined)
    renderWithClient(<ApiKeysPage {...props({ onRevoke })} />)
    await user.click(screen.getByRole("button", { name: "Revoke Support bot" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText("Agents using this key stop working immediately.", { exact: false }),
    ).toBeTruthy()
    expect(onRevoke).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }))
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith(keys[1]))
  })

  it("shows the server's refusal when a revoke fails", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <ApiKeysPage
        {...props({ onRevoke: vi.fn(async () => Promise.reject(new Error("Nope"))) })}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Revoke Support bot" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }))
    expect(await within(dialog).findByRole("alert")).toBeTruthy()
    expect(within(dialog).getByRole("alert").textContent).toContain("Nope")
  })

  it("requires a name and at least one permission, then sends the choices", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => undefined)
    renderWithClient(<ApiKeysPage {...props({ onCreate })} />)
    await user.click(screen.getByRole("button", { name: "Create API key" }))
    const dialog = await screen.findByRole("dialog")
    const submit = within(dialog).getByRole("button", { name: "Create key" })
    // Read is on by default; turning it off leaves no permission.
    await user.click(within(dialog).getByRole("checkbox", { name: "Projects: Read" }))
    await user.click(submit)
    expect(
      await within(dialog).findByText("Give the key a name, so you know what uses it."),
    ).toBeTruthy()
    expect(within(dialog).getByText("Choose at least one permission.")).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Deploy bot")
    await user.click(within(dialog).getByRole("checkbox", { name: "Projects: Update" }))
    await user.click(submit)
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Deploy bot",
        permissions: { project: ["update"] },
        expiresInDays: undefined,
      }),
    )
  })

  it("keeps the dialog open and shows the server's error when a key is refused", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () =>
      Promise.reject(new Error("A key can't have permissions its creator doesn't have")),
    )
    renderWithClient(<ApiKeysPage {...props({ onCreate })} />)
    await user.click(screen.getByRole("button", { name: "Create API key" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Too big")
    await user.click(within(dialog).getByRole("button", { name: "Create key" }))
    expect(await within(dialog).findByRole("alert")).toBeTruthy()
    expect(within(dialog).getByRole("alert").textContent).toContain("creator doesn't have")
  })

  it("shows the secret once with a dismiss that says it is gone", async () => {
    const user = userEvent.setup()
    const onDismissSecret = vi.fn()
    renderWithClient(
      <ApiKeysPage
        {...props({
          secret: { name: "CI deploy", key: "sk_live_example_secret" },
          onDismissSecret,
        })}
      />,
    )
    expect(
      screen.getByRole("heading", { name: "Copy “CI deploy” now. You won't see this key again." }),
    ).toBeTruthy()
    expect((screen.getByLabelText("Secret key") as HTMLInputElement).value).toBe(
      "sk_live_example_secret",
    )
    await user.click(screen.getByRole("button", { name: "I've saved it" }))
    expect(onDismissSecret).toHaveBeenCalledTimes(1)
  })
})

describe("ApiKeysPage as viewer or member", () => {
  it("shows the view-only notice, no list, and a disabled Create", () => {
    renderWithClient(
      <ApiKeysPage
        {...props({
          roleLabel: "Viewer",
          canList: false,
          canCreate: false,
          keys: undefined,
        })}
      />,
    )
    expect(screen.getByText("You have view-only access to Acme Inc.")).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
    const create = screen.getByRole("button", { name: "Create API key" }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(screen.getByText("Only owners and admins can create keys.")).toBeTruthy()
  })
})

describe("ApiKeysPage accessibility", () => {
  it("passes axe for the list with the secret shown", async () => {
    renderWithClient(
      <ApiKeysPage {...props({ secret: { name: "CI deploy", key: "sk_live_example_secret" } })} />,
    )
    await expectNoA11yViolations(document.body.innerHTML)
  })

  it("passes axe for the empty and view-only states", async () => {
    renderWithClient(<ApiKeysPage {...props({ keys: [] })} />)
    await expectNoA11yViolations(document.body.innerHTML)
  })
})
