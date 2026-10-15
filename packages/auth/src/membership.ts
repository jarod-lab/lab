import type { DBAdapter } from "better-auth"

export interface Member {
  id: string
  organizationId: string
  userId: string
  role: string
}

export type Adapter = Pick<DBAdapter, "findOne" | "findMany" | "create" | "count" | "updateMany">

/** The member row tying a user to an organization, or null when they don't belong to it. */
export function findMember(db: Adapter, userId: string, organizationId: string) {
  return db.findOne<Member>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  })
}

/** The user's oldest membership, used as the default active organization. */
export async function firstMembership(db: Adapter, userId: string): Promise<Member | null> {
  const [member] = await db.findMany<Member>({
    model: "member",
    where: [{ field: "userId", value: userId }],
    sortBy: { field: "createdAt", direction: "asc" },
    limit: 1,
  })
  return member ?? null
}

/**
 * Create the user's personal organization, with them as owner, and make it the active org of their
 * sessions. better-auth runs user after-hooks once the signup transaction commits, so the signup
 * session already exists without an active organization.
 */
export async function personalOrganization(db: Adapter, user: { id: string; name?: string }) {
  const now = new Date()
  const org = await db.create<{ name: string; slug: string; createdAt: Date }, { id: string }>({
    model: "organization",
    data: {
      name: user.name ? `${user.name}'s workspace` : "Personal workspace",
      slug: `personal-${user.id.toLowerCase()}`,
      createdAt: now,
    },
  })
  await db.create({
    model: "member",
    data: { organizationId: org.id, userId: user.id, role: "owner", createdAt: now },
  })
  await db.updateMany({
    model: "session",
    where: [{ field: "userId", value: user.id }],
    update: { activeOrganizationId: org.id },
  })
}
