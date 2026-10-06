import { afterAll, describe, expect, it } from "vitest"
import { user } from "./schema"
import { createTestDb } from "./testing"

describe("createTestDb", () => {
  const ctx = createTestDb()
  afterAll(async () => (await ctx).close())

  it("applies the real migrations", async () => {
    const { db } = await ctx
    await db.insert(user).values({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: false,
    })
    const rows = await db.select().from(user)
    expect(rows.map((r) => r.email)).toEqual(["ada@example.com"])
  })
})
