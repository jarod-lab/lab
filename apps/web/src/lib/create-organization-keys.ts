/** Query keys for the create-organization flow (the slug availability check). */
export const createOrganizationKeys = {
  slugAvailable: (slug: string) => ["organization-slug-available", slug] as const,
}
