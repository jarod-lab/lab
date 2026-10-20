import { OpenFeature, type Provider } from "@openfeature/web-sdk"
import { OpenFeatureProvider } from "@openfeature/react-sdk"
import { type ReactNode, useEffect, useState } from "react"

import { createFlagProvider, FLAG_DOMAIN, flagContext } from "../lib/flags"

export interface OrgFeaturesProps {
  organizationId: string
  /** The OpenFeature provider for this organization. Defaults to OFREP against this origin. */
  createProvider?: (organizationId: string) => Provider
  children: ReactNode
}

/**
 * What an organization's pages can read about the product itself: its feature flags (OpenFeature,
 * bound to FLAG_DOMAIN for this organization). Mounted inside OrgGate, so they are asked for the
 * organization the session acts in.
 */
export function OrgFeatures({
  organizationId,
  createProvider = createFlagProvider,
  children,
}: OrgFeaturesProps) {
  // One provider per organization; switching organizations replaces it (the SDK closes the old one).
  // The pages mount only once it is set: a flag hook that first reads the default provider (ready
  // already) never hears the new one become ready, and would keep the catalog default.
  const [boundTo, setBoundTo] = useState<string | null>(null)
  useEffect(() => {
    OpenFeature.setProvider(
      FLAG_DOMAIN,
      createProvider(organizationId),
      flagContext(organizationId),
    )
    setBoundTo(organizationId)
  }, [organizationId, createProvider])

  if (boundTo !== organizationId) return null
  return <OpenFeatureProvider domain={FLAG_DOMAIN}>{children}</OpenFeatureProvider>
}
