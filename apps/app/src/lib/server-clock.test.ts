import { afterEach, describe, expect, it } from "vitest"

import { currentSkewMs, recordServerDate, resetServerClock, serverNowMs } from "./server-clock"

describe("server clock", () => {
  afterEach(() => resetServerClock())

  it("learns the skew from a response's Date header", () => {
    // The local clock reads 10:00:00.000 when the server says 10:00:05 (a 5 second lead).
    recordServerDate("Fri, 16 Oct 2026 10:00:05 GMT", Date.parse("2026-10-16T10:00:00.000Z"))
    expect(currentSkewMs()).toBe(5000)
    expect(serverNowMs(Date.parse("2026-10-16T10:01:00.000Z"))).toBe(
      Date.parse("2026-10-16T10:01:05.000Z"),
    )
  })

  it("ignores a missing or unreadable header", () => {
    recordServerDate(null, 0)
    recordServerDate("not a date", 0)
    expect(currentSkewMs()).toBe(0)
  })
})
