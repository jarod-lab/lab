import { describe, expect, it } from "vitest"
import { parseStripePlans } from "./stripe-plans"

describe("parseStripePlans", () => {
  it("offers no plans when STRIPE_PLANS is unset", () => {
    expect(parseStripePlans(undefined)).toEqual([])
  })

  it("reads the plans as given, without inventing any", () => {
    expect(parseStripePlans('[{"name":"pro","priceId":"price_test_1"}]')).toEqual([
      { name: "pro", priceId: "price_test_1" },
    ])
  })

  it("refuses malformed JSON and wrong shapes, with the expected form", () => {
    expect(() => parseStripePlans("[pro]")).toThrow(/must be JSON/)
    expect(() => parseStripePlans('[{"name":"pro"}]')).toThrow(/array of/)
    expect(() => parseStripePlans('{"name":"pro","priceId":"price_1"}')).toThrow(/array of/)
    expect(() => parseStripePlans('[{"name":" ","priceId":"price_1"}]')).toThrow(/array of/)
  })
})
