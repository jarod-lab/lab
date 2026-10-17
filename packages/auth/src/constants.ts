// Shared constants with no imports: the server (index.ts) and the browser client both re-export them.

/** The error code a breached password gets (better-auth's haveIBeenPwned plugin). */
export const PASSWORD_COMPROMISED_CODE = "PASSWORD_COMPROMISED"

/** The message the app shows for it. */
export const PASSWORD_COMPROMISED_MESSAGE =
  "This password has shown up in a known data breach. Choose a different one."

/** The app page a sign-in sends a person to when a second factor is still needed. */
export const TWO_FACTOR_PATH = "/two-factor"

/** Refusals of the account lifecycle (account-plugin.ts). The app maps each to its copy. */
export const OWNS_ORGANIZATION_CODE = "OWNS_ORGANIZATION"
export const ACTIVE_SUBSCRIPTION_CODE = "ACTIVE_SUBSCRIPTION"
export const LAST_SIGN_IN_METHOD_CODE = "LAST_SIGN_IN_METHOD"
