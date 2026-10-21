// product.ts is the one source for the product's name, version and public origin. The packages
// that ship a version (the CLI and the SDK) must carry the same one, so a release bumps them together.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PRODUCT } from "./product"

const packageVersion = (dir: string) =>
  (
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../packages/${dir}/package.json`, import.meta.url)),
        "utf8",
      ),
    ) as { version: string }
  ).version

describe("product.ts", () => {
  it("is the version of the CLI and the SDK", () => {
    expect(packageVersion("cli")).toBe(PRODUCT.version)
    expect(packageVersion("sdk")).toBe(PRODUCT.version)
  })

  it("has a public origin without a trailing slash", () => {
    expect(PRODUCT.publicURL).toMatch(/^https:\/\/[^/\s]+$/)
  })
})
