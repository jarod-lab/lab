import { defineConfig } from "drizzle-kit"

// hq's own tables only: `pgSchema("hq")`. The auth tables come from starter's migrations
// (packages/db), which are applied to the hq database too.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["hq"],
  dbCredentials: { url: process.env.HQ_DATABASE_URL ?? "" },
})
