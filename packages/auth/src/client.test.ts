import { describe, expect, it } from "vitest"
import { createClient } from "./client"

describe("createClient", () => {
  it("creates a typed auth client", () => {
    const client = createClient("http://localhost:3000")
    expect(typeof client.signIn.email).toBe("function")
  })
})
