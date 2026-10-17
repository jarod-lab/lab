import { useThrottledCallback } from "@tanstack/react-pacer"
import { useEffect } from "react"

/** The gap between two refreshes of a live run. Pacer allows one refresh per gap; the driver ticks faster. */
export const LIVE_POLL_MS = 2500
const DRIVER_TICK_MS = 500

/**
 * Refreshes a live run every ~2.5 seconds with TanStack Pacer: a timer ticks, and a throttled refresh
 * runs at most once per window, on the first tick once the window has passed. It runs only while the
 * run is live and the document is visible; it stops when the run finishes, when the tab is hidden
 * (and restarts, at once, when it is shown again) and when the component unmounts.
 */
export function useRunPolling({ live, refresh }: { live: boolean; refresh: () => void }) {
  const throttled = useThrottledCallback(() => refresh(), {
    wait: LIVE_POLL_MS,
    leading: true,
    trailing: false,
  })

  useEffect(() => {
    if (!live) return
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (timer !== undefined) return
      throttled()
      timer = setInterval(() => throttled(), DRIVER_TICK_MS)
    }
    const stop = () => {
      if (timer === undefined) return
      clearInterval(timer)
      timer = undefined
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop()
      else start()
    }
    if (document.visibilityState !== "hidden") start()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [live, throttled])
}
