import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["url", "text"] }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  rawContent: text("raw_content").notNull(),
  excerpt: text("excerpt").notNull(),
  status: text("status", { enum: ["pending", "processed", "failed"] })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export const processings = sqliteTable("processings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  sourceIds: text("source_ids").notNull(), // JSON array of source ids
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const essays = sqliteTable("essays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export type Source = typeof sources.$inferSelect;
export type Processing = typeof processings.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Essay = typeof essays.$inferSelect;
