// What a deployed hq may and may not do, decided from NODE_ENV the way packages/env treats its other
// development-only switches (DEV_MAIL_SINK, AUTH_RATE_LIMIT=off): only an explicit `development` or
// `test` is a local stack; production, or NODE_ENV unset, is deployed. Failing open would let a
// forgotten variable turn the guards off.

/** Whether this is anything but a local development or test stack. */
export function isProductionLike(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "development" && nodeEnv !== "test"
}

/**
 * Public sign-up stays off in a deployed hq: every founder account is made on the server by
 * `create-founder`, so no stranger can register an address and wait for its owner to verify it.
 * Throws with the reason; hq's boot and `create-founder` both call it.
 */
export function assertSignUpClosedWhenDeployed(config: {
  nodeEnv: string | undefined
  allowSignUp: boolean
}): void {
  if (config.allowSignUp && isProductionLike(config.nodeEnv)) {
    throw new Error(
      "HQ_ALLOW_SIGNUP is on in a deployed hq (NODE_ENV is not development or test). " +
        "Public sign-up must stay off there: unset HQ_ALLOW_SIGNUP and make founders with create-founder.",
    )
  }
}
