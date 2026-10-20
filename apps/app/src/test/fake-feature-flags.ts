import { vi } from "vitest"

import type { FeatureFlag, FeatureFlagDetail, FeatureFlagsApi } from "../lib/feature-flags-api"

/** A flag as list_feature_flags returns it, ramping by default. */
export function flagFixture(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    key: "new-search",
    description: "Search v2",
    owner: "search",
    default: false,
    reclaimBy: "2027-01-31",
    inCatalog: true,
    status: "ramping",
    enabled: true,
    percentage: 25,
    targetsOn: 1,
    targetsOff: 0,
    reclaimedValue: null,
    reclaimedAt: null,
    updatedAt: "2026-10-18T10:00:00.000Z",
    exposures: { on: 2000, off: 6000, errorsOn: 1, errorsOff: 3 },
    stale: [],
    ...overrides,
  }
}

/** The same flag with its targets and days, as get_feature_flag returns it. */
export function detailFixture(overrides: Partial<FeatureFlagDetail> = {}): FeatureFlagDetail {
  return {
    ...flagFixture(),
    targets: [
      {
        organizationId: "org-b",
        name: "Beta Co",
        slug: "beta",
        value: true,
        createdAt: "2026-10-17T10:00:00.000Z",
      },
    ],
    days: [],
    ...overrides,
  }
}

/** Every call answers with the fixtures; tests override what they look at. */
export function fakeFeatureFlagsApi(overrides: Partial<FeatureFlagsApi> = {}): FeatureFlagsApi {
  return {
    operatorOrganization: vi.fn(async () => "org-a"),
    list: vi.fn(async () => [flagFixture()]),
    get: vi.fn(async () => detailFixture()),
    update: vi.fn(async () => flagFixture()),
    target: vi.fn(async () => flagFixture()),
    untarget: vi.fn(async () => flagFixture()),
    reclaim: vi.fn(async () => flagFixture({ status: "reclaimed", reclaimedValue: true })),
    remove: vi.fn(async () => undefined),
    ...overrides,
  }
}
