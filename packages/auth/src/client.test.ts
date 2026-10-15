import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createClient } from "./client"

const importsOf = (file: string) =>
  [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/from "([^"]+)"/g)].map(
    (m) => m[1],
  )

describe("createClient", () => {
  it("creates a typed auth client", () => {
    const client = createClient("http://localhost:3000")
    expect(typeof client.signIn.email).toBe("function")
    expect(typeof client.organization.inviteMember).toBe("function")
  })

  // The client ships to browsers: no server code (@starter/api, the DB, ./permissions) may reach it.
  it("imports only browser-safe modules", () => {
    const browserSafe =
      /^(better-auth\/client(\/plugins)?|better-auth\/plugins\/(organization\/)?access|@better-auth\/oauth-provider\/client|@wraps\.dev\/better-auth\/client|\.\/access)$/
    const imports = [...importsOf("./client.ts"), ...importsOf("./access.ts")]
    expect(imports.filter((i) => !browserSafe.test(i ?? ""))).toEqual([])
  })
})
