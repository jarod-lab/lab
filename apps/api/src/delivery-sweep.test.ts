import { createLogger } from "@starter/logger"
import { setErrorReporter } from "@starter/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type SweepResult, startDeliverySweep } from "./delivery-sweep"

const logger = createLogger({ name: "test", level: "silent" })
const idle: SweepResult = { sent: 0, skipped: 0, retrying: 0, failed: 0, hasMore: false }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("startDeliverySweep", () => {
  it("runs one batch per tick", async () => {
    const process = vi.fn(async () => idle)
    const sweep = startDeliverySweep({ process, intervalMs: 1000, logger })
    expect(process).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(process).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(process).toHaveBeenCalledTimes(2)
    await sweep.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(process).toHaveBeenCalledTimes(2)
  })

  it("drains a backlog a few batches per tick", async () => {
    const process = vi.fn(async () => ({ ...idle, sent: 100, hasMore: true }))
    const sweep = startDeliverySweep({ process, intervalMs: 1000, logger })
    await vi.advanceTimersByTimeAsync(1000)
    expect(process).toHaveBeenCalledTimes(5)
    await sweep.stop()
  })

  it("does not start a tick while the last one is still running", async () => {
    let finish: (() => void) | undefined
    const process = vi.fn(
      () =>
        new Promise<SweepResult>((resolve) => {
          finish = () => resolve(idle)
        }),
    )
    const sweep = startDeliverySweep({ process, intervalMs: 1000, logger })
    await vi.advanceTimersByTimeAsync(3000)
    expect(process).toHaveBeenCalledTimes(1)
    finish?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(process).toHaveBeenCalledTimes(2)
    finish?.()
    await sweep.stop()
  })

  it("reports a failed batch and keeps sweeping", async () => {
    const reported: unknown[] = []
    setErrorReporter((error) => reported.push(error))
    const process = vi
      .fn<() => Promise<SweepResult>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(idle)
    const sweep = startDeliverySweep({ process, intervalMs: 1000, logger })
    await vi.advanceTimersByTimeAsync(1000)
    expect(reported).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(process).toHaveBeenCalledTimes(2)
    await sweep.stop()
  })
})
