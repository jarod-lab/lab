import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { PASSWORD } from "./support/invitations"
import { seedNeedsYouRun } from "./support/runs"

// Visual pass: every page in light and dark, on each target (desktop and phone), saved as screenshots
// to compare against the boards in docs/build-app/boards. Signing in goes over HTTP and the cookie is set
// on the browser, so no secret is ever filled and the screenshots are not withheld. Content Security
// Policy violations are collected on every page and must be none (run it against the built app served by
// apps/api with `--config e2e.dist.config.ts` to check the real CSP). Tagged `visual`: `--tag visual`.

const THEMES = ["light", "dark"] as const

const cspProbe = `
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline"));
  });
`

const settle = () => new Promise((resolve) => setTimeout(resolve, 900))

async function signUp(base: string, email: string) {
  const response = await fetch(new URL("/api/auth/sign-up/email", base), {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ name: "Jordan Lee", email, password: PASSWORD }),
  })
  if (!response.ok) throw new Error(`sign-up failed: ${response.status} ${await response.text()}`)
  const cookies = response.headers.getSetCookie().map((cookie) => {
    const [pair] = cookie.split(";")
    const at = pair.indexOf("=")
    return { name: pair.slice(0, at), value: pair.slice(at + 1) }
  })
  const list = await fetch(new URL("/api/auth/organization/list", base), {
    headers: { origin: base, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
  })
  const [org] = (await list.json()) as { slug: string }[]
  if (!org) throw new Error("sign-up made no personal organization")
  return { cookies, slug: org.slug }
}

test("public pages, light and dark", { tags: ["visual"] }, async ({ app, browser }) => {
  for (const theme of THEMES) {
    await browser.addInitScript(`localStorage.setItem("starter.theme", ${JSON.stringify(theme)});`)
    await browser.addInitScript(cspProbe)
    for (const [name, path] of [
      ["sign-in", "/sign-in"],
      ["sign-up", "/sign-up"],
      ["two-factor", "/two-factor"],
    ] as const) {
      await app.open(path)
      await browser.evaluate(settle)
      // A page that rendered nothing (a missing bundle, a crash) must fail, not pass as a blank screenshot.
      expect(await browser.evaluate(() => document.body.innerText.trim().length)).toBeGreaterThan(
        20,
      )
      await app.screenshot(`${theme}-${name}`)
      expect(
        await browser.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
      ).toEqual([])
    }
  }
})

test("signed-in pages, light and dark", { tags: ["visual"] }, async ({ app, browser }) => {
  const base = app.baseUrl
  if (!base) throw new Error("the app has no base URL")
  const email = `visual-${Date.now().toString(36)}@example.test`
  const { cookies, slug } = await signUp(base, email)
  const { runId } = await seedNeedsYouRun(app, {
    email,
    password: PASSWORD,
    slug,
    title: "Triage the v2.8 release blockers",
    action: "Post the triage summary to #release",
  })
  await browser.setCookies(cookies.map((cookie) => ({ ...cookie, url: base })))

  const pages = [
    ["home", `/${slug}`],
    ["run", `/${slug}/runs/${runId}`],
    ["general", `/${slug}/settings/general`],
    ["members", `/${slug}/settings/members`],
    ["api-keys", `/${slug}/settings/api-keys`],
    ["billing", `/${slug}/settings/billing`],
    ["agents", `/${slug}/settings/agents`],
    ["security-org", `/${slug}/settings/security`],
    ["profile", "/account/profile"],
    ["security", "/account/security"],
    ["new-org", "/new"],
  ] as const

  for (const theme of THEMES) {
    await browser.addInitScript(`localStorage.setItem("starter.theme", ${JSON.stringify(theme)});`)
    await browser.addInitScript(cspProbe)
    for (const [name, path] of pages) {
      await app.open(path)
      await browser.evaluate(settle)
      // A page that rendered nothing (a missing bundle, a crash) must fail, not pass as a blank screenshot.
      expect(await browser.evaluate(() => document.body.innerText.trim().length)).toBeGreaterThan(
        20,
      )
      await app.screenshot(`${theme}-${name}`)
      expect(
        await browser.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
      ).toEqual([])
    }
  }
})
