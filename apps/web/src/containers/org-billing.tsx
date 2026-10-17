import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { RenderLink } from "@starter/ui/dplus/shell/link"

import { type BillingAdapter, type BillingRedirect } from "../lib/billing/adapter"
import { getBillingAdapter } from "../lib/billing/select"
import { billingKeys } from "../lib/billing-keys"
import { type OrgSettingsApi } from "../lib/org-settings-api"
import { qk } from "../lib/query-keys"
import type { WebAuth, WebOrganization } from "../lib/web-auth"
import { memberRoleQuery, orgRoleLabel } from "./shell-data"
import { OrgBillingPage } from "../pages/org-billing-page"

/** Changing the subscription (plan, seats, payment, invoices, cancellation) is the owner's alone. */
const OWNER_ONLY = { subscription: ["update"] }

export interface OrgBillingContainerProps {
  auth: WebAuth
  api: OrgSettingsApi
  organization: WebOrganization
  /** Given by tests. The route leaves it out, and the server's `stripe` flag chooses the adapter. */
  adapter?: BillingAdapter
  renderLink?: RenderLink
}

/**
 * Data and actions for the Billing page. The adapter supplies the plan, the invoices and the
 * provider's pages; the caller's role decides which controls work. Every call names the
 * organization.
 */
export function OrgBillingContainer({
  auth,
  api,
  organization,
  adapter: adapterProp,
  renderLink,
}: OrgBillingContainerProps) {
  const queryClient = useQueryClient()
  const organizationId = organization.id
  const role = useQuery(memberRoleQuery(auth, organizationId))
  const roleText = role.data ?? ""
  const canChange = role.isSuccess && api.roleAllows(roleText, OWNER_ONLY)

  const modeQuery = useQuery({
    queryKey: billingKeys.mode(),
    queryFn: getBillingAdapter,
    staleTime: Number.POSITIVE_INFINITY,
    enabled: adapterProp === undefined,
  })
  const adapter = adapterProp ?? modeQuery.data

  const snapshot = useQuery({
    queryKey: billingKeys.snapshot(organizationId),
    queryFn: () => {
      if (!adapter) throw new Error("Billing is not ready.")
      return adapter.load(organizationId)
    },
    enabled: role.isSuccess && adapter !== undefined,
  })

  const usage = useQuery({
    queryKey: billingKeys.usage(organizationId),
    queryFn: () => {
      if (!adapter) throw new Error("Billing is not ready.")
      return adapter.usage(organizationId)
    },
    enabled: role.isSuccess && adapter !== undefined,
  })

  const members = useQuery({
    queryKey: qk.org(organizationId).members(),
    queryFn: () => api.listMembers(organizationId),
    enabled: role.isSuccess,
  })

  // Every provider action returns a page to open. The window is opened only after the server has
  // answered, so the browser may block it; `noopener` means the page can't tell us it was blocked.
  const open = useMutation({
    mutationFn: (action: () => Promise<BillingRedirect>) => action(),
    onSuccess: (result) => {
      if (result.url) window.open(result.url, "_blank", "noopener")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.snapshot(organizationId) })
    },
  })

  if (role.isError) {
    return (
      <p role="alert" className="p-6 text-destructive">
        Could not load your role in this organization.
      </p>
    )
  }
  if (modeQuery.isError || snapshot.isError || usage.isError) {
    return (
      <p role="alert" className="p-6 text-destructive">
        Could not load billing for this organization.
      </p>
    )
  }
  if (!role.isSuccess || !adapter || !snapshot.isSuccess || !members.isSuccess) {
    return <output className="block p-6 text-muted-foreground">Loading…</output>
  }

  const actionError = open.error instanceof Error ? open.error.message : null

  return (
    <OrgBillingPage
      organization={{ name: organization.name, slug: organization.slug }}
      roleLabel={orgRoleLabel(roleText)}
      canChange={canChange}
      mode={adapter.mode}
      snapshot={snapshot.data}
      usage={usage.data ?? null}
      seatsUsed={members.data.total}
      pending={open.isPending}
      actionError={actionError}
      onOpenPortal={() => open.mutate(() => adapter.openPortal(organizationId))}
      onChangePlan={(planId) => open.mutate(() => adapter.changePlan(organizationId, planId))}
      onCancel={() => open.mutate(() => adapter.cancel(organizationId))}
      renderLink={renderLink}
    />
  )
}
