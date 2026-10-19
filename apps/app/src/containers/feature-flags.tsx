import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import type { RenderLink } from "@starter/ui/dplus/shell/link"

import type { FeatureFlagsApi } from "../lib/feature-flags-api"
import { messageOf } from "../lib/messages"
import { useIsOperator } from "../lib/operator"
import { qk } from "../lib/query-keys"
import type { WebAuth, WebOrganization } from "../lib/web-auth"
import { FeatureFlagsPage } from "../pages/feature-flags-page"
import { memberRoleQuery, orgRoleLabel } from "./shell-data"

export interface FeatureFlagsContainerProps {
  auth: WebAuth
  api: FeatureFlagsApi
  organization: WebOrganization
  renderLink?: RenderLink
}

/**
 * Data and actions for the Feature flags page (the operator organization only; others see why
 * not). Every write refreshes the list and the open flag. The server decides who may: an
 * organization's role needs featureFlag:update, and only the operator organization is let in.
 */
export function FeatureFlagsContainer({
  auth,
  api,
  organization,
  renderLink,
}: FeatureFlagsContainerProps) {
  const queryClient = useQueryClient()
  const organizationId = organization.id
  const isOperator = useIsOperator()
  const role = useQuery(memberRoleQuery(auth, organizationId))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const flags = useQuery({
    queryKey: qk.org(organizationId).featureFlags(),
    queryFn: () => api.list(organizationId),
    enabled: isOperator,
  })
  const detail = useQuery({
    queryKey: qk.org(organizationId).featureFlag(selectedKey ?? "none"),
    queryFn: () => api.get(organizationId, selectedKey ?? ""),
    enabled: isOperator && selectedKey !== null,
  })

  /** Runs a write, then refreshes every flag query (the list and the open flag share a prefix). */
  const write = useCallback(
    async (call: () => Promise<unknown>) => {
      try {
        await call()
      } finally {
        await queryClient.invalidateQueries({ queryKey: qk.org(organizationId).featureFlags() })
      }
    },
    [queryClient, organizationId],
  )

  return (
    <FeatureFlagsPage
      organization={organization}
      roleLabel={orgRoleLabel(role.data ?? undefined)}
      isOperator={isOperator}
      flags={flags.data}
      flagsError={flags.isError ? messageOf(flags.error) : null}
      onRetry={() => void flags.refetch()}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      detail={detail.data}
      detailError={detail.isError ? messageOf(detail.error) : null}
      onUpdate={(key, patch) => write(() => api.update(organizationId, key, patch))}
      onTarget={(key, organizations, value) =>
        write(() => api.target(organizationId, key, organizations, value))
      }
      onUntarget={(key, target) => write(() => api.untarget(organizationId, key, target))}
      onReclaim={(key, value) => write(() => api.reclaim(organizationId, key, value))}
      onDelete={async (key) => {
        await write(() => api.remove(organizationId, key))
        setSelectedKey(null)
      }}
      renderLink={renderLink}
    />
  )
}
