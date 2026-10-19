// The product's feature flags. Add one with defineFlags, read it through the API's flag client or
// the web app's useFlag, and ramp it with the operator operations (`.claude/skills/feature-flags`).
// Remove it here when it is reclaimed: the compiler lists every call site left.
import { defineFlags } from "./define"

export const flags = defineFlags({
  // The template's example, gating the "What's new" card on the organization home. Reclaim it and
  // remove it as the first walkthrough of the lifecycle, or keep it for your own release notes.
  "whats-new-card": {
    description: "Show the What's new card on the organization home page",
    owner: "platform",
    default: false,
    reclaimBy: "2027-04-30",
  },
})

export type FlagKey = keyof typeof flags
