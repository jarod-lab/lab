// Branded ids: a ProjectId can't be passed where an OrganizationId is expected. Imports nothing.
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type OrganizationId = Brand<string, "OrganizationId">
export type ProjectId = Brand<string, "ProjectId">

export const OrganizationId = (id: string) => id as OrganizationId
export const ProjectId = (id: string) => id as ProjectId
