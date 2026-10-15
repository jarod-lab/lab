// Audit trail: who (a user or an API key, possibly through an OAuth client) ran which operation in
// an organization, and how it ended. Newest first, paginated on (at, id).
import type { CallerActsFor, Named, OrganizationId } from "@starter/auth-proofs"
import { type Database, auditEvent } from "@starter/db"
import type { ErrorCode } from "@starter/errors"
import { and, desc, eq, lt, or } from "drizzle-orm"

export interface AuditEventInput {
  actorType: "user" | "apiKey"
  actorId: string
  clientId?: string
  operation: string
  outcome: "ok" | ErrorCode
  requestId?: string
}

export interface AuditEventRow {
  id: string
  at: Date
  actorType: string
  actorId: string
  clientId: string | null
  operation: string
  outcome: string
  requestId: string | null
}

export interface AuditPage {
  /** The last row of the previous page: `at` as an ISO timestamp, and `id`. */
  after?: { at: string; id: string }
  limit: number
}

export async function recordAuditEvent<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  e: AuditEventInput,
): Promise<void> {
  await db.insert(auditEvent).values({
    id: crypto.randomUUID(),
    organizationId: org.value,
    at: new Date(),
    actorType: e.actorType,
    actorId: e.actorId,
    clientId: e.clientId ?? null,
    operation: e.operation,
    outcome: e.outcome,
    requestId: e.requestId ?? null,
  })
}

export function listAuditEvents<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  page: AuditPage,
): Promise<AuditEventRow[]> {
  // Keyset on (at, id), newest first: the next page is everything strictly older than the cursor.
  const after = page.after
  const older = after
    ? or(
        lt(auditEvent.at, new Date(after.at)),
        and(eq(auditEvent.at, new Date(after.at)), lt(auditEvent.id, after.id)),
      )
    : undefined
  return db
    .select({
      id: auditEvent.id,
      at: auditEvent.at,
      actorType: auditEvent.actorType,
      actorId: auditEvent.actorId,
      clientId: auditEvent.clientId,
      operation: auditEvent.operation,
      outcome: auditEvent.outcome,
      requestId: auditEvent.requestId,
    })
    .from(auditEvent)
    .where(and(eq(auditEvent.organizationId, org.value), older))
    .orderBy(desc(auditEvent.at), desc(auditEvent.id))
    .limit(page.limit)
}
