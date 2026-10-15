// Auth tables (user, session, account, verification, organization, member, ...) are generated:
//   pnpm --filter @starter/auth generate
import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { organization } from "./auth-schema"

export * from "./auth-schema"

// Example tenant-owned table. Every app table that holds customer data has `organizationId`, and
// every query on it filters by the caller's organization (see the agent-api skill).
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("project_organizationId_idx").on(t.organizationId)],
)

// Who did what, in which organization. `at` has millisecond precision so a cursor built from it
// round-trips exactly (keyset pagination on (at, id)).
export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    at: timestamp("at", { precision: 3 }).notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    clientId: text("client_id"),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    requestId: text("request_id"),
  },
  (t) => [index("audit_event_org_at_idx").on(t.organizationId, t.at, t.id)],
)

// Calls per organization, per UTC day, per operation. Incremented with an upsert.
export const usageDaily = pgTable(
  "usage_daily",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    operation: text("operation").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [unique("usage_daily_org_day_op_key").on(t.organizationId, t.day, t.operation)],
)

// Idempotency-Key records. A key is reserved before the handler runs (`in_progress`), then stored
// with its response (`done`), so concurrent retries can't both run the operation.
export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull(),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { precision: 3 }).notNull(),
    expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
  },
  (t) => [
    unique("idempotency_key_org_key_key").on(t.organizationId, t.key),
    index("idempotency_key_expiresAt_idx").on(t.expiresAt),
  ],
)

// One row per signup attempt, successful or not. Counted per IP and per email domain to rate limit
// provisional signups. No organization: an attempt can be refused before anything is created.
export const signupAttempt = pgTable(
  "signup_attempt",
  {
    id: text("id").primaryKey(),
    ip: text("ip").notNull(),
    emailDomain: text("email_domain").notNull(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull(),
  },
  (t) => [
    index("signup_attempt_ip_createdAt_idx").on(t.ip, t.createdAt),
    index("signup_attempt_domain_createdAt_idx").on(t.emailDomain, t.createdAt),
  ],
)
