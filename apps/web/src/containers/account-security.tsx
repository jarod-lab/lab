import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { RenderLink } from "@starter/ui/dplus/shell/link"

import { type AccountApi, AccountError } from "../lib/account-api"
import {
  SOCIAL_PROVIDERS,
  deviceLabel,
  relativeTime,
  signInMethodLabel,
} from "../lib/account-format"
import { accountKeys } from "../lib/account-keys"
import { navigateTo } from "../lib/navigation"
import { AccountSecurityPage } from "../pages/account-security-page"

export interface AccountSecurityContainerProps {
  api: AccountApi
  /** Where the sessions list sends a person whose sign-in is too old to read it. */
  signInHref?: string
  renderLink?: RenderLink
}

/** Errors that mean "sign in again" rather than a failure: the server needs a recent sign-in. */
const NEEDS_RECENT_SIGN_IN = new Set(["SESSION_NOT_FRESH", "SESSION_EXPIRED"])

/**
 * Data and mutations for the security page. Each list is its own query so one failing (for example
 * the sessions list, which needs a recent sign-in) leaves the rest of the page working.
 */
export function AccountSecurityContainer({
  api,
  signInHref = "/sign-in?next=/account/security",
  renderLink,
}: AccountSecurityContainerProps) {
  const queryClient = useQueryClient()
  const profile = useQuery({ queryKey: accountKeys.profile(), queryFn: () => api.getProfile() })
  const summary = useQuery({
    queryKey: accountKeys.securitySummary(),
    queryFn: () => api.securitySummary(),
  })
  const accounts = useQuery({ queryKey: accountKeys.accounts(), queryFn: () => api.listAccounts() })
  const passkeys = useQuery({ queryKey: accountKeys.passkeys(), queryFn: () => api.listPasskeys() })
  const sessions = useQuery({
    queryKey: accountKeys.sessions(),
    queryFn: () => api.listSessions(),
    retry: false,
  })

  if (!profile.isSuccess || !summary.isSuccess || !accounts.isSuccess || !passkeys.isSuccess) {
    if (profile.isError || summary.isError || accounts.isError || passkeys.isError) {
      return (
        <p role="alert" className="p-6 text-destructive">
          Could not load your security settings. Reload the page to try again.
        </p>
      )
    }
    return <output className="block p-6 text-muted-foreground">Loading…</output>
  }

  const linked = accounts.data
  const hasPassword = linked.some((account) => account.providerId === "credential")
  const connected = SOCIAL_PROVIDERS.map((provider) => {
    const account = linked.find((item) => item.providerId === provider.id)
    return {
      accountId: account?.id ?? null,
      provider: provider.id,
      label: provider.label,
      connectedAt: account?.createdAt ?? null,
    }
  })

  const sessionRows = (sessions.data ?? []).map((session) => ({
    token: session.token,
    device: deviceLabel(session.userAgent),
    method: signInMethodLabel(session.loginMethod, session.loginTwoFactor),
    when: session.current ? "Active now" : relativeTime(session.createdAt) || "Earlier",
    current: session.current,
  }))
  const currentSession = (sessions.data ?? []).find((session) => session.current)
  const sessionsNeedSignIn =
    sessions.isError &&
    sessions.error instanceof AccountError &&
    NEEDS_RECENT_SIGN_IN.has(sessions.error.code ?? "")
  // The sign-in this browser made. It comes from the sessions list, so it waits on that.
  const lastSignIn = (() => {
    if (currentSession) {
      const method = signInMethodLabel(currentSession.loginMethod, currentSession.loginTwoFactor)
      const when = relativeTime(currentSession.createdAt) || "recently"
      const device = deviceLabel(currentSession.userAgent)
      const lead = method ? `${method.charAt(0).toUpperCase()}${method.slice(1)}` : "Signed in"
      return [lead, when, device].join(" · ")
    }
    if (sessionsNeedSignIn) return "Sign in again to see this."
    return sessions.isError ? "Not available right now." : "Loading…"
  })()

  const refresh = (key: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey: key })

  return (
    <AccountSecurityPage
      name={profile.data?.name ?? ""}
      email={profile.data?.email ?? ""}
      renderLink={renderLink}
      signInHref={signInHref}
      summary={{
        hasPassword,
        passwordChangedAt: summary.data.passwordChangedAt,
        twoFactorEnabled: summary.data.twoFactorEnabled,
        twoFactorEnabledAt: summary.data.twoFactorEnabledAt,
        backupCodesRemaining: summary.data.backupCodesRemaining,
      }}
      lastSignIn={lastSignIn}
      passkeys={passkeys.data}
      connected={connected}
      sessions={sessionRows}
      sessionsNeedSignIn={sessionsNeedSignIn}
      onAddPasskey={async (name) => {
        await api.addPasskey(name)
        refresh(accountKeys.passkeys())
      }}
      onRenamePasskey={async (id, name) => {
        await api.renamePasskey(id, name)
        refresh(accountKeys.passkeys())
      }}
      onRemovePasskey={async (id) => {
        await api.deletePasskey(id)
        refresh(accountKeys.passkeys())
      }}
      onEnableTwoFactor={(password) => api.enableTwoFactor(password)}
      onConfirmTwoFactor={async (code) => {
        await api.confirmTwoFactor(code)
        refresh(accountKeys.securitySummary())
      }}
      onDisableTwoFactor={async (password) => {
        await api.disableTwoFactor(password)
        refresh(accountKeys.securitySummary())
      }}
      onNewBackupCodes={(password) => api.newBackupCodes(password)}
      onChangePassword={async (input) => {
        await api.changePassword({ ...input, revokeOtherSessions: false })
        refresh(accountKeys.securitySummary())
      }}
      onConnect={async (provider) => {
        const url = await api.linkSocial(provider, "/account/security")
        if (url) navigateTo(url)
      }}
      onDisconnect={async (accountId) => {
        await api.unlinkAccount(accountId)
        refresh(accountKeys.accounts())
      }}
      onRevokeSession={async (token) => {
        await api.revokeSession(token)
        refresh(accountKeys.sessions())
      }}
      onRevokeOtherSessions={async () => {
        await api.revokeOtherSessions()
        refresh(accountKeys.sessions())
      }}
    />
  )
}
