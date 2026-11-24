import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { getTableName, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHqTestDb } from "../testing"
import { HQ_MIGRATIONS_FOLDER } from "./migrations"
import * as schema from "./schema"

// The hq journal before the two work migrations (Phase 4 Task 2, Step 0): the entry count at the
// lab `main` this node branched from, and the sha-256 of every file those entries own, taken with
// `git show <base>:<path> | sha256sum`. If another migration merges first, regenerate both work
// migrations on the new base and update these (never edit a snapshot by hand).
const BASELINE_ENTRIES = 6
const BASELINE_FILE_HASHES: Record<string, string> = {
  "0000_entries_and_proposals.sql":
    "997aeee718a8c561f71fa53945f2ba3bb733cf351edbe926f8e9ae9e2e636739",
  "0001_entry_versions_append_only.sql":
    "2992fd5306956debe74363fe4734c6f5c9788f93866a75b97edb91848bf4eb8c",
  "0002_runs_and_spend.sql": "8e237d36b7f980d4945d9d70a1ef55d467daaa452d79607d76e98925444dee10",
  "0003_slack_approvals.sql": "7fce8e9ca2834a7762e3de74e7ff63f9affa41fe5b08b7318456d9885cb63703",
  "0004_spend_grant_requests.sql":
    "b8c1100bf8d15b0fc66bd8a464417c54cf3ebc0bc6369c948b74f648a7b84e31",
  "0005_grant_request_amount_max.sql":
    "e500279c0dc705e06fa9b028d97a5e404391ded48a868ab416fad75a5a86a6a3",
  "meta/0000_snapshot.json": "aa6157f270e45c124e0768b21aa215954664d1d7699da08b141ec8e5f6621c8a",
  "meta/0001_snapshot.json": "0896050fc32534dde08f9c2cf075460738aa64a0a2575a142a17762386fffd13",
  "meta/0002_snapshot.json": "ad41a9c86f764a7bb5d6b2ef72b091cc36190b1c37e8eeb7c8a0d1237a9883b6",
  "meta/0003_snapshot.json": "ac6e43a95727084073c26c8a980e7a5ee0ceda4e1d4e0febf593b588f185e7db",
  "meta/0004_snapshot.json": "9e8f5023f72262dd08b8447bb7bbb528110dd95aee0bc4e857dbffa5494bec0f",
  "meta/0005_snapshot.json": "0ce98dd730246aabe72d58d15f967d25f37203b6e4a30299cc3e404079461547",
}

// The journal entries before the two work migrations, exactly as at the base commit: `when` orders
// the migrations for drizzle, so an edit to one would change which run.
const BASELINE_JOURNAL = [
  {
    idx: 0,
    version: "7",
    when: 1794945126518,
    tag: "0000_entries_and_proposals",
    breakpoints: true,
  },
  {
    idx: 1,
    version: "7",
    when: 1794945127251,
    tag: "0001_entry_versions_append_only",
    breakpoints: true,
  },
  { idx: 2, version: "7", when: 1794947840031, tag: "0002_runs_and_spend", breakpoints: true },
  { idx: 3, version: "7", when: 1794961992489, tag: "0003_slack_approvals", breakpoints: true },
  {
    idx: 4,
    version: "7",
    when: 1794967936360,
    tag: "0004_spend_grant_requests",
    breakpoints: true,
  },
  {
    idx: 5,
    version: "7",
    when: 1794970894262,
    tag: "0005_grant_request_amount_max",
    breakpoints: true,
  },
]

const WORK_TABLES = [
  "work_items",
  "signals",
  "attempts",
  "pull_requests",
  "contract_items",
  "agent_questions",
  "merge_approvals",
  "verification_windows",
  "work_item_events",
] as const

interface JournalEntry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

const readJournal = (): { entries: JournalEntry[] } =>
  JSON.parse(readFileSync(join(HQ_MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"))
const sha256 = (path: string) =>
  createHash("sha256")
    .update(readFileSync(join(HQ_MIGRATIONS_FOLDER, path)))
    .digest("hex")

/**
 * The statements of a migration file, as drizzle runs them: the file is split on
 * `--> statement-breakpoint` first (a chunk is one query and may hold several statements). Only the
 * blank and comment lines at the top of a chunk (before the statement starts) are dropped: a `--`
 * line further down may sit inside a string literal or a `$$` body, where Postgres reads it as
 * text, so it stays in the statement and is reported by `onlyAddsViolations`.
 */
function statementsOf(text: string): string[] {
  return text
    .split("--> statement-breakpoint")
    .map((chunk) => {
      const lines = chunk.split("\n")
      let first = 0
      while (
        first < lines.length &&
        (lines[first]?.trim() === "" || lines[first]?.trimStart().startsWith("--"))
      ) {
        first++
      }
      return lines.slice(first).join("\n").trim()
    })
    .filter((chunk) => chunk.length > 0)
}

const NEW_TABLE = `"hq"\\."(?:${WORK_TABLES.join("|")})"`
/** The only forms the two migrations may contain; each must match a whole chunk, one statement. */
const ALLOWED_STATEMENTS: readonly RegExp[] = [
  new RegExp(`^CREATE TABLE ${NEW_TABLE} \\([^;]*\\);?$`),
  new RegExp(`^ALTER TABLE ${NEW_TABLE} ADD CONSTRAINT "\\w+" [^;]*;?$`),
  new RegExp(`^CREATE (?:UNIQUE )?INDEX "\\w+" ON ${NEW_TABLE} [^;]*;?$`),
  // A plain CREATE (never OR REPLACE) of the one new function; the body is the text between $$.
  /^CREATE FUNCTION "hq"\."work_item_events_append_only"\(\) RETURNS trigger AS \$\$(?:(?!\$\$)[\s\S])*\$\$ LANGUAGE plpgsql;?$/,
  /^CREATE TRIGGER "\w+"\s+BEFORE UPDATE OR DELETE ON "hq"\."work_item_events"\s+FOR EACH ROW EXECUTE FUNCTION "hq"\."work_item_events_append_only"\(\);?$/,
]
const BODY_FORBIDDEN = /\b(?:ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE)\b/i

/** Why a migration file is not purely additive; empty when it is. */
function onlyAddsViolations(text: string): string[] {
  const found: string[] = []
  for (const statement of statementsOf(text)) {
    if (!ALLOWED_STATEMENTS.some((form) => form.test(statement))) {
      found.push(`not an allowed statement: ${statement.slice(0, 80)}`)
    }
    if (/--|\/\*/.test(statement))
      found.push(`comment inside a statement: ${statement.slice(0, 80)}`)
    if (/\bINHERITS\b/i.test(statement)) found.push(`INHERITS: ${statement.slice(0, 80)}`)
    const body = /\$\$((?:(?!\$\$)[\s\S])*)\$\$/.exec(statement)?.[1]
    if (body && BODY_FORBIDDEN.test(body)) found.push(`function body writes: ${body.slice(0, 80)}`)
  }
  // The second net: these never appear, in any form, outside a comment.
  const code = statementsOf(text).join("\n")
  for (const word of [/\bDROP\b/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i]) {
    if (word.test(code)) found.push(`contains ${word}`)
  }
  return found
}

describe("the work pipeline migrations (files)", () => {
  const { entries } = readJournal()

  it("the journal ends with <A>_work_pipeline then <B>_work_events_append_only and holds BASELINE_ENTRIES + 2 entries", () => {
    expect(entries).toHaveLength(BASELINE_ENTRIES + 2)
    const [a, b] = entries.slice(-2)
    expect(a?.tag).toMatch(/^\d{4}_work_pipeline$/)
    expect(b?.tag).toMatch(/^\d{4}_work_events_append_only$/)
    // Numbered by position: the next two free numbers after the baseline, in order.
    expect(a?.tag.slice(0, 4)).toBe(String(BASELINE_ENTRIES).padStart(4, "0"))
    expect(b?.tag.slice(0, 4)).toBe(String(BASELINE_ENTRIES + 1).padStart(4, "0"))
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i))
    // Strictly later than the entry before, or drizzle skips the migration.
    entries.slice(1).forEach((e, i) => expect(e.when, e.tag).toBeGreaterThan(entries[i]?.when ?? 0))
    for (const e of entries.slice(-2)) {
      expect(readdirSync(HQ_MIGRATIONS_FOLDER)).toContain(`${e.tag}.sql`)
      expect(readdirSync(join(HQ_MIGRATIONS_FOLDER, "meta"))).toContain(
        `${e.tag.slice(0, 4)}_snapshot.json`,
      )
    }
  })

  it("every migration before them is byte-unchanged", () => {
    for (const [path, hash] of Object.entries(BASELINE_FILE_HASHES)) {
      expect(sha256(path), path).toBe(hash)
    }
    // And the first BASELINE_ENTRIES journal entries are the ones that were there, field by field.
    expect(entries.slice(0, BASELINE_ENTRIES)).toEqual(BASELINE_JOURNAL)
  })

  it("the two migrations only add: their SQL files contain no DROP, no ALTER of an existing table and no DELETE", () => {
    const [a, b] = entries.slice(-2)
    const [pipeline, appendOnly] = [a, b].map((e) =>
      readFileSync(join(HQ_MIGRATIONS_FOLDER, `${e?.tag}.sql`), "utf8"),
    )
    expect(onlyAddsViolations(pipeline ?? "")).toEqual([])
    expect(onlyAddsViolations(appendOnly ?? "")).toEqual([])
    // The first creates the nine tables and no other; the second only the function and its trigger.
    const created = statementsOf(pipeline ?? "").flatMap((c) =>
      [...c.matchAll(/^CREATE TABLE "hq"\."(\w+)"/g)].map((m) => m[1]),
    )
    expect(created).toHaveLength(WORK_TABLES.length)
    expect(new Set(created)).toEqual(new Set(WORK_TABLES))
    expect(statementsOf(appendOnly ?? "").map((c) => c.split(/\s/)[1])).toEqual([
      "FUNCTION",
      "TRIGGER",
    ])
  })

  it("the only-add check refuses what would alter an existing table, however it is written", () => {
    const real = readFileSync(
      join(HQ_MIGRATIONS_FOLDER, `${entries.at(-1)?.tag}.sql`),
      "utf8",
    ).trimEnd()
    expect(onlyAddsViolations(real)).toEqual([])
    const sneak = (statement: string) => [
      // Sharing the CREATE TRIGGER chunk (no breakpoint), then in a chunk of its own.
      `${real}\n${statement}\n`,
      `${real}\n--> statement-breakpoint\n${statement}\n`,
    ]
    for (const statement of [
      "ALTER TABLE hq.entries ADD COLUMN x text;",
      'ALTER TABLE "hq"."entries" ADD COLUMN "x" text;',
      'ALTER TABLE ONLY "hq"."entries" ADD COLUMN "x" text;',
      'ALTER TABLE "public"."user" ADD COLUMN "x" text;',
      'ALTER TABLE "hq"."work_items" ADD COLUMN "x" text;',
      'ALTER INDEX "hq"."signals_item_idx" RENAME TO "x";',
      "UPDATE hq.spend SET model = 'x';",
      'DELETE FROM "hq"."entries";',
      'DROP TABLE "hq"."entries";',
      'TRUNCATE "hq"."entries";',
    ]) {
      for (const text of sneak(statement)) {
        expect(onlyAddsViolations(text), `${statement} in\n${text}`).not.toEqual([])
      }
    }
    // Replacing the 0001 function body silently re-points its trigger.
    const replaced = `CREATE OR REPLACE FUNCTION "hq"."entry_versions_append_only"() RETURNS trigger AS $$
BEGIN
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;`
    for (const text of sneak(replaced)) expect(onlyAddsViolations(text)).not.toEqual([])
    // A `--` line inside a string literal or a dollar-quoted body is text to Postgres, not a
    // comment: (a) ends the literal and runs an ALTER; (b) ends the function body early at the
    // `$$` in its "comment" and runs an ALTER, then reopens a DO block to swallow the rest.
    const literalHidesAlter = `CREATE INDEX "x" ON "hq"."signals" USING btree ("item_id") WHERE "hq"."signals"."source" <> '
-- '; ALTER TABLE hq.entries ADD COLUMN x text; SELECT '
';`
    const bodyHidesAlter = `-- The history rule, at the database.
CREATE FUNCTION "hq"."work_item_events_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'hq.work_item_events is append-only: an event is never updated or deleted'
		USING ERRCODE = 'restrict_violation';
END;
-- $$ LANGUAGE plpgsql; ALTER TABLE hq.entries ADD COLUMN x text; DO $$ BEGIN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
${real.slice(real.indexOf("CREATE TRIGGER"))}`
    for (const text of sneak(literalHidesAlter)) expect(onlyAddsViolations(text)).not.toEqual([])
    expect(onlyAddsViolations(bodyHidesAlter)).not.toEqual([])
    // A table that inherits from an existing one changes what every read of that table returns.
    for (const text of sneak(
      'CREATE TABLE "hq"."signals" ("id" text) INHERITS ("hq"."entries");',
    )) {
      expect(onlyAddsViolations(text)).not.toEqual([])
    }
    expect(
      onlyAddsViolations('CREATE TABLE "hq"."work_items" ("id" text) INHERITS ("hq"."entries");'),
    ).not.toEqual([])
    // A statement hidden after a semicolon inside an allowed chunk, or in the function body.
    expect(
      onlyAddsViolations(
        `${real}\nCREATE INDEX "x" ON "hq"."signals" ("id"); UPDATE hq.spend SET model = 'x';`,
      ),
    ).not.toEqual([])
    expect(
      onlyAddsViolations(
        real.replace("RAISE EXCEPTION", "UPDATE hq.spend SET model = 'x'; RAISE EXCEPTION"),
      ),
    ).not.toEqual([])
  })

  it("the identity clause is in the SQL: number is GENERATED ALWAYS AS IDENTITY", () => {
    const first = readFileSync(join(HQ_MIGRATIONS_FOLDER, `${entries.at(-2)?.tag}.sql`), "utf8")
    expect(first).toMatch(/"number" integer GENERATED ALWAYS AS IDENTITY/)
  })
})

describe("the work pipeline tables (in-process Postgres)", () => {
  let test: Awaited<ReturnType<typeof createHqTestDb>>
  beforeAll(async () => {
    test = await createHqTestDb()
  })
  afterAll(() => test.close())

  const at = "2030-01-01T00:00:00Z"
  const run = (q: ReturnType<typeof sql>) => test.db.execute(q)
  /** What the database said when it refused: the driver error's message and SQLSTATE. */
  async function refusal(q: ReturnType<typeof sql>): Promise<{ message: string; code: string }> {
    const error = await run(q).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error, "the statement was refused").not.toBeNull()
    const cause = ((error as { cause?: unknown }).cause ?? error) as {
      message?: string
      code?: string
    }
    return { message: String(cause.message), code: String(cause.code) }
  }
  const item = (id: string, extra = sql``) =>
    run(sql`
      INSERT INTO hq.work_items (id, title, repo, source, state, created_by_type, created_by_id,
        created_at, updated_at, state_changed_at)
      VALUES (${id}, 't', 'o/r', 'manual', 'signal', 'system', 'system', ${at}, ${at}, ${at})
      ${extra}`)
  const attempt = (id: string, itemId: string, n: number, status: string, ref: string | null) =>
    run(sql`
      INSERT INTO hq.attempts (id, item_id, number, cycle, kind, status, external_ref, created_at)
      VALUES (${id}, ${itemId}, ${n}, 1, 'fix', ${status}, ${ref}, ${at})`)
  const pullRequest = (id: string, itemId: string, n: number) =>
    run(sql`
      INSERT INTO hq.pull_requests (id, item_id, number, url, branch, base, head_sha, is_draft,
        state, opened_at, updated_at)
      VALUES (${id}, ${itemId}, ${n}, 'https://github.com/o/r/pull/1', 'b', 'main', 'abc', false,
        'open', ${at}, ${at})`)
  const approval = (id: string, itemId: string, prId: string, status: string) =>
    run(sql`
      INSERT INTO hq.merge_approvals (id, item_id, pull_request_id, head_sha, status, requested_at)
      VALUES (${id}, ${itemId}, ${prId}, 'abc', ${status}, ${at})`)

  it("the nine work tables exist in schema hq", async () => {
    const rows = await run(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'hq'`,
    )
    const names = rows.rows.map((r) => (r as { table_name: string }).table_name)
    for (const table of WORK_TABLES) expect(names, table).toContain(table)
  })

  it("schema.ts exports the nine tables and the event kinds", () => {
    expect(
      [
        schema.workItems,
        schema.signals,
        schema.attempts,
        schema.pullRequests,
        schema.contractItems,
        schema.agentQuestions,
        schema.mergeApprovals,
        schema.verificationWindows,
        schema.workItemEvents,
      ].map((t) => getTableName(t)),
    ).toEqual([...WORK_TABLES])
    expect(schema.WORK_EVENT_KINDS).toEqual([
      "transition",
      "signal_attached",
      "attempt_requested",
      "attempt_started",
      "attempt_finished",
      "attempt_abandoned",
      "pull_request",
      "merge_approval_requested",
      "merge_approved",
      "merge_approval_void",
      "question_asked",
      "question_answered",
      "retry_granted",
      "revert_requested",
      "contract_set",
      "window_started",
      "window_closed",
    ])
  })

  it("number is generated: two inserts get 1 and 2, and an insert that sets number is refused", async () => {
    await item("num-a")
    await item("num-b")
    const rows = await run(
      sql`SELECT id, number FROM hq.work_items WHERE id LIKE 'num-%' ORDER BY number`,
    )
    expect(rows.rows).toEqual([
      { id: "num-a", number: 1 },
      { id: "num-b", number: 2 },
    ])
    const refused = await refusal(sql`
      INSERT INTO hq.work_items (id, number, title, repo, source, state, created_by_type,
        created_by_id, created_at, updated_at, state_changed_at)
      VALUES ('num-c', 99, 't', 'o/r', 'manual', 'signal', 'system', 'system', ${at}, ${at}, ${at})`)
    expect(refused.code).toBe("428C9") // generated_always
    expect(refused.message).toMatch(/non-DEFAULT value into column "number"/)
    // The refused insert took no number: the next one is 3.
    await item("num-d")
    expect((await run(sql`SELECT number FROM hq.work_items WHERE id = 'num-d'`)).rows[0]).toEqual({
      number: 3,
    })
  })

  it("an item's defaults: cycle 1, and the typed drizzle insert needs no number", async () => {
    await item("defaults")
    const row = (
      await run(
        sql`SELECT cycle, dedupe_key, attempt_limit FROM hq.work_items WHERE id = 'defaults'`,
      )
    ).rows[0]
    expect(row).toEqual({ cycle: 1, dedupe_key: null, attempt_limit: null })
    const now = new Date(at)
    const [typed] = await test.db
      .insert(schema.workItems)
      .values({
        id: "typed",
        title: "t",
        repo: "o/r",
        source: "ci_failure",
        state: "triage",
        createdByType: "agent",
        createdById: "key",
        createdAt: now,
        updatedAt: now,
        stateChangedAt: now,
      })
      .returning()
    expect(typed?.number).toBeGreaterThan(0)
  })

  it("signals are unique on (source, external_id)", async () => {
    await item("sig-item")
    const insert = (id: string, source: string, externalId: string) =>
      run(sql`
        INSERT INTO hq.signals (id, source, external_id, dedupe_key, repo, title, summary,
          occurred_at, received_at, item_id, recorded_by_type, recorded_by_id)
        VALUES (${id}, ${source}, ${externalId}, 'k', 'o/r', 't', 's', ${at}, ${at}, 'sig-item',
          'agent', 'key')`)
    await insert("s1", "github_issue", "1")
    await insert("s2", "ci_failure", "1")
    await insert("s3", "github_issue", "2")
    const refused = await refusal(sql`
      INSERT INTO hq.signals (id, source, external_id, dedupe_key, repo, title, summary,
        occurred_at, received_at, item_id, recorded_by_type, recorded_by_id)
      VALUES ('s4', 'github_issue', '1', 'k', 'o/r', 't', 's', ${at}, ${at}, 'sig-item', 'agent',
        'key')`)
    expect(refused.code).toBe("23505")
    expect(refused.message).toMatch(/signals_source_external_id/)
  })

  it("an item may hold one requested or running attempt and any number of finished ones", async () => {
    await item("att-item")
    await attempt("a1", "att-item", 1, "finished", null)
    await attempt("a2", "att-item", 2, "finished", null)
    await attempt("a3", "att-item", 3, "running", null)
    const second = await refusal(sql`
      INSERT INTO hq.attempts (id, item_id, number, cycle, kind, status, created_at)
      VALUES ('a4', 'att-item', 4, 1, 'fix', 'requested', ${at})`)
    expect(second.code).toBe("23505")
    // Another item is not bound by this one's active attempt.
    await item("att-other")
    await attempt("a5", "att-other", 1, "requested", null)
    // The active one finishing frees the slot.
    await run(sql`UPDATE hq.attempts SET status = 'finished' WHERE id = 'a3'`)
    await attempt("a4", "att-item", 4, "requested", null)
    // Numbers are unique per item.
    const dup = await refusal(sql`
      INSERT INTO hq.attempts (id, item_id, number, cycle, kind, status, created_at)
      VALUES ('a6', 'att-item', 4, 1, 'fix', 'finished', ${at})`)
    expect(dup.code).toBe("23505")
  })

  it("an attempt's external_ref is unique per item when set", async () => {
    await item("ref-a")
    await item("ref-b")
    await attempt("r1", "ref-a", 1, "finished", "s:c:analyst")
    // The same ref on another item is fine; no ref at all repeats freely.
    await attempt("r2", "ref-b", 1, "finished", "s:c:analyst")
    await attempt("r3", "ref-a", 2, "finished", null)
    await attempt("r4", "ref-a", 3, "finished", null)
    const dup = await refusal(sql`
      INSERT INTO hq.attempts (id, item_id, number, cycle, kind, status, external_ref, created_at)
      VALUES ('r5', 'ref-a', 4, 1, 'fix', 'finished', 's:c:analyst', ${at})`)
    expect(dup.code).toBe("23505")
  })

  it("attempts has a not null cycle column", async () => {
    await item("cycle-item")
    const refused = await refusal(sql`
      INSERT INTO hq.attempts (id, item_id, number, kind, status, created_at)
      VALUES ('cy1', 'cycle-item', 1, 'fix', 'finished', ${at})`)
    expect(refused.code).toBe("23502")
    expect(refused.message).toMatch(/cycle/)
    await attempt("cy2", "cycle-item", 1, "finished", null)
    const row = (await run(sql`SELECT files, cycle FROM hq.attempts WHERE id = 'cy2'`)).rows[0]
    expect(row).toEqual({ files: [], cycle: 1 })
  })

  it("a pull request is unique per (item, number); a second pending merge approval for one pull request is refused, a void one is not", async () => {
    await item("pr-item")
    await pullRequest("p1", "pr-item", 7)
    await pullRequest("p2", "pr-item", 8)
    const dupPr = await refusal(sql`
      INSERT INTO hq.pull_requests (id, item_id, number, url, branch, base, head_sha, is_draft,
        state, opened_at, updated_at)
      VALUES ('p3', 'pr-item', 7, 'u', 'b', 'main', 'abc', false, 'open', ${at}, ${at})`)
    expect(dupPr.code).toBe("23505")

    await approval("m1", "pr-item", "p1", "pending")
    const second = await refusal(sql`
      INSERT INTO hq.merge_approvals (id, item_id, pull_request_id, head_sha, status, requested_at)
      VALUES ('m2', 'pr-item', 'p1', 'def', 'pending', ${at})`)
    expect(second.code).toBe("23505")
    // Once the pending one is void (a push or a close), a new one may be asked, and voids pile up.
    await run(sql`UPDATE hq.merge_approvals SET status = 'void' WHERE id = 'm1'`)
    await approval("m2", "pr-item", "p1", "pending")
    await approval("m3", "pr-item", "p1", "void")
    await approval("m4", "pr-item", "p1", "approved")
    // Another pull request has its own pending slot.
    await approval("m5", "pr-item", "p2", "pending")
  })

  it("a contract item is unique per (item, cycle, position), a window per (item, cycle)", async () => {
    await item("c-item")
    const contract = (id: string, cycle: number, position: number) =>
      run(sql`
        INSERT INTO hq.contract_items (id, item_id, cycle, position, text, verifier_kind, status,
          created_by_type, created_by_id)
        VALUES (${id}, 'c-item', ${cycle}, ${position}, 't', 'ci', 'pending', 'agent', 'key')`)
    await contract("ci1", 1, 0)
    await contract("ci2", 1, 1)
    await contract("ci3", 2, 0)
    expect(
      (
        await refusal(sql`
      INSERT INTO hq.contract_items (id, item_id, cycle, position, text, verifier_kind, status,
        created_by_type, created_by_id)
      VALUES ('ci4', 'c-item', 1, 0, 't', 'ci', 'pending', 'agent', 'key')`)
      ).code,
    ).toBe("23505")
    const window = (id: string, cycle: number) =>
      run(sql`
        INSERT INTO hq.verification_windows (id, item_id, cycle, starts_at, ends_at, status)
        VALUES (${id}, 'c-item', ${cycle}, ${at}, ${at}, 'running')`)
    await window("w1", 1)
    await window("w2", 2)
    expect(
      (
        await refusal(sql`
      INSERT INTO hq.verification_windows (id, item_id, cycle, starts_at, ends_at, status)
      VALUES ('w3', 'c-item', 1, ${at}, ${at}, 'running')`)
      ).code,
    ).toBe("23505")
  })

  it("agent questions keep their options and default as given", async () => {
    await item("q-item")
    await run(sql`
      INSERT INTO hq.agent_questions (id, item_id, prompt, options, status, created_at)
      VALUES ('q1', 'q-item', 'which?', ${JSON.stringify([
        { id: "a", label: "A" },
        { id: "b", label: "B", detail: "d" },
      ])}::jsonb, 'open', ${at})`)
    const row = (
      await run(
        sql`SELECT options, default_option_id, answered_by FROM hq.agent_questions WHERE id = 'q1'`,
      )
    ).rows[0]
    expect(row).toEqual({
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B", detail: "d" },
      ],
      default_option_id: null,
      answered_by: null,
    })
  })

  it("an event, an attempt or a signal needs a real item (foreign keys)", async () => {
    const refused = await refusal(sql`
      INSERT INTO hq.work_item_events (id, item_id, at, kind, actor_type, actor_id, cycle)
      VALUES ('e0', 'no-such-item', ${at}, 'transition', 'system', 'system', 1)`)
    expect(refused.code).toBe("23503")
  })

  it("work_item_events refuses UPDATE and DELETE and allows INSERT", async () => {
    await item("ev-item")
    await run(sql`
      INSERT INTO hq.work_item_events (id, item_id, at, kind, from_state, to_state, actor_type,
        actor_id, reason, detail, cycle)
      VALUES ('e1', 'ev-item', ${at}, 'transition', 'signal', 'triage', 'system', 'system',
        'ingested', '{"k":1}'::jsonb, 1)`)
    await run(sql`
      INSERT INTO hq.work_item_events (id, item_id, at, kind, actor_type, actor_id, cycle)
      VALUES ('e2', 'ev-item', ${at}, 'signal_attached', 'agent', 'key', 1)`)
    const update = await refusal(sql`UPDATE hq.work_item_events SET note = 'x' WHERE id = 'e1'`)
    expect(update.code).toBe("23001") // restrict_violation
    expect(update.message).toMatch(/append-only/)
    const del = await refusal(sql`DELETE FROM hq.work_item_events WHERE id = 'e1'`)
    expect(del.code).toBe("23001")
    expect(del.message).toMatch(/append-only/)
    // Both refused: the rows are as they were.
    const rows = await run(
      sql`SELECT id, note, reason FROM hq.work_item_events WHERE item_id = 'ev-item' ORDER BY id`,
    )
    expect(rows.rows).toEqual([
      { id: "e1", note: null, reason: "ingested" },
      { id: "e2", note: null, reason: null },
    ])
    // The log is read by (item, at): the index exists.
    const idx = await run(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'hq' AND tablename = 'work_item_events'`,
    )
    expect(idx.rows.map((r) => (r as { indexname: string }).indexname)).toContain(
      "work_item_events_item_at_idx",
    )
  })
})
