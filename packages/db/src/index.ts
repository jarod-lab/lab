import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

export * from "./schema"

/** Any Drizzle Postgres database with this schema: the app's (postgres-js) or a test's (PGlite). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set")
  return drizzle(postgres(url), { schema })
}
