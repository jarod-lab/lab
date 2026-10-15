// Headless sign-in: the OAuth device grant (RFC 8628). A CLI or agent asks for a device code, a
// person approves it in a browser at DEVICE_VERIFICATION_PATH, and the client polls /oauth2/token.
// The result is an ordinary OAuth access token (JWT: aud, azp, org, scope), so resolvePrincipal
// accepts it unchanged. The plugin's own /device/token mints a session token and is disabled.
import { DEVICE_CODE_GRANT_TYPE, oauthDeviceAuthorization } from "@better-auth/oauth-provider"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"

import { type Adapter, findMember } from "./membership"

/** The verification page a person opens (the web app serves it at this path on the API origin). */
export const DEVICE_VERIFICATION_PATH = "/device"

/**
 * The organization a device code was approved for is kept in `verification`, keyed by the device
 * record's id. The record itself is deleted when the code is redeemed, but the token issued at
 * redemption needs the organization, so it is written at approval and read at issuance.
 */
const approvalKey = (deviceCodeId: string) => `device-org:${deviceCodeId}`

interface DeviceCodeRow {
  id: string
  status: string
  userId?: string | null
  expiresAt: Date
}

/** Same lookup as the plugin: exact user code first, then the normalised form people type. */
async function findDeviceCodeByUserCode(adapter: Adapter, userCode: string) {
  const find = (value: string) =>
    adapter.findOne<DeviceCodeRow>({
      model: "deviceCode",
      where: [{ field: "userCode", value }],
    })
  const exact = await find(userCode)
  if (exact) return exact
  const normalized = userCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  return normalized === userCode ? null : find(normalized)
}

/**
 * Runs before `/device/approve`. The approving session's active organization becomes the
 * organization the device's tokens act in, if the person is still a member of it (the same rule as
 * the authorization-code `consentReferenceId`). Running before the plugin matters: a refused
 * approval leaves the code pending, so the person can pick another organization and approve again.
 * Only a pending code the person has claimed (the verification page does that) is recorded; the
 * plugin answers everything else.
 */
export const rememberDeviceApprovalOrg = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/device/approve") return
  const userCode = (ctx.body as { userCode?: unknown } | undefined)?.userCode
  if (typeof userCode !== "string") return
  const session = await getSessionFromCtx(ctx)
  if (!session) return
  const adapter = ctx.context.adapter
  const record = await findDeviceCodeByUserCode(adapter, userCode)
  if (!record || record.status !== "pending" || record.userId !== session.user.id) return

  const orgId = session.session.activeOrganizationId
  const member =
    typeof orgId === "string" ? await findMember(adapter, session.user.id, orgId) : null
  if (!member) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_request",
      error_description: "Choose an organization you belong to before approving this device",
    })
  }

  const identifier = approvalKey(record.id)
  const now = new Date()
  const existing = await adapter.findOne<{ id: string }>({
    model: "verification",
    where: [{ field: "identifier", value: identifier }],
  })
  if (existing) {
    await adapter.updateMany({
      model: "verification",
      where: [{ field: "identifier", value: identifier }],
      update: { value: member.organizationId, updatedAt: now },
    })
    return
  }
  await adapter.create({
    model: "verification",
    data: {
      identifier,
      value: member.organizationId,
      expiresAt: record.expiresAt,
      createdAt: now,
      updatedAt: now,
    },
  })
})

async function findDeviceRecord(adapter: Adapter, deviceCode: string) {
  return adapter.findOne<DeviceCodeRow>({
    model: "deviceCode",
    where: [{ field: "deviceCode", value: deviceCode }],
  })
}

/** The organization approved for a device record, or null when none was recorded. */
async function approvedOrganizationId(adapter: Adapter, deviceCodeId: string) {
  const row = await adapter.findOne<{ value: string }>({
    model: "verification",
    where: [{ field: "identifier", value: approvalKey(deviceCodeId) }],
  })
  return row?.value ?? null
}

/**
 * The device-authorization plugin wired to the OAuth provider's token endpoint. The plugin's grant
 * issues tokens with no `referenceId`, which would drop the `org` claim (and make refresh tokens
 * org-less). The wrapper hands the grant an `issueTokens` that reads the approved organization at
 * issuance, which only runs once the plugin has redeemed an approved code (so pending, denied and
 * expired codes are answered by the plugin as usual). A code with no recorded organization gets no
 * token: `org` is never missing.
 */
export function deviceAuthorizationPlugin() {
  const plugin = oauthDeviceAuthorization({ verificationUri: DEVICE_VERIFICATION_PATH })
  // The grant object the plugin registers with the OAuth provider. Its type doesn't name the token
  // handlers (`grants`), so they are reached through a narrowed `unknown`. Wrapping the handler in
  // place keeps the plugin's own validation (client, resources, scopes, polling) intact.
  const grant = plugin.options?.grant
  if (!grant) throw new Error("device grant missing from oauthDeviceAuthorization")
  const grants: unknown = Reflect.get(grant, "grants")
  if (!isRecord(grants) || !isExchange(grants[DEVICE_CODE_GRANT_TYPE])) {
    throw new Error("device grant handler not found in @better-auth/oauth-provider")
  }
  const exchange = grants[DEVICE_CODE_GRANT_TYPE]
  grants[DEVICE_CODE_GRANT_TYPE] = async (input: ExchangeInput) => {
    const adapter = input.ctx.context.adapter
    const deviceCode = (input.ctx.body as { device_code?: unknown } | undefined)?.device_code
    // Captured now: redemption deletes the device record, and the organization outlives it.
    const record =
      typeof deviceCode === "string" ? await findDeviceRecord(adapter, deviceCode) : null
    if (!record) return exchange(input)
    const provider = input.provider
    return exchange({
      ...input,
      provider: {
        ...provider,
        issueTokens: async (params) => {
          const orgId = await approvedOrganizationId(adapter, record.id)
          if (!orgId) {
            throw new APIError("BAD_REQUEST", {
              error: "invalid_grant",
              error_description: "This device code was not approved for an organization",
            })
          }
          return provider.issueTokens({ ...params, referenceId: orgId })
        },
      },
    })
  }
  // Plugin hooks take matcher lists (the top-level `hooks` option takes one handler).
  return {
    ...plugin,
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/device/approve",
          handler: rememberDeviceApprovalOrg,
        },
      ],
    },
  }
}

/** The parts of the grant handler's input this wrapper reads or rewrites. */
interface ExchangeInput {
  ctx: { body?: unknown; context: { adapter: Adapter } }
  provider: { issueTokens: (params: Record<string, unknown>) => unknown }
}
type Exchange = (input: ExchangeInput) => unknown

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null
const isExchange = (value: unknown): value is Exchange => typeof value === "function"
