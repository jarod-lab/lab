import { pgSchema } from "drizzle-orm/pg-core"

/**
 * hq's own tables live in the `hq` Postgres schema, beside starter's auth tables in `public`
 * (both sets sit in the hq database, HQ_DATABASE_URL). Tasks 5 and 6 add the brain entries,
 * proposals, runs and the spend ledger here.
 */
export const hq = pgSchema("hq")
