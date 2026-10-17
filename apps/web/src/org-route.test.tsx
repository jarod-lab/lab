// @vitest-environment jsdom
// The organization route (routes/$org.tsx) through the real router. It lives here, not in routes/,
// because the router generator treats every file under routes/ as a route.
import { RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getRouter } from "./router"
import { fakeAuth } from "./test/fake-auth"

const listOrganizations = vi.hoisted(() => vi.fn())

vi.mock("./lib/web-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/web-auth")>()),
  getWebAuth: () => fakeAuth({ listOrganizations }),
}))

/** Opens an organization's page in the router. The caller is signed in to `analytical`. */
function open(path: string) {
  window.history.replaceState(null, "", path)
  const router = getRouter()
  // A failed list should show at once, not after the router's background retries.
  router.options.context.queryClient.setDefaultOptions({ queries: { retry: false } })
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  listOrganizations.mockReset()
})

describe("the organization route, when the organizations list fails", () => {
  it("says the list could not load, with a retry, and does not say the organization is missing", async () => {
    listOrganizations.mockRejectedValue(new Error("Failed to fetch"))
    open("/analytical")
    const message = await screen.findByText("Could not load your organizations.")
    expect(screen.queryByRole("heading", { name: "No organization at this address" })).toBeNull()
    const alert = message.closest('[role="alert"]') as HTMLElement
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("asks again when retried, and names the address missing only once the list answers", async () => {
    const user = userEvent.setup()
    listOrganizations.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue([])
    open("/analytical")
    const message = await screen.findByText("Could not load your organizations.")
    const alert = message.closest('[role="alert"]') as HTMLElement
    await user.click(within(alert).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(listOrganizations).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole("heading", { name: "No organization at this address" }),
    ).toBeTruthy()
  })
})
