// @vitest-environment jsdom
import { RouterProvider } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getRouter } from "./router"

// The signed query better-auth's oauth-provider puts on the login, consent and organization pages.
// Every parameter is covered by the signature, so each one must survive the router unchanged.
const SIGNED_QUERY =
  "?client_id=c1&scope=openid%20read&state=s1&exp=1900000000&ba_iat=1800000000" +
  "&ba_param=client_id&ba_param=scope&ba_param=state&sig=abc123"

const pairs = (search: string) => [...new URLSearchParams(search).entries()]

/** Opens a route in the router and lets it render. Nothing is signed in: getSession answers null. */
async function open(path: string) {
  window.history.replaceState(null, "", path)
  render(<RouterProvider router={getRouter()} />)
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(null), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OAuth query survives the router", () => {
  it("keeps every signed parameter on /sign-in, including repeats", async () => {
    await open(`/sign-in${SIGNED_QUERY}`)
    await screen.findByRole("heading", { name: "Sign in" })
    expect(window.location.search).toBe(SIGNED_QUERY)
    expect(pairs(window.location.search)).toEqual(pairs(SIGNED_QUERY))
  })

  it("links to sign-up with the same raw query", async () => {
    await open(`/sign-in${SIGNED_QUERY}`)
    const link = await screen.findByRole("link", { name: "Create an account" })
    expect(link.getAttribute("href")).toBe(`/sign-up${SIGNED_QUERY}`)
  })

  it("keeps the signed query on /consent", async () => {
    await open(`/consent${SIGNED_QUERY}`)
    await screen.findByRole("heading", { name: "Sign in to continue" })
    expect(window.location.search).toBe(SIGNED_QUERY)
  })

  it("keeps the signed query on /select-organization", async () => {
    await open(`/select-organization${SIGNED_QUERY}`)
    await screen.findByRole("heading", { name: "Sign in first" })
    expect(window.location.search).toBe(SIGNED_QUERY)
  })
})
