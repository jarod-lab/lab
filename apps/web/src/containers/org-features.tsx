import { OpenFeature, type Provider } from "@openfeature/web-sdk"
import { OpenFeatureProvider } from "@openfeature/react-sdk"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useEffect } from "react"

import type { FeatureFlagsApi } from "../lib/feature-flags-api"
import { createFlagProvider, FLAG_DOMAIN, flagContext } from "../lib/flags"
import { OperatorContext } from "../lib/operator"
import { qk } from "../lib/query-keys"

export interface OrgFeaturesProps {
  organizationId: string
  api: FeatureFlagsApi
  /** The OpenFeature provider for this organization. Defaults to OFREP against this origin. */
  createProvider?: (organizationId: string) => Provider
  children: ReactNode
}

/**
 * What an organization's pages can read about the product itself: its feature flags (OpenFeature,
 * bound to FLAG_DOMAIN for this organization) and whether it is the operator organization. Mounted
 * inside OrgGate, so both are asked for the organization the session acts in.
 */
export function OrgFeatures({
  organizationId,
  api,
  createProvider = createFlagProvider,
  children,
}: OrgFeaturesProps) {
  // A failed check reads as not the operator: the operator's tabs are a convenience, and its
  // operations are refused server-side to everyone else anyway.
  const operator = useQuery({
    queryKey: qk.org(organizationId).operator(),
    queryFn: () => api.isOperator(organizationId),
    staleTime: 5 * 60_000,
  })

  // One provider per organization; switching organizations replaces it (the SDK closes the old one).
  useEffect(() => {
    OpenFeature.setProvider(
      FLAG_DOMAIN,
      createProvider(organizationId),
      flagContext(organizationId),
    )
  }, [organizationId, createProvider])

  return (
    <OperatorContext.Provider value={operator.data === true}>
      <OpenFeatureProvider domain={FLAG_DOMAIN}>{children}</OpenFeatureProvider>
    </OperatorContext.Provider>
  )
}
