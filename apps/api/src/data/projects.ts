// Tenant data access. Every function takes the organization as a Named id plus a proof that the
// caller acts for it, so a query can't be written against another organization's rows.
import type {
  CallerActsFor,
  Named,
  OrganizationId,
  ProjectId,
  ProjectInOrg,
} from "@starter/auth-proofs"
import { type Database, project } from "@starter/db"
import { and, asc, eq } from "drizzle-orm"

export type Project = typeof project.$inferSelect

export function listProjects<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
): Promise<Project[]> {
  return db
    .select()
    .from(project)
    .where(eq(project.organizationId, org.value))
    .orderBy(asc(project.createdAt), asc(project.id))
}

export async function createProject<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  input: { name: string },
  _proof: CallerActsFor<O>,
): Promise<Project> {
  const [row] = await db
    .insert(project)
    .values({ id: crypto.randomUUID(), organizationId: org.value, name: input.name })
    .returning()
  if (!row) throw new Error("insert returned no row")
  return row
}

export async function deleteProject<P, O>(
  db: Database,
  id: Named<P, ProjectId>,
  org: Named<O, OrganizationId>,
  _proofs: { inOrg: ProjectInOrg<P, O>; actor: CallerActsFor<O> },
): Promise<void> {
  // The org filter repeats the proof's check, so a stale proof can't delete across tenants.
  await db
    .delete(project)
    .where(and(eq(project.id, id.value), eq(project.organizationId, org.value)))
}
