import { describe, expect, it } from "vitest"

import { assertSignUpClosedWhenDeployed, isProductionLike } from "./deploy-mode"

describe("what counts as a deployed hq", () => {
  it("is anything but an explicit development or test: production, or no NODE_ENV at all", () => {
    expect(isProductionLike("production")).toBe(true)
    expect(isProductionLike(undefined)).toBe(true)
    expect(isProductionLike("staging")).toBe(true)
    expect(isProductionLike("development")).toBe(false)
    expect(isProductionLike("test")).toBe(false)
  })

  it("refuses public sign-up when deployed, and lets local stacks keep it", () => {
    for (const nodeEnv of ["production", undefined, "staging"]) {
      expect(() => assertSignUpClosedWhenDeployed({ nodeEnv, allowSignUp: true })).toThrow(
        /HQ_ALLOW_SIGNUP is on in a deployed hq/,
      )
      expect(() => assertSignUpClosedWhenDeployed({ nodeEnv, allowSignUp: false })).not.toThrow()
    }
    for (const nodeEnv of ["development", "test"]) {
      expect(() => assertSignUpClosedWhenDeployed({ nodeEnv, allowSignUp: true })).not.toThrow()
    }
  })
})
