import { describe, expect, it } from "vitest"

import {
  currentStep,
  decisionCopy,
  deferSchema,
  footprintCells,
  footprintCopy,
  formatTokens,
  formatWh,
  isLiveStatus,
  needsYouFirst,
  runFilterOf,
  secondsLeft,
  steerSchema,
} from "./run-view"
import type { RunStep } from "./runs-api"

function step(status: RunStep["status"], position = 0): RunStep {
  return {
    id: `s${position}`,
    position,
    kind: "collect",
    title: `Step ${position}`,
    detail: null,
    status,
    progressDone: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  }
}

describe("live runs", () => {
  it("are live while queued, running or needing a person, and not once finished", () => {
    expect(isLiveStatus("running")).toBe(true)
    expect(isLiveStatus("needs_you")).toBe(true)
    expect(isLiveStatus("queued")).toBe(true)
    expect(isLiveStatus("done")).toBe(false)
    expect(isLiveStatus("failed")).toBe(false)
  })
})

describe("currentStep", () => {
  it("counts from the first step that is not done (board: step 4 of 6)", () => {
    const steps = [
      step("done", 0),
      step("done", 1),
      step("done", 2),
      step("running", 3),
      step("queued", 4),
      step("queued", 5),
    ]
    expect(currentStep(steps)).toEqual({ index: 4, total: 6 })
  })

  it("is the last step once everything is done, and null with no steps", () => {
    expect(currentStep([step("done", 0), step("done", 1)])).toEqual({ index: 2, total: 2 })
    expect(currentStep([])).toBeNull()
  })
})

describe("secondsLeft", () => {
  const until = "2026-10-16T10:00:30.000Z"
  const at = Date.parse("2026-10-16T10:00:00.000Z")

  it("counts whole seconds down from the server's end time", () => {
    expect(secondsLeft(until, at)).toBe(30)
    expect(secondsLeft(until, at + 10_200)).toBe(20)
  })

  it("is zero once the window has passed, and for an unreadable time", () => {
    expect(secondsLeft(until, at + 31_000)).toBe(0)
    expect(secondsLeft("not a date", at)).toBe(0)
  })
})

describe("footprint", () => {
  it("fills cells by the share of the budget used, out of ten", () => {
    expect(footprintCells(0.6, 2)).toEqual({ value: 3, max: 10 })
    expect(footprintCells(5, 2)).toEqual({ value: 10, max: 10 })
  })

  it("fills no cells without a budget, rather than inventing one", () => {
    expect(footprintCells(0.6, null)).toEqual({ value: 0, max: 10 })
    expect(footprintCopy({ energyWh: 0.6, tokens: 18000, toolCalls: 7 }, null)).toBe(
      "0.6 Wh used · no budget set · 18k tokens · 7 tool calls",
    )
    expect(footprintCopy({ energyWh: 0.6, tokens: 18000, toolCalls: 1 }, 2)).toBe(
      "0.6 Wh of 2 Wh run budget · 18k tokens · 1 tool call",
    )
  })

  it("formats watt-hours and tokens", () => {
    expect(formatWh(0.333333)).toBe("0.33 Wh")
    expect(formatTokens(950)).toBe("950 tokens")
    expect(formatTokens(18_400)).toBe("18k tokens")
    expect(formatTokens(1_250_000)).toBe("1.3M tokens")
  })

  it("never rounds a thousand thousands into a k: 999,500 and up reads as millions", () => {
    expect(formatTokens(999_499)).toBe("999k tokens")
    expect(formatTokens(999_500)).toBe("1M tokens")
    expect(formatTokens(999_999)).toBe("1M tokens")
    expect(formatTokens(1_000_000)).toBe("1M tokens")
  })
})

describe("forms", () => {
  it("requires a defer time in the future", () => {
    // datetime-local values are the reader's local time, so the test formats them the same way.
    const local = (ms: number) => {
      const date = new Date(ms)
      const pad = (value: number) => String(value).padStart(2, "0")
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
    expect(deferSchema.safeParse({ until: local(Date.now() - 60_000) }).success).toBe(false)
    expect(deferSchema.safeParse({ until: "" }).success).toBe(false)
    const future = local(Date.now() + 3_600_000)
    expect(deferSchema.safeParse({ until: future }).success).toBe(true)
  })

  it("trims a steer message and refuses an empty one", () => {
    expect(steerSchema.parse({ body: "  skip billing  " }).body).toBe("skip billing")
    expect(steerSchema.safeParse({ body: "   " }).success).toBe(false)
  })
})

describe("the org list", () => {
  it("puts runs that need a person first, keeping the rest in order", () => {
    const runs = [
      { id: "a", status: "done" as const },
      { id: "b", status: "needs_you" as const },
      { id: "c", status: "running" as const },
      { id: "d", status: "needs_you" as const },
    ]
    expect(needsYouFirst(runs).map((run) => run.id)).toEqual(["b", "d", "a", "c"])
  })

  it("reads filters from the URL, and falls back to all", () => {
    expect(runFilterOf("needs_you")).toBe("needs_you")
    expect(runFilterOf("nope")).toBe("all")
    expect(runFilterOf(undefined)).toBe("all")
  })
})

describe("decisionCopy", () => {
  const decision = {
    decidedBy: "user_1",
    decidedAt: "2026-10-16T10:00:00Z",
    effectiveAt: "2026-10-16T10:00:30Z",
    undoableUntil: null,
  }

  it("says the viewer decided it when they did", () => {
    expect(decisionCopy("approved", decision, "user_1")).toBe("You approved.")
    expect(decisionCopy("denied", decision, "user_1")).toBe("You denied.")
  })

  it("names a teammate's decision, and waits while pending", () => {
    expect(decisionCopy("approved", decision, "user_2")).toBe("Approved by a teammate.")
    expect(decisionCopy("denied", decision)).toBe("Denied by a teammate.")
    expect(decisionCopy("pending", null, "user_1")).toBe("Waiting for a decision.")
  })
})
