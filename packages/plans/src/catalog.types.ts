// Type-level checks (pnpm typecheck runs them): the catalog's keys are literal unions, so a typo in
// a key the API, the web app or the site reads is a compile error.
import { defineEntitlements } from "@byo-oss/entitlements/catalog"
import type { CapacityKey, FeatureKey, MeteredKey, PlanKey } from "@byo-oss/entitlements/catalog"

import { catalog, type PlanCatalog, type PlanId } from "./catalog"

const feature: FeatureKey<PlanCatalog> = "sso"
// @ts-expect-error not a feature
const typo: FeatureKey<PlanCatalog> = "ssso"
const metered: MeteredKey<PlanCatalog> = "requests"
// @ts-expect-error seats is a capacity limit, not metered
const notMetered: MeteredKey<PlanCatalog> = "seats"
const capacity: CapacityKey<PlanCatalog> = "agents"
const plan: PlanKey<PlanCatalog> = "team"
// @ts-expect-error not a plan
const noPlan: PlanId = "enterprise"

// Each plan's `display` keeps its own type, so the catalog is the one copy of the plan copy.
const copy: string = catalog.plans.pro.display.name
const support: "Priority" = catalog.plans.team.display.support

// A catalog whose plans carry no `display` rejects a read of it at compile time.
const bare = defineEntitlements({
  features: ["sso"],
  limits: { requests: { kind: "metered", period: "day" } },
  plans: {
    free: { features: { sso: false }, limits: { requests: 10 } },
    pro: { features: { sso: true }, limits: { requests: 100 } },
  },
  defaultPlan: "free",
})
// @ts-expect-error free has no display
const noDisplay = bare.plans.free.display?.name

export const checks = [
  copy,
  support,
  noDisplay,
  feature,
  typo,
  metered,
  notMetered,
  capacity,
  plan,
  noPlan,
]
