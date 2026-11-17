// The founder the hq target (e2e.config.ts, scripts/e2e-hq-stack.mjs) seeds. hq lets in only
// founders, and an address counts once verified, which hq has no mail sink for: the stack signs this
// account up and marks it verified at startup. Local stack only. Not a test file.
export const HQ_FOUNDER_EMAIL = "hq-founder@example.test"
export const HQ_FOUNDER_PASSWORD = "e2e hq founder on the local stack only"
