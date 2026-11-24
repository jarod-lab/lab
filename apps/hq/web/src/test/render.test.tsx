// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createFakeHq } from "./fake-hq"
import { renderApp } from "./render"

describe("renderApp", () => {
  it("mounts the app's route tree under /app against the fake hq", async () => {
    const hq = createFakeHq()
    const app = await renderApp({ path: "/app/approvals", hq })
    expect(app.router.history.location.pathname).toBe("/app/approvals")
    expect(await app.findByRole("heading", { name: "Approvals" })).toBeTruthy()
    expect(app.hq).toBe(hq)
    const reply = await hq.fetch("/v1/status")
    expect(await reply.json()).toEqual({ ok: true, version: "0.0.0" })
    expect(hq.sent.map((s) => s.path)).toEqual(["/v1/status"])
  })

  it("defaults to /app/digest with a signed-in founder", async () => {
    const app = await renderApp()
    expect(app.router.history.location.pathname).toBe("/app/digest")
    expect(app.hq.state.caller).toBe("founder")
  })
})
