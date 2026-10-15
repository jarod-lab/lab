import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@starter/ui/components/ui/alert-dialog"
import { Badge } from "@starter/ui/components/ui/badge"
import { Button } from "@starter/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@starter/ui/components/ui/card"

import { ErrorAlert } from "../components/auth-card"
import type { AgentsApi, AuditEvent, ConnectedAgent } from "../lib/agents-api"
import { messageOf } from "../lib/messages"

const AGENT_TYPE_LABEL: Record<ConnectedAgent["type"], string> = {
  oauthClient: "Application",
  apiKey: "API key",
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never")

/** The agents connected to the active organization, with revoke, and the audit trail. */
export function AgentsPage({ api }: { api: AgentsApi }) {
  const [agents, setAgents] = useState<ConnectedAgent[] | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    setError(null)
    try {
      await api.revokeAgent(agent.id)
      setAgents((current) => (current ?? []).filter((item) => item.id !== agent.id))
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Agents and activity</h1>
        <p className="text-sm text-muted-foreground">
          Applications and API keys that act in your organization, and what they have done.
        </p>
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
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={<Button variant="destructive" size="sm" disabled={busy} />}
                      >
                        Revoke access
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke access for {agent.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            It stops working straight away. You can connect it again later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => void revoke(agent)}
                          >
                            Revoke access
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
    </main>
  )
}
