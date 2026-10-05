import { getTableName } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { createDb, users } from "./index"

describe("db", () => {
  it("exposes the users table", () => {
    expect(getTableName(users)).toBe("users")
  })

  it("requires DATABASE_URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is not set")
  })
})
