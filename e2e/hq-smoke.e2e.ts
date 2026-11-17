import { test } from "@e2e-dev/web"
import { expect } from "e2e"

// An API test of apps/hq (the `hq` target in e2e.config.ts): no model, no page. The other targets
// serve the product's web app and API, so the test does nothing there.
test("hq answers GET /v1/status for a signed-in founder", async ({ app }) => {
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const llms = await (await fetch(new URL("/llms.txt", app.baseUrl))).text()
  // Not apps/hq (a desktop or phone target): nothing to check here.
  if (!llms.includes("hq_status")) return

  // A founder: signing up makes a personal organization the person owns.
  const email = `founder.${Date.now()}@example.com`
  const signUp = await fetch(new URL("/api/auth/sign-up/email", app.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: app.baseUrl },
    body: JSON.stringify({ name: "Founder", email, password: "e2e founder on the local stack" }),
  })
  expect(signUp.status).toBe(200)
  const cookie = signUp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")

  const response = await fetch(new URL("/v1/status", app.baseUrl), { headers: { cookie } })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, version: expect.any(String) })
})
