// Auth tables (user, session, account, verification, organization, member, ...) are generated:
//   pnpm --filter @starter/auth generate
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
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
