import { afterEach, describe, expect, test, vi } from "vitest"

/**
 * Global constraint: no label or branch triggers another system. The agent's build starts from the
 * label `agent:build` and works on `agent/*` branches; box review is `factory:review` and
 * dependency updates are `deps/<group>-<year>-w<week>`. None of them may start a build.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const constants = async () => {
  vi.resetModules()
  return await import("#lib/constants.js")
}

describe("what starts and what the agent works on", () => {
  test("the build label is agent:build, and the factory:review label is not it", async () => {
    const { FACTORY_LABEL } = await constants()
    expect(FACTORY_LABEL).toBe("agent:build")
    expect(FACTORY_LABEL).not.toBe("factory:review")
  })

  test("the agent's branches are agent/*, which never match deps/* or the review label's branches", async () => {
    const { FACTORY_BRANCH_PREFIX } = await constants()
    expect(FACTORY_BRANCH_PREFIX).toBe("agent/")
    for (const other of ["deps/npm-2026-w47", "deps/", "factory:review", "factory/x"]) {
      expect(other.startsWith(FACTORY_BRANCH_PREFIX)).toBe(false)
    }
    expect("agent/bug-fix-login".startsWith(FACTORY_BRANCH_PREFIX)).toBe(true)
  })
})
