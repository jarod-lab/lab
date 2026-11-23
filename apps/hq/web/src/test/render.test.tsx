// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { hqKeys } from "../api/query-keys"
import { createFakeHq } from "./fake-hq"
import { renderApp } from "./render"

describe("renderApp", () => {
  it("mounts a memory-history router under /app against the fake hq", async () => {
    const hq = createFakeHq()
    const Probe = () => {
      const { data } = useQuery({
        queryKey: hqKeys.status(),
        queryFn: async () => (await hq.fetch("/v1/status")).json(),
      })
      return <p>{data ? `hq ${data.version}` : "loading"}</p>
    }
    const app = await renderApp({ path: "/app/approvals", hq, ui: <Probe /> })
    expect(app.router.history.location.pathname).toBe("/app/approvals")
    expect(await app.findByText("hq 0.0.0")).toBeTruthy()
    expect(app.hq).toBe(hq)
    expect(hq.sent.map((s) => s.path)).toEqual(["/v1/status"])
  })

  it("defaults to /app/digest with a signed-in founder", async () => {
    const app = await renderApp()
    expect(app.router.history.location.pathname).toBe("/app/digest")
    expect(app.hq.state.caller).toBe("founder")
  })
})
