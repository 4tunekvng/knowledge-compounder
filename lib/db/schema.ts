import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Google account id of the person this row belongs to (from the
    // fortuneking-auth session). Every query filters on it.
    ownerId: text("owner_id").notNull(),
    kind: text("kind", { enum: ["url", "text", "pdf"] }).notNull(),
    title: text("title").notNull(),
    url: text("url"),
    rawContent: text("raw_content").notNull(),
    excerpt: text("excerpt").notNull(),
    status: text("status", { enum: ["pending", "processed", "failed"] })
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    // Auto-ingest provenance. "url" and "text" are the manual capture paths
    // (matches `kind`); any other value is the external provider name
    // (e.g. "readwise", "kindle", "zotero"). New columns are nullable / default
    // so existing rows migrate cleanly.
    sourceType: text("source_type", {
      enum: ["url", "text", "readwise", "pdf", "zotero"],
    })
      .notNull()
      .default("url"),
    // Stable id from the external provider (e.g. Readwise highlight id).
    // NULL for manual captures. Unique with sourceType to dedupe re-syncs.
    externalId: text("external_id"),
    // Provider-reported updated-at, used for incremental sync cursors.
    externalUpdatedAt: integer("external_updated_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    // When a worker last took this row to process it. A pending row with no
    // claim, or a claim too old to still be running, is free for the
    // scheduled drain (lib/services/ingest.ts#processPendingSources).
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    // Tries so far; the drain gives up at MAX_ATTEMPTS (lib/services/ingest.ts).
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => ({
    // Prevents duplicate captures when one person re-syncs the same external
    // item. Manual rows (sourceType=url/text) have externalId=NULL — SQLite
    // UNIQUE permits multiple NULL externalIds, so manual captures aren't
    // affected.
    ownerExternalIdx: uniqueIndex("sources_owner_external_idx").on(
      table.ownerId,
      table.sourceType,
      table.externalId,
    ),
  }),
);

// Per-person, per-provider auth + sync state. The token is sealed with
// AES-GCM (lib/token-box.ts) before it is stored.
export const integrationTokens = sqliteTable(
  "integration_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").notNull(),
    provider: text("provider").notNull(),
    token: text("token").notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    ownerProviderIdx: uniqueIndex("integration_tokens_owner_provider_idx").on(
      table.ownerId,
      table.provider,
    ),
  }),
);

export const processings = sqliteTable("processings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  whyICared: text("why_i_cared").notNull(),
  keyTakeaways: text("key_takeaways").notNull(), // JSON array of strings
  concepts: text("concepts").notNull(), // JSON array of {name, weight}
  embedding: blob("embedding"), // Float32Array bytes (Voyage) or null
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  cardType: text("card_type", { enum: ["definition", "mechanism", "application"] })
    .notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  // FSRS-6 memory model state.
  // SQL column names preserved for schema compatibility; JS names express FSRS semantics.
  stability: real("ease").notNull().default(0),         // S: days until R drops to 90 %
  scheduledDays: real("interval_days").notNull().default(0), // planned interval in days
  reps: integer("repetitions").notNull().default(0),    // successful review count
  difficulty: real("difficulty").notNull().default(5.0), // D: card difficulty [1, 10]
  fsrsState: integer("fsrs_state").notNull().default(0), // 0=New 1=Learning 2=Review 3=Relearning
  lapses: integer("lapses").notNull().default(0),
  dueAt: integer("due_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const themes = sqliteTable("themes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  sourceIds: text("source_ids").notNull(), // JSON array of source ids
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const essays = sqliteTable("essays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  themeId: integer("theme_id").references(() => themes.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  draftMd: text("draft_md").notNull(),
  citations: text("citations").notNull(), // JSON array of {sourceId, quote}
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Shareable study decks. A deck bundles the flashcards from a set of sources
// and publishes them to a public, no-login student page at /d/<shareToken>
// (the "send it to students" flow). shareToken is an unguessable random id so
// the link can be shared without exposing the rest of the corpus.
export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  shareToken: text("share_token").notNull().unique(),
  sourceIds: text("source_ids").notNull(), // JSON array of source ids
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Source = typeof sources.$inferSelect;
export type Processing = typeof processings.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Essay = typeof essays.$inferSelect;
export type IntegrationToken = typeof integrationTokens.$inferSelect;
export type Deck = typeof decks.$inferSelect;

// Paper picks: the shared pool of new papers every person's picks are ranked
// from (migration 0006). No personal data lives here.
export const papers = sqliteTable("papers", {
  arxivId: text("arxiv_id").primaryKey(),
  title: text("title").notNull(),
  authors: text("authors").notNull(), // JSON array of names
  abstract: text("abstract").notNull(),
  categories: text("categories").notNull(), // JSON array, e.g. ["cs.LG"]
  publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
  hfUpvotes: integer("hf_upvotes"), // null when not on Hugging Face's list
  hfSummary: text("hf_summary"), // Hugging Face's one-line summary, if any
  githubUrl: text("github_url"),
  harvestedAt: integer("harvested_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const paperHarvests = sqliteTable("paper_harvests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  papersSeen: integer("papers_seen").notNull(),
  failedSources: text("failed_sources").notNull(), // JSON array of feed names
});

export type Paper = typeof papers.$inferSelect;

// Paper picks, per person (migration 0007), keyed by owner_id like every
// other table; every query goes through lib/papers/readers.ts.
export const readerProfiles = sqliteTable("reader_profiles", {
  ownerId: text("owner_id").primaryKey(),
  interestsText: text("interests_text").notNull(),
  terms: text("terms").notNull(), // JSON ProfileTerm[] (lib/papers/rank.ts)
  compiledAt: integer("compiled_at", { mode: "timestamp_ms" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const readerEvents = sqliteTable("reader_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  arxivId: text("arxiv_id").notNull(),
  kind: text("kind", {
    enum: ["shown", "more", "less", "save", "open", "imported"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const dailyPicks = sqliteTable(
  "daily_picks",
  {
    ownerId: text("owner_id").notNull(),
    day: text("day").notNull(), // reading day, YYYY-MM-DD (starts 05:00 UTC)
    rank: integer("rank").notNull(),
    arxivId: text("arxiv_id").notNull(),
    score: real("score").notNull(),
    matched: text("matched").notNull(), // JSON: matched terms, strongest first
  },
  (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.day, t.rank] }) }),
);
