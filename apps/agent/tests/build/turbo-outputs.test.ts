import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `eve build` writes the Vercel Build Output API directory, `.vercel/output`, under this app (the
 * build log says "built output at .../apps/agent/.vercel/output"). Turbo restores only what a task
 * declares in `outputs`, so on a cache hit (an unchanged agent, such as a stamp-only push) an
 * undeclared directory is missing and Vercel fails with STATIC_BUILD_NO_OUT_DIR.
 */
const ROOT = join(import.meta.dirname, "../../../..")
const BUILD_OUTPUT = ".vercel/output"

const readTurbo = (): { tasks: Record<string, { env?: string[]; outputs?: string[] }> } => {
  const text = readFileSync(join(ROOT, "turbo.jsonc"), "utf8")
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""))
}

describe("the agent build's turbo outputs", () => {
  it("declare the directory eve build writes, so a cache hit restores it", () => {
    const outputs = readTurbo().tasks["@lab/agent#build"]?.outputs ?? []
    expect(outputs).toContain(`${BUILD_OUTPUT}/**`)
  })

  it("hash VERCEL, so a Vercel build never restores a build made without it", () => {
    // Without VERCEL eve writes .output only; a cache entry from such a build has no .vercel/output.
    expect(readTurbo().tasks["@lab/agent#build"]?.env ?? []).toContain("VERCEL")
  })

  it("name the directory eve itself writes", () => {
    const plugin = readFileSync(
      join(import.meta.dirname, "../../node_modules/eve/dist/src/shared/vite-eve-plugin.js"),
      "utf8",
    )
    expect(plugin).toContain(BUILD_OUTPUT)
  })
})
