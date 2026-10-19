import { payload, productClient, type RequestBody, type ResponseBody } from "./product-client"

// Feature flag rollouts (list_feature_flags and friends, /v1/feature-flags). Operator operations:
// only the operator organization may call them, and whoami says whether this is it. Every call
// names its organization and sends X-Organization-Id.

/** One flag with its rollout, as list_feature_flags returns it. */
export type FeatureFlag = ResponseBody<"list_feature_flags">["flags"][number]

/** One flag with its targets and daily evaluations, as get_feature_flag returns it. */
export type FeatureFlagDetail = ResponseBody<"get_feature_flag">

export type FlagStatus = FeatureFlag["status"]
export type FlagTarget = FeatureFlagDetail["targets"][number]

/** The fields update_feature_flag takes besides the key: percentage and the kill switch. */
export type FlagPatch = Omit<RequestBody<"update_feature_flag">, "key">

export interface FeatureFlagsApi {
  /** Whether the organization is the operator organization (whoami). */
  isOperator(organizationId: string): Promise<boolean>
  list(organizationId: string): Promise<FeatureFlag[]>
  get(organizationId: string, key: string): Promise<FeatureFlagDetail>
  update(organizationId: string, key: string, patch: FlagPatch): Promise<FeatureFlag>
  /** Turn the flag on (value true) or off for organizations named by id or slug. */
  target(
    organizationId: string,
    key: string,
    organizations: string[],
    value: boolean,
  ): Promise<FeatureFlag>
  untarget(organizationId: string, key: string, organization: string): Promise<FeatureFlag>
  reclaim(organizationId: string, key: string, value: boolean): Promise<FeatureFlag>
  remove(organizationId: string, key: string): Promise<void>
}

export function createFeatureFlagsApi(fetchImpl?: typeof fetch): FeatureFlagsApi {
  // Each call names its organization, so the client is made per call.
  const forOrg = (organizationId: string) => productClient(organizationId, fetchImpl)
  const key = (flag: string) => ({ params: { path: { key: flag } } })
  return {
    async isOperator(organizationId) {
      return (await payload(forOrg(organizationId).GET("/v1/whoami"))).operator
    },
    async list(organizationId) {
      return (await payload(forOrg(organizationId).GET("/v1/feature-flags"))).flags
    },
    get(organizationId, flag) {
      return payload(forOrg(organizationId).GET("/v1/feature-flags/{key}", key(flag)))
    },
    update(organizationId, flag, patch) {
      return payload(
        forOrg(organizationId).PATCH("/v1/feature-flags/{key}", { ...key(flag), body: patch }),
      )
    },
    target(organizationId, flag, organizations, value) {
      return payload(
        forOrg(organizationId).POST("/v1/feature-flags/{key}/targets", {
          ...key(flag),
          body: { organizations, value },
        }),
      )
    },
    untarget(organizationId, flag, organization) {
      return payload(
        forOrg(organizationId).DELETE("/v1/feature-flags/{key}/targets/{organization}", {
          params: { path: { key: flag, organization } },
        }),
      )
    },
    reclaim(organizationId, flag, value) {
      return payload(
        forOrg(organizationId).POST("/v1/feature-flags/{key}/reclaim", {
          ...key(flag),
          body: { value },
        }),
      )
    },
    async remove(organizationId, flag) {
      await payload(forOrg(organizationId).DELETE("/v1/feature-flags/{key}", key(flag)))
    },
  }
}

let shared: FeatureFlagsApi | undefined

/** The page's API for the browser, created on first use. */
export function getFeatureFlagsApi(): FeatureFlagsApi {
  shared ??= createFeatureFlagsApi()
  return shared
}
