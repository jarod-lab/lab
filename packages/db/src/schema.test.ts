import { getTableName } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { createDb, user } from "./index"

describe("db", () => {
  it("exposes the user table", () => {
    expect(getTableName(user)).toBe("user")
  })

  it("requires DATABASE_URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is not set")
  })

  it("creates a client without connecting", () => {
    expect(createDb("postgres://user:pass@localhost:5432/db")).toBeDefined()
  })
})
