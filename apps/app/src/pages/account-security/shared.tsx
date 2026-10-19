import { useState } from "react"

import { accountErrorMessage } from "../../lib/account-api"

// The sections of the Security page (board Security). Each takes its data and callbacks as props.
// Errors a call throws are shown in the section; the container has already mapped their copy.

export const ROW = "flex flex-wrap items-center gap-3 border-t border-border py-2.5"
export const ROW_LAST = "flex flex-wrap items-center gap-3 border-y border-border py-2.5"
export const TEXT = "flex min-w-[12rem] flex-1 flex-col leading-snug"
export const META = "text-[13px] text-muted-foreground"

export function useAction<T extends unknown[]>(run: (...args: T) => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const call = async (...args: T) => {
    setBusy(true)
    setError(null)
    try {
      await run(...args)
      return true
    } catch (caught) {
      setError(accountErrorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, call }
}
