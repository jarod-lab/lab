import { describe, expect, it } from "vitest"

import { qk } from "./query-keys"

describe("account-level keys", () => {
  it("are not scoped to an organization", () => {
    expect(qk.session()).toEqual(["session"])
    expect(qk.organizations()).toEqual(["organizations"])
    expect(qk.account.sessions()).toEqual(["account", "sessions"])
    expect(qk.account.passkeys()).toEqual(["account", "passkeys"])
  })

  it("nest the account keys under one prefix", () => {
    expect(qk.account.all()).toEqual(["account"])
    expect(qk.account.sessions().slice(0, 1)).toEqual(qk.account.all())
    expect(qk.account.passkeys().slice(0, 1)).toEqual(qk.account.all())
  })
})

describe("organization keys", () => {
  it("put every org query under ['org', orgId]", () => {
    const k = qk.org("acme")
    expect(k.all()).toEqual(["org", "acme"])
    for (const key of [
      k.members(),
      k.membersSecurity(),
      k.invitations(),
      k.apiKeys(),
      k.agents(),
      k.agentsCount(),
      k.runs(),
    ]) {
      expect(key.slice(0, 2)).toEqual(["org", "acme"])
    }
  })

  it("name each resource", () => {
    const k = qk.org("acme")
    expect(k.members()).toEqual(["org", "acme", "members"])
    expect(k.invitations()).toEqual(["org", "acme", "invitations"])
    expect(k.apiKeys()).toEqual(["org", "acme", "api-keys"])
    expect(k.membersSecurity()).toEqual(["org", "acme", "members", "security"])
    expect(k.agents()).toEqual(["org", "acme", "agents"])
    expect(k.agentsCount()).toEqual(["org", "acme", "agents", "count"])
    expect(k.runs()).toEqual(["org", "acme", "runs"])
  })

  it("nest the security table under the members list and the count under the agents list", () => {
    const k = qk.org("acme")
    expect(k.membersSecurity().slice(0, 3)).toEqual(k.members())
    expect(k.agentsCount().slice(0, 3)).toEqual(k.agents())
  })

  it("nest a single run under the runs list, so invalidating runs covers it", () => {
    const k = qk.org("acme")
    expect(k.run("r1")).toEqual(["org", "acme", "runs", "r1"])
    expect(k.run("r1").slice(0, 3)).toEqual(k.runs())
    expect(k.run("r1")).not.toEqual(k.run("r2"))
  })

  it("keep two organizations apart, even for the same resource", () => {
    expect(qk.org("acme").members()).not.toEqual(qk.org("globex").members())
    expect(qk.org("acme").run("r1")).not.toEqual(qk.org("globex").run("r1"))
  })

  it("refuse an empty organization or run id", () => {
    expect(() => qk.org("")).toThrow("organization id is empty")
    expect(() => qk.org("acme").run("")).toThrow("run id is empty")
  })
})
