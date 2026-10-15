import { useEffect, useId, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { OrganizationSwitcher } from "../components/organization-switcher"
import { SignInOrUp } from "../components/sign-in-or-up"
import { messageOf } from "../lib/messages"
import { describeScope, splitScopes } from "../lib/scopes"
import type { DeviceLookup, WebAuth, WebOrganization } from "../lib/web-auth"

interface Context {
  organizations: WebOrganization[]
  activeOrganizationId: string | null
}

interface Request {
  userCode: string
  clientName: string
  scope: string | undefined
}

/**
 * Approves or denies a device (headless) sign-in: the agent shows a code, the person enters it here.
 * Like consent, the chosen organization is set active before the approval, because the token's `org`
 * comes from the approving session's active organization.
 */
export function DevicePage({ auth, initialUserCode }: { auth: WebAuth; initialUserCode?: string }) {
  const codeId = useId()
  const [context, setContext] = useState<Context | null | undefined>(undefined)
  const [reloads, setReloads] = useState(0)
  const [code, setCode] = useState(initialUserCode ?? "")
  const [request, setRequest] = useState<Request | null>(null)
  const [selected, setSelected] = useState("")
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const session = await auth.getSession()
        if (!session) {
          if (live) setContext(null)
          return
        }
        const organizations = await auth.listOrganizations()
        if (!live) return
        setSelected(session.activeOrganizationId ?? organizations[0]?.id ?? "")
        setContext({ organizations, activeOrganizationId: session.activeOrganizationId })
      } catch (caught) {
        if (live) setError(messageOf(caught))
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [auth, reloads])

  if (context === undefined && !error) return <AuthCard title="Loading" />

  if (context === null) {
    return (
      <AuthCard
        title="Sign in to approve"
        description="Approve the agent that is asking to connect."
      >
        <SignInOrUp
          auth={auth}
          hint="Your agent is waiting for you to approve it."
          onSignedIn={() => setReloads((n) => n + 1)}
        />
      </AuthCard>
    )
  }

  async function find() {
    const userCode = code.trim()
    setPending(true)
    setError(null)
    try {
      const lookup: DeviceLookup = await auth.device.lookup(userCode)
      if (lookup.status !== "pending") {
        setError("This code is not waiting for approval. It may have been used or has expired.")
        setRequest(null)
        return
      }
      const clientName = lookup.clientId ? await auth.getClientName(lookup.clientId) : null
      setRequest({ userCode, clientName: clientName ?? "An agent", scope: lookup.scope })
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  async function decide(approve: boolean) {
    if (!request) return
    setPending(true)
    setError(null)
    try {
      if (approve) {
        if (context && selected !== context.activeOrganizationId) {
          await auth.setActiveOrganization(selected)
        }
        await auth.device.approve(request.userCode)
      } else {
        await auth.device.deny(request.userCode)
      }
      setOutcome(approve ? "approved" : "denied")
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  if (outcome) {
    return (
      <AuthCard
        title={outcome === "approved" ? "Approved" : "Denied"}
        description={
          outcome === "approved"
            ? "You can return to your agent. It will continue on its own."
            : "The agent was not given access."
        }
      />
    )
  }

  return (
    <AuthCard title="Connect a device" description="Enter the code your agent shows you.">
      <div className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={codeId}>Code</FieldLabel>
            <Input
              id={codeId}
              value={code}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={pending}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
          </Field>
        </FieldGroup>
        <Button
          type="button"
          variant="outline"
          disabled={pending || code.trim() === ""}
          onClick={() => void find()}
        >
          Find request
        </Button>
        <ErrorAlert message={error} />
        {request ? (
          <section aria-labelledby="device-request-heading" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="device-request-heading" className="text-sm font-medium">
                {request.clientName} wants to act for you
              </h2>
              <ul className="list-disc pl-5 text-sm">
                {splitScopes(request.scope).map((item) => (
                  <li key={item}>{describeScope(item)}</li>
                ))}
              </ul>
            </div>
            {context && context.organizations.length > 0 ? (
              <OrganizationSwitcher
                organizations={context.organizations}
                value={selected}
                disabled={pending}
                onChange={setSelected}
              />
            ) : (
              <ErrorAlert message="You do not belong to an organization, so there is nothing to grant." />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                disabled={pending}
                onClick={() => void decide(true)}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => void decide(false)}
              >
                Deny
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </AuthCard>
  )
}
