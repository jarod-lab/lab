// @vitest-environment node
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

// The SPA shell is prerendered from the root route alone (`spa.prerender` in vite.config.ts). Any page
// content in it makes every other page hydrate against the wrong markup (React #418), so the shell has
// to stay free of headings, forms and page landmarks. This reads the build output, so it only runs once
// `pnpm build` has written dist/. `turbo test` does not depend on build, so it skips here with a message.
const shellPath = fileURLToPath(new URL("../dist/index.html", import.meta.url))
const built = existsSync(shellPath)

describe.skipIf(!built)("prerendered shell (dist/index.html)", () => {
  const html = built ? readFileSync(shellPath, "utf8") : ""

  it("has no page headings", () => {
    expect(html).not.toMatch(/<h[1-6][\s>]/i)
  })

  it("has no forms, inputs or buttons", () => {
    expect(html).not.toMatch(/<(form|input|button)[\s>]/i)
  })

  it("has no page landmark or page copy", () => {
    expect(html).not.toMatch(/<main[\s>]/i)
    expect(html).not.toMatch(/Sign in|Sign up|Authorize|Device code/i)
  })

  it("keeps the document shell and its inline bootstrap", () => {
    expect(html).toMatch(/<html[\s>]/i)
    expect(html).toMatch(/<script src="\/assets\/theme\.js"/)
  })
})

if (!built) {
  describe("prerendered shell (dist/index.html)", () => {
    it.skip("skipped: dist/index.html is absent, run `pnpm --filter @starter/web build` first", () => {})
  })
}
