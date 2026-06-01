-- Auto-ingest infrastructure: extend `sources` with provider provenance and
-- add `integration_tokens` to store per-provider auth + sync cursor.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote
-- (or --local for the local D1 emulator).

ALTER TABLE sources ADD COLUMN source_type TEXT NOT NULL DEFAULT 'url';
ALTER TABLE sources ADD COLUMN external_id TEXT;
ALTER TABLE sources ADD COLUMN external_updated_at INTEGER;

-- Backfill source_type from the existing `kind` column so old rows are coherent.
UPDATE sources SET source_type = kind WHERE source_type = 'url' AND kind = 'text';

-- Unique index dedupes re-syncs of the same external item. Multiple NULL
-- external_ids are permitted (SQLite UNIQUE allows NULLs), so manual captures
-- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS sources_source_type_external_id_idx
  ON sources(source_type, external_id);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  -- Plaintext for v1 (single-user dev mode). Encrypt at rest before going multi-user.
  token TEXT NOT NULL,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
