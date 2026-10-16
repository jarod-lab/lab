import { test } from "@e2e-dev/web"
import { expect } from "e2e"

// Deterministic: no agent step, so it needs no model key. Runs on every target (desktop, phone).
test("the sign-in page renders its heading", async ({ app, screen }) => {
  await app.open("/sign-in")
  await expect(screen.getByRole("heading", "Sign in")).toBeVisible()
})
