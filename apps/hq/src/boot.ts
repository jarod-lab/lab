// What hq decides when it starts, as one function server.ts calls and nothing else: a deployed hq
// (NODE_ENV not development or test) must not have public sign-up on, and takes founders by user id
// only. Kept out of server.ts so a test can reach it: deleting either decision reopens the N5
// squatter (an account registered with a founder's address, verified from the founder's inbox).
import type { Database } from "@lab/db"

import { type FounderSeed, type FounderSync, syncFounders } from "./data/founders"
import { assertSignUpClosedWhenDeployed, isProductionLike } from "./deploy-mode"

export interface BootConfig {
  nodeEnv: string | undefined
  /** HQ_ALLOW_SIGNUP. */
  allowSignUp: boolean
  /** HQ_FOUNDERS, parsed. */
  founders: readonly FounderSeed[]
}

/**
 * Refuses to start (throws) a deployed hq with sign-up open, then sets the founders table to the
 * list: in a deployed hq an `email=` entry is skipped and only `id:` entries count.
 */
export async function prepareBoot(
  config: BootConfig,
  db: Database,
  now: Date,
): Promise<FounderSync> {
  assertSignUpClosedWhenDeployed(config)
  return syncFounders(db, config.founders, now, { pinnedOnly: isProductionLike(config.nodeEnv) })
}
