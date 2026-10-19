// Branded ids: a ProjectId can't be passed where an OrganizationId is expected. Imports nothing.
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type OrganizationId = Brand<string, "OrganizationId">
export type ProjectId = Brand<string, "ProjectId">
export type AgentId = Brand<string, "AgentId">
export type RunId = Brand<string, "RunId">
export type ApprovalId = Brand<string, "ApprovalId">
export type UserId = Brand<string, "UserId">
export type FeatureFlagKey = Brand<string, "FeatureFlagKey">

export const OrganizationId = (id: string) => id as OrganizationId
export const ProjectId = (id: string) => id as ProjectId
export const AgentId = (id: string) => id as AgentId
export const RunId = (id: string) => id as RunId
export const ApprovalId = (id: string) => id as ApprovalId
export const UserId = (id: string) => id as UserId
export const FeatureFlagKey = (key: string) => key as FeatureFlagKey
