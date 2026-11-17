import { index, integer, jsonb, pgSchema, text, timestamp, unique } from "drizzle-orm/pg-core"

/**
 * hq's own tables live in the `hq` Postgres schema, beside starter's auth tables in `public`
 * (both sets sit in the hq database, HQ_DATABASE_URL). Task 5 adds the brain's entries and
 * proposals; Task 6 adds runs and the spend ledger.
 */
export const hq = pgSchema("hq")

/** The kinds of entry the brain holds. A slug is unique within its kind. */
export const ENTRY_KINDS = ["fact", "voice", "decision", "playbook", "customer"] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** Who wrote a version or made a proposal: a signed-in person, or an agent (a key, an AI client). */
export const AUTHOR_TYPES = ["person", "agent"] as const
export type AuthorType = (typeof AUTHOR_TYPES)[number]

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

// Timestamps are stamped from the app's clock (`now()`), not by column defaults, so tests can move
// time, and they carry a time zone so the stored instant never depends on the session's.
const at = (name: string) => timestamp(name, { withTimezone: true })

/** One thing the org knows. Its content is in `entry_versions`; an entry is only the identity. */
export const entries = hq.table(
  "entries",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
    slug: text("slug").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (t) => [unique("entries_kind_slug_unique").on(t.kind, t.slug)],
)

/** Every version of an entry, forever: an edit adds a row, nothing is updated or deleted. */
export const entryVersions = hq.table(
  "entry_versions",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => entries.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: jsonb("body").$type<EntryBody>().notNull(),
    /** Where the content came from, e.g. `proposal:<id>`; null for a person's own edit. */
    source: text("source"),
    authorType: text("author_type", { enum: AUTHOR_TYPES }).notNull(),
    authorId: text("author_id").notNull(),
    runId: text("run_id"),
    createdAt: at("created_at").notNull(),
  },
  (t) => [unique("entry_versions_entry_version_unique").on(t.entryId, t.version)],
)

/**
 * A change an agent or an external write asks for. Only a founder turns it into a version
 * (the trust rule). `base_version` is the version the proposer read; null when the entry is new.
 */
export const proposals = hq.table(
  "proposals",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").references(() => entries.id),
    kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
    slug: text("slug").notNull(),
    baseVersion: integer("base_version"),
    title: text("title").notNull(),
    body: jsonb("body").$type<EntryBody>().notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull(),
    proposedByType: text("proposed_by_type", { enum: AUTHOR_TYPES }).notNull(),
    proposedById: text("proposed_by_id").notNull(),
    runId: text("run_id"),
    decidedBy: text("decided_by"),
    decidedAt: at("decided_at"),
    /** The founder's note with the decision. */
    decisionNote: text("decision_note"),
    createdAt: at("created_at").notNull(),
  },
  (t) => [index("proposals_status_created_idx").on(t.status, t.createdAt)],
)

/** An entry's content: prose in `text`, plus any structured fields the kind needs. */
export interface EntryBody {
  text: string
  [field: string]: unknown
}
