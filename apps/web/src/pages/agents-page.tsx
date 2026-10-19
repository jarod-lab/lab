import { type ReactNode, useEffect, useRef, useState } from "react"

import { Badge } from "@starter/ui/components/ui/badge"
import { Button } from "@starter/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@starter/ui/components/ui/card"

import { ConfirmDialog } from "../components/confirm-dialog"
import { ErrorAlert } from "../components/auth-card"
import type { AgentsApi, AuditEvent, ConnectedAgent } from "../lib/agents-api"
import { messageOf } from "../lib/messages"

const AGENT_TYPE_LABEL: Record<ConnectedAgent["type"], string> = {
  oauthClient: "Application",
  apiKey: "API key",
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never")

/**
 * Runs a call that may need a recent sign-in first (the route passes `useReauthGuard()`). Without one,
 * the call runs as it is.
 */
export type CallGuard = <T>(action: () => Promise<T>) => Promise<T>

const unguarded: CallGuard = (action) => action()

/** The agents connected to the active organization, with revoke, and the audit trail. */
export function AgentsPage({
  api,
  pills,
  guard = unguarded,
}: {
  api: AgentsApi
  pills?: ReactNode
  /** Wraps the revoke, which needs a recent sign-in (revoke_agent_access). */
  guard?: CallGuard
}) {
  const [agents, setAgents] = useState<ConnectedAgent[] | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const revokingRef = useRef(false)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [loadedAgents, audit] = await Promise.all([api.listAgents(), api.listAuditEvents()])
        if (!live) return
        setAgents(loadedAgents)
        setEvents(audit.events)
        setNextCursor(audit.nextCursor)
      } catch (caught) {
        if (live) setError(messageOf(caught))
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [api])

  async function revoke(agent: ConnectedAgent) {
    // The confirm doesn't close the dialog, so a second click would send a second revoke.
    if (revokingRef.current) return
    revokingRef.current = true
    setBusy(true)
    setError(null)
    try {
      await guard(() => api.revokeAgent(agent.id))
      setAgents((current) => (current ?? []).filter((item) => item.id !== agent.id))
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      revokingRef.current = false
      setBusy(false)
    }
  }

  async function loadMore() {
    if (!nextCursor) return
    setBusy(true)
    setError(null)
    try {
      const page = await api.listAuditEvents(nextCursor)
      setEvents((current) => [...current, ...page.events])
      setNextCursor(page.nextCursor)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">Agents and activity</h2>
          <p className="text-sm text-muted-foreground">
            Applications and API keys that act in your organization, and what they have done.
          </p>
        </div>
        {pills}
      </header>
      <ErrorAlert message={error} />

      <section aria-labelledby="agents-heading" className="flex flex-col gap-3">
        <h2 id="agents-heading" className="text-lg font-medium">
          Connected agents
        </h2>
        {agents === null ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents are connected.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {agent.name}
                      <Badge variant="secondary">{AGENT_TYPE_LABEL[agent.type]}</Badge>
                    </CardTitle>
                    <CardDescription>
                      Connected {formatDate(agent.createdAt)} · Last used{" "}
                      {formatDate(agent.lastUsedAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm">
                      Access: {agent.access.length > 0 ? agent.access.join(", ") : "none"}
                    </p>
                    <ConfirmDialog
                      trigger={
                        <Button variant="destructive" size="sm" disabled={busy}>
                          Revoke access
                        </Button>
                      }
                      title={`Revoke access for ${agent.name}?`}
                      description="It stops working straight away. You can connect it again later."
                      confirmLabel="Revoke access"
                      destructive
                      pending={busy}
                      onConfirm={() => void revoke(agent)}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-heading" className="flex flex-col gap-3">
        <h2 id="audit-heading" className="text-lg font-medium">
          Recent activity
        </h2>
        {events.length === 0 && agents !== null ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : null}
        {events.length > 0 ? (
          <ol className="flex flex-col divide-y rounded-md border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-1 p-3 text-sm">
                <span className="font-medium">{event.operation}</span>
                <span className="text-muted-foreground">
                  {formatDate(event.at)} · {event.actor.type} · {event.outcome}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {nextCursor ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => void loadMore()}
          >
            Load more
          </Button>
        ) : null}
      </section>
    </div>
  )
}
