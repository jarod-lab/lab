import { join } from "node:path"

// What the e2e stack configures support with (e2e.config.ts passes these to scripts/e2e-stack.mjs),
// shared with the support journeys. Local test values only. Not a test file.

/** The operator organization, seeded by the stack with the `admin` credential's account as owner. */
export const OPERATOR_ORGANIZATION_ID = "org_e2e_support_staff"
export const OPERATOR_SLUG = "e2e-support-staff"
/** Thread mail replies to support+<token>@ this domain. */
export const SUPPORT_REPLY_DOMAIN = "support.e2e.test"
/** Where journeys publish the DKIM keys they sign inbound mail with (scripts/e2e-dkim-dns.mjs). */
export const DKIM_DIR = join(process.cwd(), ".e2e", "dkim")
/**
 * Where each running stack writes `<web port>.json`: its web and API URLs, and the inbound relay's
 * secret it made for its API (SUPPORT_INBOUND_SECRET). The targets' stacks share one database, so
 * either one's support sweep may send a reply's mail, into its own mail sink: it is read from all.
 */
export const STACKS_DIR = join(process.cwd(), ".e2e", "stacks")
