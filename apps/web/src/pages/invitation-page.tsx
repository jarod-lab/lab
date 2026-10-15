import { useEffect, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { NotYou } from "../components/not-you"
import { SignInOrUp } from "../components/sign-in-or-up"
import { messageOf } from "../lib/messages"
import type { WebAuth, WebInvitation } from "../lib/web-auth"

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; invitation: WebInvitation }
  | { status: "accepted"; organizationName: string }

/**
 * The link in an invitation email. The invitation can only be read by a signed-in person, so the
 * page signs them in or up first (with the invited address), then shows the invitation to accept.
 */
export function InvitationPage({ auth, invitationId }: { auth: WebAuth; invitationId: string }) {
  const [state, setState] = useState<State>({ status: "loading" })
  const [reloads, setReloads] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const session = await auth.getSession()
        if (!session) {
          if (live) setState({ status: "signed-out" })
          return
        }
        const invitation = await auth.getInvitation(invitationId)
        if (live) setState({ status: "ready", invitation })
      } catch (caught) {
        if (live) setState({ status: "error", message: messageOf(caught) })
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [auth, invitationId, reloads])

  async function accept(invitation: WebInvitation) {
    setPending(true)
    setError(null)
    try {
      await auth.acceptInvitation(invitation.id)
      setState({ status: "accepted", organizationName: invitation.organizationName })
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  if (state.status === "loading") return <AuthCard title="Loading" />

  if (state.status === "signed-out") {
    return (
      <AuthCard
        title="Accept your invitation"
        description="Sign in or create an account with the email address the invitation was sent to."
      >
        <SignInOrUp
          auth={auth}
          hint="You will then be asked to accept the invitation."
          onSignedIn={() => setReloads((n) => n + 1)}
        />
      </AuthCard>
    )
  }

  if (state.status === "error") {
    return (
      <AuthCard title="Invitation unavailable">
        <ErrorAlert message={state.message} />
      </AuthCard>
    )
  }

  if (state.status === "accepted") {
    return (
      <AuthCard
        title="You have joined"
        description={`You are now a member of ${state.organizationName}.`}
        footer={
          <a href="/settings/agents" className="underline underline-offset-4">
            Go to your settings
          </a>
        }
      />
    )
  }

  const { invitation } = state
  return (
    <AuthCard
      title={`Join ${invitation.organizationName}`}
      description={`This invitation was sent to ${invitation.email} as ${invitation.role}.`}
      footer={<NotYou auth={auth} onSignedOut={() => setReloads((n) => n + 1)} />}
    >
      <div className="flex flex-col gap-4">
        {invitation.status !== "pending" ? (
          <ErrorAlert message={`This invitation is ${invitation.status}.`} />
        ) : null}
        <ErrorAlert message={error} />
        <Button
          type="button"
          disabled={pending || invitation.status !== "pending"}
          onClick={() => void accept(invitation)}
        >
          {pending ? "Please wait" : "Accept invitation"}
        </Button>
      </div>
    </AuthCard>
  )
}
