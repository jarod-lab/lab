import { useEffect, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"
import { FieldDescription } from "@starter/ui/components/ui/field"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { OrganizationSwitcher } from "../components/organization-switcher"
import { describeScope, splitScopes } from "../lib/scopes"
import { messageOf } from "../lib/messages"
import { navigateTo } from "../lib/navigation"
import type { WebAuth, WebOrganization } from "../lib/web-auth"

type Loaded<T> =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & T)

interface ConsentData {
  clientName: string
  organizations: WebOrganization[]
  activeOrganizationId: string | null
}

/**
 * Asks the signed-in person to allow an application, in one organization. The organization switcher
 * applies first: the active organization is set (set-active) before the grant is recorded, because
 * the token's `org` claim comes from the session's active organization.
 */
export function ConsentPage({
  auth,
  clientId,
  scope,
}: {
  auth: WebAuth
  clientId: string | undefined
  scope: string | undefined
}) {
  const [loaded, setLoaded] = useState<Loaded<ConsentData>>({ status: "loading" })
  const [selected, setSelected] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function load() {
      if (!clientId) {
        setLoaded({ status: "error", message: "This page needs an authorization request." })
        return
      }
      try {
        const session = await auth.getSession()
        if (!session) {
          if (live) setLoaded({ status: "signed-out" })
          return
        }
        const [clientName, organizations] = await Promise.all([
          auth.getClientName(clientId),
          auth.listOrganizations(),
        ])
        if (!live) return
        setSelected(session.activeOrganizationId ?? organizations[0]?.id ?? "")
        setLoaded({
          status: "ready",
          clientName: clientName ?? "An application",
          organizations,
          activeOrganizationId: session.activeOrganizationId,
        })
      } catch (caught) {
        if (live) setLoaded({ status: "error", message: messageOf(caught) })
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [auth, clientId])

  if (loaded.status === "loading") return <AuthCard title="Loading" />
  if (loaded.status === "signed-out") {
    return (
      <AuthCard
        title="Sign in to continue"
        description="You need to be signed in to allow an application."
        footer={
          <a href="/sign-in" className="underline underline-offset-4">
            Go to sign in
          </a>
        }
      >
        <p className="text-sm text-muted-foreground">Sign in, then start the connection again.</p>
      </AuthCard>
    )
  }
  if (loaded.status === "error") {
    return (
      <AuthCard title="This request cannot be shown">
        <ErrorAlert message={loaded.message} />
      </AuthCard>
    )
  }

  const scopes = splitScopes(scope)

  async function decide(accept: boolean) {
    setPending(true)
    setError(null)
    try {
      // Always, not only on a change: another tab may have switched the active org since load,
      // and consent grants whichever org is active on the server.
      if (accept) await auth.setActiveOrganization(selected)
      const url = await auth.consent(accept)
      if (url) navigateTo(url)
      else setPending(false)
    } catch (caught) {
      setError(messageOf(caught))
      setPending(false)
    }
  }

  return (
    <AuthCard title={`Allow ${loaded.clientName} to connect?`}>
      <div className="flex flex-col gap-4">
        <section aria-labelledby="consent-scopes-heading" className="flex flex-col gap-2">
          <h2 id="consent-scopes-heading" className="text-sm font-medium">
            It will be able to
          </h2>
          {scopes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No specific permissions were requested.</p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {scopes.map((item) => (
                <li key={item}>{describeScope(item)}</li>
              ))}
            </ul>
          )}
        </section>
        {loaded.organizations.length === 0 ? (
          <ErrorAlert message="You do not belong to an organization, so there is nothing to grant." />
        ) : (
          <OrganizationSwitcher
            organizations={loaded.organizations}
            value={selected}
            disabled={pending}
            onChange={setSelected}
          />
        )}
        <ErrorAlert message={error} />
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={pending || loaded.organizations.length === 0}
            onClick={() => decide(true)}
          >
            Allow
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => decide(false)}
          >
            Deny
          </Button>
        </div>
        <FieldDescription>
          You can revoke this access later in the agents settings.
        </FieldDescription>
      </div>
    </AuthCard>
  )
}

interface OrganizationChoice {
  organizations: WebOrganization[]
  activeOrganizationId: string | null
}

/**
 * Shown when the session has no usable active organization. Sets the one picked, then resumes the
 * OAuth flow with `POST /oauth2/continue { postLogin: true }`.
 */
export function SelectOrganizationPage({ auth }: { auth: WebAuth }) {
  const [loaded, setLoaded] = useState<Loaded<OrganizationChoice>>({ status: "loading" })
  const [selected, setSelected] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const session = await auth.getSession()
        if (!session) {
          if (live) setLoaded({ status: "signed-out" })
          return
        }
        const organizations = await auth.listOrganizations()
        if (!live) return
        setSelected(session.activeOrganizationId ?? organizations[0]?.id ?? "")
        setLoaded({
          status: "ready",
          organizations,
          activeOrganizationId: session.activeOrganizationId,
        })
      } catch (caught) {
        if (live) setLoaded({ status: "error", message: messageOf(caught) })
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [auth])

  if (loaded.status === "loading") return <AuthCard title="Loading" />
  if (loaded.status === "signed-out") {
    return (
      <AuthCard
        title="Sign in first"
        footer={
          <a href="/sign-in" className="underline underline-offset-4">
            Go to sign in
          </a>
        }
      >
        <p className="text-sm text-muted-foreground">Choose an organization after you sign in.</p>
      </AuthCard>
    )
  }
  if (loaded.status === "error") {
    return (
      <AuthCard title="Organizations unavailable">
        <ErrorAlert message={loaded.message} />
      </AuthCard>
    )
  }

  async function continueWith() {
    setPending(true)
    setError(null)
    try {
      await auth.setActiveOrganization(selected)
      const url = await auth.continueOAuth()
      if (url) navigateTo(url)
      else {
        setError("The sign-in could not be resumed. Start it again from the application.")
        setPending(false)
      }
    } catch (caught) {
      setError(messageOf(caught))
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Choose an organization"
      description="The application will act in the organization you pick."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void continueWith()
        }}
      >
        {loaded.organizations.length === 0 ? (
          <ErrorAlert message="You do not belong to an organization yet." />
        ) : (
          <OrganizationSwitcher
            organizations={loaded.organizations}
            value={selected}
            disabled={pending}
            onChange={setSelected}
          />
        )}
        <ErrorAlert message={error} />
        <Button type="submit" disabled={pending || loaded.organizations.length === 0}>
          {pending ? "Please wait" : "Continue"}
        </Button>
      </form>
    </AuthCard>
  )
}
