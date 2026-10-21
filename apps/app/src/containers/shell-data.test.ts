// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { WebAuth } from "../lib/web-auth"
import { activeOrganization, orgRoleLabel, toOrgSummaries, useSignOut } from "./shell-data"

describe("orgRoleLabel", () => {
  it("labels each role, and the highest of a comma-separated list", () => {
    expect(orgRoleLabel("owner")).toBe("Owner")
    expect(orgRoleLabel("admin")).toBe("Admin")
    expect(orgRoleLabel("member")).toBe("Member")
    expect(orgRoleLabel("viewer")).toBe("Viewer")
    expect(orgRoleLabel("member,admin")).toBe("Admin")
    expect(orgRoleLabel(" Owner , member ")).toBe("Owner")
  })

  it("shows a capability role as itself, not as Viewer", () => {
    expect(orgRoleLabel("approver")).toBe("Approver")
    expect(orgRoleLabel("viewer,approver")).toBe("Approver")
    expect(orgRoleLabel("operator")).toBe("Operator")
    expect(orgRoleLabel("billing")).toBe("Billing")
  })

  it("shows Viewer for a role not known yet or a custom one", () => {
    expect(orgRoleLabel(undefined)).toBe("Viewer")
    expect(orgRoleLabel("auditor")).toBe("Viewer")
  })
})

describe("toOrgSummaries", () => {
  it("pairs each organization with its role", () => {
    const summaries = toOrgSummaries(
      [
        { id: "a", name: "Analytical", slug: "analytical" },
        { id: "b", name: "Babbage", slug: "babbage" },
      ],
      new Map([["a", "owner"]]),
    )
    expect(summaries).toEqual([
      { id: "a", name: "Analytical", slug: "analytical", role: "Owner" },
      { id: "b", name: "Babbage", slug: "babbage", role: "Viewer" },
    ])
  })
})

describe("activeOrganization", () => {
  const orgs = [{ id: "a", name: "Analytical", slug: "analytical" }]

  it("finds the session's active org among the caller's", () => {
    expect(
      activeOrganization(
        { user: { id: "u", email: "", name: "" }, activeOrganizationId: "a" },
        orgs,
      ),
    ).toEqual(orgs[0])
  })

  it("is undefined when there is no active org, or it is not the caller's", () => {
    const user = { id: "u", email: "", name: "" }
    expect(activeOrganization({ user, activeOrganizationId: null }, orgs)).toBeUndefined()
    expect(activeOrganization({ user, activeOrganizationId: "zzz" }, orgs)).toBeUndefined()
    expect(activeOrganization(null, orgs)).toBeUndefined()
  })
})

describe("useSignOut", () => {
  it("leaves nothing from the signed-out session on screen, even in a page that stays mounted", async () => {
    let who: string | null = "ada@acme.dev"
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const auth = {
      signOut: vi.fn(async () => {
        who = null
      }),
    } as unknown as WebAuth
    // The page and the sign-out button are separate components: signing out re-renders only the
    // button, so the page has to be told its data went away.
    const page = renderHook(() => useQuery({ queryKey: ["who"], queryFn: async () => who }), {
      wrapper,
    })
    const button = renderHook(() => useSignOut(auth), { wrapper })
    await waitFor(() => expect(page.result.current.data).toBe("ada@acme.dev"))

    await act(() => button.result.current.mutateAsync())
    await waitFor(() => expect(page.result.current.data).toBeNull())
  })

  it("hands over to the caller (the way to /sign-in) without waiting for the page to refetch", async () => {
    let signedIn = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const auth = {
      signOut: vi.fn(async () => {
        signedIn = false
      }),
    } as unknown as WebAuth
    // Signed out, the page's query never answers (a slow or retrying request).
    renderHook(
      () =>
        useQuery({
          queryKey: ["who"],
          queryFn: () => (signedIn ? Promise.resolve("ada") : new Promise<string>(() => {})),
        }),
      { wrapper },
    )
    const button = renderHook(() => useSignOut(auth), { wrapper })
    const onSignedOut = vi.fn()

    act(() => button.result.current.mutate(undefined, { onSuccess: onSignedOut }))
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1))
  })
})
