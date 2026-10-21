import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import {
  agent,
  approval,
  auditEvent,
  createDb,
  featureFlag,
  featureFlagTarget,
  idempotencyKey,
  organization,
  project,
  run,
  runStep,
  steerMessage,
  supportCannedReply,
  supportCounter,
  supportDelivery,
  supportMessage,
  supportTicket,
  supportTicketTag,
  user,
  usageDaily,
} from "./index"

describe("db", () => {
  it("exposes the user table", () => {
    expect(getTableName(user)).toBe("user")
  })

  // Every customer-data table is owned by an organization: a cascading foreign key, and an index or
  // unique key that leads with organization_id, so per-org queries and deletes stay cheap.
  it.each([
    ["project", project],
    ["audit_event", auditEvent],
    ["usage_daily", usageDaily],
    ["idempotency_key", idempotencyKey],
    ["agent", agent],
    ["run", run],
    ["run_step", runStep],
    ["approval", approval],
    ["steer_message", steerMessage],
    ["feature_flag", featureFlag],
    ["feature_flag_target", featureFlagTarget],
    // Nullable: a ticket opened by email has no organization (docs/database.md, 0014_support).
    ["support_ticket", supportTicket],
  ])("%s belongs to an organization and cascades when it is deleted", (name, table) => {
    const config = getTableConfig(table)
    expect(config.name).toBe(name)
    const fk = config.foreignKeys.find((f) => f.reference().columns[0]?.name === "organization_id")
    expect(fk?.onDelete).toBe("cascade")
    expect(fk?.reference().foreignTable).toBe(organization)

    // Index columns can be SQL expressions, which have no name; only plain columns can match.
    const isOrgColumn = (column: unknown) =>
      typeof column === "object" && column !== null && "name" in column
        ? column.name === "organization_id"
        : false
    const indexed = config.indexes.some((i) => isOrgColumn(i.config.columns[0]))
    const unique = config.uniqueConstraints.some((u) => isOrgColumn(u.columns[0]))
    expect(indexed || unique).toBe(true)
  })

  // Support's tables (@byo-oss/support, generated) are the documented exception: the thread rows
  // belong to an organization through their ticket, and go with it.
  it.each([
    ["support_message", supportMessage],
    ["support_ticket_tag", supportTicketTag],
    ["support_delivery", supportDelivery],
  ])("%s belongs to a support ticket and cascades when it is deleted", (name, table) => {
    const config = getTableConfig(table)
    expect(config.name).toBe(name)
    const fk = config.foreignKeys.find((f) => f.reference().columns[0]?.name === "ticket_id")
    expect(fk?.onDelete).toBe("cascade")
    expect(fk?.reference().foreignTable).toBe(supportTicket)
    expect(config.columns.some((c) => c.name === "organization_id")).toBe(false)
  })

  it("keeps support's staff-wide tables out of any customer organization", () => {
    // Canned replies and the ticket counter belong to the support staff (the operator organization),
    // not to a customer: they have no organization_id.
    for (const table of [supportCannedReply, supportCounter]) {
      expect(getTableConfig(table).columns.some((c) => c.name === "organization_id")).toBe(false)
    }
    const organizationId = getTableConfig(supportTicket).columns.find(
      (c) => c.name === "organization_id",
    )
    expect(organizationId?.notNull).toBe(false)
  })

  it("requires DATABASE_URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is not set")
  })

  it("creates a client without connecting", () => {
    expect(createDb("postgres://user:pass@localhost:5432/db")).toBeDefined()
  })
})
