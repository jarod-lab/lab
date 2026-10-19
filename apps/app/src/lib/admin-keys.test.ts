import { describe, expect, it } from "vitest"

import { adminKeys } from "./admin-keys"

describe("admin keys", () => {
  it("puts every user list under the users prefix, so one invalidation covers them", () => {
    const list = adminKeys.list({ search: "a", offset: 50, limit: 50 })
    expect(list.slice(0, 2)).toEqual(adminKeys.users())
  })

  it("keeps the session apart from the lists", () => {
    expect(adminKeys.session()).toEqual(["admin", "session"])
    expect(adminKeys.users()).not.toEqual(adminKeys.session())
  })
})
