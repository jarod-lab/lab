// Sends notification emails (docs/notifications.md). @byo-oss/notifications writes a delivery row when a
// notification is routed to email; delayed emails and retries go out only when something calls
// `processDeliveries`, so the API process does, on a timer. Every replica may run it: each
// delivery is claimed before it is sent, so two sweeps never send the same email.
import { reportError } from "@starter/errors"
import type { Logger } from "@starter/logger"

export interface SweepResult {
  sent: number
  skipped: number
  retrying: number
  failed: number
  hasMore: boolean
}

export interface DeliverySweepOptions {
  /** One batch: `auth.api.processDeliveries({})`. */
  process: () => Promise<SweepResult>
  intervalMs: number
  logger: Logger
}

/** A backlog drains a few batches per tick, so one tick never runs for long. */
const MAX_BATCHES_PER_TICK = 5

export function startDeliverySweep(opts: DeliverySweepOptions): { stop: () => Promise<void> } {
  let running: Promise<void> | undefined
  const tick = async () => {
    for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
      const result = await opts.process()
      if (result.sent || result.failed || result.retrying) {
        opts.logger.info(result, "notification emails processed")
      }
      if (!result.hasMore) return
    }
  }
  const timer = setInterval(() => {
    // a slow tick (SES throttling) is not overlapped by the next one
    if (running) return
    running = tick()
      .catch((error: unknown) => {
        reportError(error, { job: "notification-delivery-sweep" })
      })
      .finally(() => {
        running = undefined
      })
  }, opts.intervalMs)
  // the sweep alone never keeps the process alive
  timer.unref()
  return {
    async stop() {
      clearInterval(timer)
      await running
    },
  }
}
