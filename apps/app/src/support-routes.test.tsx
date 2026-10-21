// @vitest-environment jsdom
// The support routes (routes/account/support.{-$id}.tsx, routes/admin/support.{-$id}.tsx) through
// the real router: the requester's page opens its ticket inline and the URL follows their moves, and
// the queue opens its link's ticket and keeps its search while the URL follows the open ticket. Here, not in routes/, because the
// router generator treats every file under routes/ as a route.
import { RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { setWebAuth } from "./lib/web-auth"
import { getRouter } from "./router"
import { fakeAuth } from "./test/fake-auth"
import { agentTicket, customerTicket, fakeSupportClient } from "./test/fake-support"

const client = fakeSupportClient({
  tickets: [customerTicket()],
  queue: [agentTicket(), agentTicket({ id: "t2", number: 43, subject: "Billing question" })],
})

function open(path: string) {
  window.history.replaceState(null, "", path)
  const router = getRouter()
  router.options.context.queryClient.setDefaultOptions({ queries: { retry: false } })
  render(<RouterProvider router={router} />)
}

// The routes read the page's auth through getWebAuth; the product API calls get an empty answer.
beforeAll(() => {
  setWebAuth(fakeAuth({ support: client }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("null", { headers: { "content-type": "application/json" } })),
  )
})

afterAll(() => {
  setWebAuth(undefined)
  vi.unstubAllGlobals()
})

describe("support routes", () => {
  it("shows the requester's ticket in the page, with the top bar's widget closed", async () => {
    open("/account/support/t1")
    expect(await screen.findByRole("heading", { name: "Support tickets" })).toBeTruthy()
    await waitFor(() => expect(client.support.ticket).toHaveBeenCalledWith({ query: { id: "t1" } }))
    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Support/ })).toBeTruthy()
    expect(screen.queryByRole("dialog", { name: "Support" })).toBeNull()

    // Back lists their tickets on /account/support, and a row opens it on its own address again.
    await userEvent.click(screen.getByRole("button", { name: "Back" }))
    await waitFor(() => expect(window.location.pathname).toBe("/account/support"))
    await userEvent.click(await screen.findByRole("button", { name: /Can't export runs/ }))
    await waitFor(() => expect(window.location.pathname).toBe("/account/support/t1"))
  })

  it("opens the linked ticket in the support queue, and keeps the queue as tickets open", async () => {
    open("/admin/support/t2")
    await waitFor(() =>
      expect(client.support.agent.ticket).toHaveBeenCalledWith({ query: { id: "t2" } }),
    )
    // The staff work the queue here; the customer widget stays out of the console.
    expect(screen.queryByRole("button", { name: /^Support/ })).toBeNull()

    await userEvent.click(await screen.findByRole("button", { name: "Back" }))
    await waitFor(() => expect(window.location.pathname).toBe("/admin/support"))
    const search = screen.getByRole("searchbox")
    await userEvent.type(search, "Can't")
    await userEvent.click(await screen.findByText("Can't export runs"))
    await waitFor(() => expect(window.location.pathname).toBe("/admin/support/t1"))
    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("Can't")
  })
})
