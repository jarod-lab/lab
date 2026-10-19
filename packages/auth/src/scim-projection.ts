// What a SCIM directory grants inside an organization. A user the directory provisions into the
// organization (its token's domain) becomes a member with the role every new member gets, "member".
// The directory decides membership, not the role: a role an owner later gives them is kept while they
// stay active. A deprovisioned user (active=false, or their SCIM User deleted) loses the membership
// and the access that came with it, in the same transaction as the directory's write, except an
// owner: the directory never removes one (see reconcileUser).
import type { SCIMProjection } from "@better-auth/scim"
import { type Adapter, findMember } from "./membership"

/** The member role a directory-provisioned user gets. better-auth's organization default. */
export const SCIM_MEMBER_ROLE = "member"

/** better-auth's creator role: the organization's owners. */
export const OWNER_ROLE = "owner"

/** Whether a member's role string (comma-separated, e.g. "owner,member") includes the owner role. */
export const hasOwnerRole = (role: string) =>
  role
    .split(",")
    .map((r) => r.trim())
    .includes(OWNER_ROLE)

/** The one logging call the projection makes. The app's @starter/logger instance satisfies it. */
export interface ProjectionLogger {
  warn(fields: Record<string, unknown>, msg: string): void
}

/**
 * The plugin's projection. `endAccess` runs when deprovisioning removes a membership: it ends the
 * user's OAuth grants and SCIM tokens in the organization, through the transaction's adapter (see
 * index.ts). The plugin calls `reconcileUser` for every change to a user's SCIM sources, inside the
 * directory's transaction, so the membership write commits or rolls back with the SCIM write. Idempotent.
 */
export const scimProjection = (
  endAccess: (db: Adapter, userId: string, organizationId: string) => Promise<void>,
  logger: ProjectionLogger,
): SCIMProjection => ({
  async reconcileUser(state, { database }) {
    const organizationId = state.provisioningDomainId
    // Sources are the user's SCIM Users across domains: only this domain's decide this membership.
    const active = state.sources.some(
      (source) => source.active && source.provisioningDomainId === organizationId,
    )
    const member = await findMember(database, state.userId, organizationId)
    if (active) {
      if (member) return
      await database.create({
        model: "member",
        data: {
          organizationId,
          userId: state.userId,
          role: SCIM_MEMBER_ROLE,
          createdAt: new Date(),
        },
      })
      return
    }
    if (!member) return
    // An owner is never removed by deprovisioning, so the organization cannot lose its last owner
    // to a directory change. Nothing ends: their grants and SCIM tokens stay. Admins are removed.
    if (hasOwnerRole(member.role)) {
      logger.warn(
        { event: "scim.deprovision.owner_kept", userId: state.userId, orgId: organizationId },
        "SCIM deprovisioning kept an owner's membership",
      )
      return
    }
    await database.deleteMany({ model: "member", where: [{ field: "id", value: member.id }] })
    await endAccess(database, state.userId, organizationId)
  },
})
