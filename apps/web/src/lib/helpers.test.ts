// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { messageOf } from "./messages"
import { safeNext } from "./navigation"
import { describeScope, splitScopes } from "./scopes"

describe("safeNext", () => {
  it("keeps a path on this origin", () => {
    expect(safeNext("/settings/agents")).toBe("/settings/agents")
    expect(safeNext("/consent?client_id=x")).toBe("/consent?client_id=x")
  })

  it("falls back for anything that could leave the origin", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "agents"]) {
      expect(safeNext(value)).toBe("/settings/agents")
    }
    expect(safeNext(undefined, "/home")).toBe("/home")
    expect(safeNext(42)).toBe("/settings/agents")
  })
})

describe("scopes", () => {
  it("describes known scopes in plain words and names unknown ones", () => {
    expect(describeScope("write")).toBe("Create and change data in the organization")
    expect(describeScope("custom:thing")).toBe('Use the "custom:thing" permission')
  })

  it("splits the scope parameter without empty entries", () => {
    expect(splitScopes("openid  read write")).toEqual(["openid", "read", "write"])
    expect(splitScopes(undefined)).toEqual([])
  })
})

describe("messageOf", () => {
  it("shows an error's message, or a generic one for anything else", () => {
    expect(messageOf(new Error("Nope"))).toBe("Nope")
    expect(messageOf(new Error(""))).toBe("Something went wrong. Try again.")
    expect(messageOf("boom")).toBe("Something went wrong. Try again.")
  })
})
