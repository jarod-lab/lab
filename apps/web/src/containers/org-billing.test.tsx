// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BillingAdapter, BillingSnapshot, BillingUsage } from "../lib/billing/adapter"
import { fixtureBillingAdapter, fixtureSnapshot } from "../lib/billing/fixture"
import type { OrgSettingsApi } from "../lib/org-settings-api"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { OrgBillingContainer } from "./org-billing"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }
const USAGE: BillingUsage = { day: "2026-10-16", total: 3, limit: 500 }

// The plugin's rules: only the owner may update the subscription (admin has no subscription grant).
const ALLOWED: Record<string, string[]> = {
  owner: ["subscription:update"],
  admin: [],
  member: [],
  viewer: [],
}

function fakeApi(): OrgSettingsApi {
  return {
    getOrganization: vi.fn(),
    listMembers: vi.fn(async () => ({
      total: 4,
      members: [{ id: "m-self", userId: "user-1", role: "owner", name: "Ada", email: "a@x.dev" }],
    })),
    updateOrganization: vi.fn(),
    updateMemberRole: vi.fn(),
    leaveOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    countApiKeys: vi.fn(),
    roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
      const granted = role.split(",").flatMap((part) => ALLOWED[part.trim()] ?? [])
      return Object.entries(permissions).every(([resource, actions]) =>
        actions.every((action: string) => granted.includes(`${resource}:${action}`)),
      )
    }),
  }
}

function stripeAdapter(
  snapshot: BillingSnapshot = { ...fixtureSnapshot(), sample: false },
): BillingAdapter {
  return {
    mode: "stripe",
    load: vi.fn(async () => snapshot),
    usage: vi.fn(async () => USAGE),
    openPortal: vi.fn(async () => ({ url: "https://billing.test/portal" })),
    changePlan: vi.fn(async () => ({ url: "https://billing.test/checkout" })),
    cancel: vi.fn(async () => ({ url: "https://billing.test/cancel" })),
  }
}

function setup(options: { role?: string; adapter?: BillingAdapter } = {}) {
  const auth = fakeAuth({ memberRole: vi.fn(async () => options.role ?? "owner") })
  // The fixture's usage is the API's (a real fetch); tests stub it so no request leaves jsdom.
  const adapter = options.adapter ?? { ...fixtureBillingAdapter, usage: vi.fn(async () => USAGE) }
  const rendered = renderWithClient(
    <OrgBillingContainer auth={auth} api={fakeApi()} organization={acme} adapter={adapter} />,
  )
  return { auth, adapter, ...rendered }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("OrgBillingContainer as owner, fixture", () => {
  it("shows the board's sample plan with [PRICE] and the sample labels", async () => {
    setup()
    expect(await screen.findByRole("heading", { name: "Pro" })).toBeTruthy()
    expect(screen.getByText("Acme Inc · you are Owner")).toBeTruthy()
    expect(screen.getAllByText("[SAMPLE DATA]").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\[PRICE\]/).length).toBeGreaterThan(0)
    expect(screen.getByText("Card ending 4242 · expires 08/28")).toBeTruthy()
    expect(screen.getByText("Oct 1, 2026")).toBeTruthy()
  })

  it("disables every provider control and says why", async () => {
    setup()
    const manage = await screen.findByRole("button", { name: "Manage subscription" })
    expect((manage as HTMLButtonElement).disabled).toBe(true)
    const describedBy = manage.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Billing isn't connected yet",
    )
    expect(screen.getByText("Billing isn't connected yet.")).toBeTruthy()
  })
})

describe("OrgBillingContainer usage", () => {
  it("shows today's metered requests against the limit, without a sample label", async () => {
    setup({ adapter: stripeAdapter() })
    expect(await screen.findByText("Requests today: 3 of 500")).toBeTruthy()
    expect(
      screen.getByText("Counted per UTC day (2026-10-16). Resets at midnight UTC."),
    ).toBeTruthy()
  })
})

describe("OrgBillingContainer as admin", () => {
  it("is read-only: admins have no subscription grant in the catalog", async () => {
    setup({ role: "admin", adapter: stripeAdapter() })
    expect(await screen.findByText("You have view-only access to Acme Inc.")).toBeTruthy()
    const manage = await screen.findByRole("button", { name: "Manage subscription" })
    expect((manage as HTMLButtonElement).disabled).toBe(true)
    expect(
      document.getElementById(manage.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Only the owner can change billing")
  })
})

describe("OrgBillingContainer as viewer", () => {
  it("is read-only with the view-only notice", async () => {
    setup({ role: "viewer", adapter: stripeAdapter() })
    expect(await screen.findByText("You have view-only access to Acme Inc.")).toBeTruthy()
    expect(
      screen.getByText("Only the owner can change the plan, seats, payment method or invoices."),
    ).toBeTruthy()
    const manage = await screen.findByRole("button", { name: "Manage subscription" })
    expect((manage as HTMLButtonElement).disabled).toBe(true)
    expect(
      document.getElementById(manage.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Only the owner can change billing")
  })
})

describe("OrgBillingContainer with the stripe adapter", () => {
  it("opens the portal in a new tab after the provider answers", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    const adapter = stripeAdapter()
    setup({ adapter })
    const manage = await screen.findByRole("button", { name: "Manage subscription" })
    await userEvent.click(manage)
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://billing.test/portal", "_blank", "noopener"),
    )
    expect(adapter.openPortal).toHaveBeenCalledWith("org-a")
  })

  it("confirms a cancellation before asking the provider", async () => {
    const adapter = stripeAdapter()
    vi.spyOn(window, "open").mockImplementation(() => null)
    setup({ adapter })
    await userEvent.click(await screen.findByRole("button", { name: "Cancel plan" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(/stays on until the end of the current period/)).toBeTruthy()
    expect(adapter.cancel).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel plan" }))
    await waitFor(() => expect(adapter.cancel).toHaveBeenCalledWith("org-a"))
  })

  it("shows the provider's refusal as an alert", async () => {
    const adapter = stripeAdapter()
    adapter.openPortal = vi.fn(async () => {
      throw new Error("Only the owner can manage billing")
    })
    setup({ adapter })
    await userEvent.click(await screen.findByRole("button", { name: "Manage subscription" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText("Only the owner can manage billing")).toBeTruthy()
  })
})
