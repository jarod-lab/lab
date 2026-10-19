import { useEffect, useState } from "react"

import { OrgMark } from "@starter/ui/dplus/org-mark"
import { Button } from "@starter/ui/components/ui/button"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { NotYou } from "../components/not-you"
import { SignInOrUp } from "../components/sign-in-or-up"
import { messageOf } from "../lib/messages"
import { type Permission, roleLabelOf } from "../lib/members"
import { getOrgSettingsApi } from "../lib/org-settings-api"
import type { WebAuth, WebInvitation } from "../lib/web-auth"

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; invitation: WebInvitation; signedInAs: string }
  | { status: "accepted"; organizationName: string }
  | { status: "declined"; organizationName: string }

/** What a role can do, as the catalog answers it (roleAllows = the plugin's own check). */
const CAPABILITIES: { can: string; cannot: string; permission: Permission }[] = [
  {
    can: "See agents, runs and settings",
    cannot: "Can't see agents, runs or settings",
    permission: { agent: ["read"] },
  },
  {
    can: "Start runs and steer them",
    cannot: "Can't start runs or steer them",
    permission: { run: ["create"] },
  },
  { can: "Approve actions", cannot: "Can't approve actions", permission: { run: ["approve"] } },
  {
    can: "Change settings",
    cannot: "Can't change settings",
    permission: { organization: ["update"] },
  },
]

/** Whole days until the invitation stops working, as the copy says it. */
function expiryLine(expiresAt: string | undefined, now: number): string | null {
  if (!expiresAt) return null
  const days = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000)
  if (Number.isNaN(days)) return null
  if (days <= 0) return "This invitation has expired."
  if (days === 1) return "This invitation expires in 1 day."
  return `This invitation expires in ${days} days.`
}

/** The page's first state: the invitation for a signed-in person, or why there isn't one. */
async function loadInvitation(auth: WebAuth, invitationId: string): Promise<State> {
  try {
    const session = await auth.getSession()
    if (!session) return { status: "signed-out" }
    const invitation = await auth.getInvitation(invitationId)
    return { status: "ready", invitation, signedInAs: session.user.email }
  } catch (caught) {
    return { status: "error", message: messageOf(caught) }
  }
}

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
    void loadInvitation(auth, invitationId).then((next) => {
      if (live) setState(next)
    })
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

  async function decline(invitation: WebInvitation) {
    setPending(true)
    setError(null)
    try {
      await auth.rejectInvitation?.(invitation.id)
      setState({ status: "declined", organizationName: invitation.organizationName })
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
      <AuthCard
        title="Invitation unavailable"
        footer={<NotYou auth={auth} onSignedOut={() => setReloads((n) => n + 1)} />}
      >
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

  if (state.status === "declined") {
    return (
      <AuthCard
        title="Invitation declined"
        description={`You did not join ${state.organizationName}. The person who invited you can see that.`}
      />
    )
  }

  const { invitation, signedInAs } = state
  const expiry = expiryLine(invitation.expiresAt, Date.now())
  const notPending = invitation.status !== "pending"
  const api = getOrgSettingsApi()

  return (
    <AuthCard
      title={invitation.organizationName}
      description={
        invitation.inviterEmail
          ? `${invitation.inviterEmail} invited you to join this organization.`
          : "You have been invited to join this organization."
      }
    >
      <div className="flex items-center gap-3">
        <OrgMark name={invitation.organizationName} look="outline" size="lg" />
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Your role</span>
          <span className="w-fit rounded-full border-[1.5px] border-foreground px-2.5 text-[13px] font-bold">
            {roleLabelOf(invitation.role)}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 rounded-[10px] border border-border p-3.5 text-sm">
        {CAPABILITIES.map((item) => {
          const allowed = api.roleAllows(invitation.role, item.permission)
          return (
            <li key={item.can} className={`flex gap-2 ${allowed ? "" : "text-muted-foreground"}`}>
              <span aria-hidden="true" className="mt-0.5">
                {allowed ? "✓" : "–"}
              </span>
              {allowed ? item.can : item.cannot}
            </li>
          )
        })}
      </ul>
      {notPending ? (
        <p className="text-sm text-destructive">This invitation is {invitation.status}.</p>
      ) : null}
      <ErrorAlert message={error} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-12 flex-1"
          disabled={pending || notPending}
          onClick={() => void accept(invitation)}
        >
          {pending ? "Please wait" : "Accept"}
        </Button>
        {auth.rejectInvitation ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 flex-1"
            disabled={pending || notPending}
            onClick={() => void decline(invitation)}
          >
            Decline
          </Button>
        ) : null}
      </div>
      <p className="text-sm">
        Signed in as {signedInAs} ·{" "}
        <button
          type="button"
          className="text-foreground underline underline-offset-4"
          disabled={pending}
          onClick={() => {
            void auth.signOut().then(() => setReloads((n) => n + 1))
          }}
        >
          Switch account
        </button>
      </p>
      {expiry ? (
        <p className="text-[13px] text-muted-foreground">
          {expiry} Declining tells the person who invited you; nothing else is shared.
        </p>
      ) : null}
    </AuthCard>
  )
}
