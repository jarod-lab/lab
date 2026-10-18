import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { useState } from "react"

import { CreateOrganizationPage } from "../pages/create-organization-page"
import { createOrganizationKeys } from "../lib/create-organization-keys"
import { qk } from "../lib/query-keys"
import { slugProblem } from "../lib/org-slug"
import type { WebAuth, WebOrganization } from "../lib/web-auth"
import { useSetActiveOrganization } from "./shell-data"

export interface CreateOrganizationContainerProps {
  auth: WebAuth
  /** Shown before the slug, e.g. "app.example.com/". */
  host: string
  /** After the organization exists and is the active one. */
  onCreated: (organization: WebOrganization) => void
  onCancel: () => void
}

/**
 * Data for "Create an organization": checks the slug's availability once it settles (never for a
 * bad shape), and creates the organization, makes it active and reports it.
 */
export function CreateOrganizationContainer({
  auth,
  host,
  onCreated,
  onCancel,
}: CreateOrganizationContainerProps) {
  const queryClient = useQueryClient()
  const setActive = useSetActiveOrganization(auth)
  const [slug, setSlug] = useState("")
  const [settled] = useDebouncedValue(slug, { wait: 300 })
  const check = useQuery({
    queryKey: createOrganizationKeys.slugAvailable(settled),
    queryFn: () => auth.checkSlug(settled),
    enabled: settled.length > 0 && slugProblem(settled) === null,
    retry: false,
    staleTime: 0,
  })

  // Only a slug with a valid shape is checked; "checking" until the typed value has settled.
  let slugAvailable: boolean | "checking" | undefined
  if (slug.length > 0 && slugProblem(slug) === null) {
    const pending = settled !== slug || check.isPending || check.isFetching
    slugAvailable = pending ? "checking" : check.data
  }

  const submit = async ({ name, slug: nextSlug }: { name: string; slug: string }) => {
    const organization = await auth.createOrganization({ name, slug: nextSlug })
    await queryClient.invalidateQueries({ queryKey: qk.organizations() })
    await setActive.mutateAsync(organization.id)
    onCreated(organization)
  }

  return (
    <CreateOrganizationPage
      host={host}
      slugAvailable={slugAvailable}
      slugCheckFailed={check.isError}
      onSlugChange={setSlug}
      onSubmit={submit}
      onCancel={onCancel}
    />
  )
}
