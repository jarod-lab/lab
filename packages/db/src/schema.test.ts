import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import {
  auditEvent,
  createDb,
  idempotencyKey,
  organization,
  project,
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

  it("requires DATABASE_URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is not set")
  })

  it("creates a client without connecting", () => {
    expect(createDb("postgres://user:pass@localhost:5432/db")).toBeDefined()
  })
})
