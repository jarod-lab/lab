import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import * as schema from "./schema"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

/**
 * In-process Postgres (PGlite) with the real migrations applied. No Docker, no network.
 * Use one per test file; call `close()` when done.
 */
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return { db, close: () => client.close() }
}
