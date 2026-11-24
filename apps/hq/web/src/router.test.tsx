// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createFakeHq } from "./test/fake-hq"
import { renderApp } from "./test/render"

describe("the app router", () => {
  it("/app redirects to /app/digest", async () => {
    const app = await renderApp({ path: "/app" })
    expect(app.router.history.location.pathname).toBe("/app/digest")
    expect(await app.findByRole("heading", { name: "Digest" })).toBeTruthy()
  })

  it("an unknown path under /app renders a not-found state inside the frame", async () => {
    const app = await renderApp({ path: "/app/nope" })
    expect(await app.findByText("Page not found")).toBeTruthy()
    expect(app.getByRole("navigation", { name: "Primary" })).toBeTruthy()
  })

  it("renders each screen route inside the frame with the active nav item marked", async () => {
    for (const [path, label] of [
      ["/app/digest", "Digest"],
      ["/app/approvals", "Approvals"],
      ["/app/runner", "Runner & policy"],
    ] as const) {
      const app = await renderApp({ path, hq: createFakeHq() })
      expect(await app.findByText("Coming next")).toBeTruthy()
      const current = app
        .getByRole("navigation", { name: "Primary" })
        .querySelector("[aria-current]")
      expect(current?.textContent).toContain(label)
      app.unmount()
    }
  })

  it("navigates between screens from the sidebar", async () => {
    const app = await renderApp({ path: "/app/digest" })
    await app.user.click(await app.findByRole("link", { name: /Approvals/ }))
    expect(app.router.history.location.pathname).toBe("/app/approvals")
  })

  it("the sign-in route sits outside the frame and keeps ?next", async () => {
    const app = await renderApp({ path: "/app/sign-in?next=%2Fapprovals" })
    expect(await app.findByLabelText("Email")).toBeTruthy()
    expect(app.queryByRole("navigation", { name: "Primary" })).toBeNull()
    expect(app.router.state.location.search).toEqual({ next: "/approvals" })
  })
})
