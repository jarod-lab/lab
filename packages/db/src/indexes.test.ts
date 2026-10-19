import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb } from "./testing"
import { oauthConsent, oauthRefreshToken } from "./schema"

// The three lookups of grantStands (packages/auth/src/principal.ts), built the way the better-auth
// drizzle adapter builds them: `eq null` becomes IS NULL, and findOne reads one row.
const ids = { clientId: "client-7", referenceId: "org-7", userId: "user-7" }
const now = new Date("2026-10-18T12:00:00Z")
const issuedAt = new Date("2026-10-18T11:00:00Z")

describe("grant check indexes", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"]
  let close: () => Promise<void>

  beforeAll(async () => {
    const test = await createTestDb()
    db = test.db
    close = async () => test.close()
    // Seed without the foreign keys to oauth_client and user: this only checks the planner.
    await db.execute(sql`set session_replication_role = replica`)
    await db.execute(sql`
      insert into oauth_consent (id, client_id, user_id, reference_id, scopes, created_at, updated_at)
      select 'c' || g, 'client-' || (g % 100), 'user-' || (g % 2000), 'org-' || (g % 500),
        '{}', now(), now()
      from generate_series(1, 30000) g
    `)
    await db.execute(sql`
      insert into oauth_refresh_token
        (id, token, client_id, user_id, reference_id, scopes, expires_at, created_at, revoked, rotated_at)
      select 'r' || g, 't' || g, 'client-' || (g % 100), 'user-' || (g % 2000), 'org-' || (g % 500),
        '{}', now() + interval '30 days', now(),
        case when g % 4 = 0 then now() - interval '1 day' end,
        case when g % 3 = 0 then now() - interval '2 days' end
      from generate_series(1, 60000) g
    `)
    await db.execute(sql`set session_replication_role = origin`)
    await db.execute(sql`analyze oauth_consent`)
    await db.execute(sql`analyze oauth_refresh_token`)
  })

  afterAll(async () => {
    await close()
  })

  async function explain(query: { getSQL(): unknown }) {
    const result = await db.execute(sql`explain ${query}`)
    return (result.rows as Record<string, string>[]).map((row) => Object.values(row)[0]).join("\n")
  }

  it("consent lookup by client, organization and user uses oauthConsent_grant_idx", async () => {
    const query = db
      .select()
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.clientId, ids.clientId),
          eq(oauthConsent.referenceId, ids.referenceId),
          eq(oauthConsent.userId, ids.userId),
        ),
      )
      .limit(1)
    expect(await explain(query)).toMatch(/oauthConsent_grant_idx/)
  })

  it("live refresh token lookup uses oauthRefreshToken_grant_idx", async () => {
    const query = db
      .select()
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.clientId, ids.clientId),
          eq(oauthRefreshToken.referenceId, ids.referenceId),
          eq(oauthRefreshToken.userId, ids.userId),
          isNull(oauthRefreshToken.revoked),
          gt(oauthRefreshToken.expiresAt, now),
        ),
      )
      .limit(1)
    expect(await explain(query)).toMatch(/oauthRefreshToken_grant_idx/)
  })

  it("revocation lookup uses oauthRefreshToken_grant_idx", async () => {
    const query = db
      .select()
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.clientId, ids.clientId),
          eq(oauthRefreshToken.referenceId, ids.referenceId),
          eq(oauthRefreshToken.userId, ids.userId),
          gt(oauthRefreshToken.revoked, issuedAt),
          isNull(oauthRefreshToken.rotatedAt),
        ),
      )
      .limit(1)
    expect(await explain(query)).toMatch(/oauthRefreshToken_grant_idx/)
  })
})
