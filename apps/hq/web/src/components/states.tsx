import type { HqError } from "../api/errors"
import { Button } from "@lab/ui/components/ui/button"

/** The one table of error copy. Nothing else in the app words an HqError. */
export function describeError(error: HqError): { title: string; body: string } {
  switch (error.kind) {
    case "unauthorized":
      return { title: "Sign in required", body: "Your session ended. Sign in again to continue." }
    case "forbidden":
      return {
        title: "Founders only",
        body: "This account is signed in but is not a founder, so hq refused the request.",
      }
    case "untrusted-origin":
      return {
        title: "Open the app on its canonical host",
        body: "hq only accepts changes from the organization's canonical host. Open the app on the org's canonical host and try again.",
      }
    case "not-found":
      return { title: "Not found", body: "hq has nothing at that address." }
    case "conflict":
      return {
        title: "Already decided",
        body: "That was already decided. Reload to see how it ended.",
      }
    case "bad-request":
      return {
        title: "Request not accepted",
        body: "hq could not use that request. Reload and try again.",
      }
    case "rate-limited": {
      const seconds = error.retryAfterSeconds ?? 5
      return {
        title: "Too many attempts",
        body: `Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`,
      }
    }
    case "refused":
      return {
        title: "hq refused to start",
        body: "hq refused to start, so it serves nothing right now. Nothing is wrong with your account. Ask a founder to check hq's deployment, then retry.",
      }
    case "unreachable":
      return { title: "Could not reach the server", body: "Check your connection, then retry." }
    case "server":
      return {
        title: "hq had a problem",
        body: "hq answered with a server error. Retry in a moment.",
      }
  }
}

export function ErrorBlock({ error, onRetry }: { error: HqError; onRetry?: () => void }) {
  const { title, body } = describeError(error)
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-card border border-border bg-card p-4"
    >
      <p className="m-0 text-sm font-medium text-destructive">{title}</p>
      <p className="m-0 text-sm text-soft">{body}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="min-h-touch" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <output
      aria-busy="true"
      className="block rounded-card border border-border bg-muted p-4 text-sm text-muted-foreground"
    >
      Loading {label}
    </output>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-muted p-4">
      <p className="m-0 text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="m-0 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

/** A value hq has no source for: never a number, always this. */
export function NotConnected({ source, what }: { source: string; what: string }) {
  return (
    <output className="flex flex-col gap-1 rounded-card border border-border bg-muted p-3.5">
      <span className="text-xs text-muted-foreground">{what}</span>
      <span className="text-sm font-medium text-soft">Not connected</span>
      <span className="text-xs text-faint">{source} is not connected to hq yet.</span>
    </output>
  )
}
