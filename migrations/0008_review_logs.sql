-- One row per card review. Cards keep only their latest memory state, so
-- without this log every past review is lost. The log is what lets a card
-- move to a newer scheduler (FSRS-7 replays a card's full history; cards
-- without it must stay on FSRS-6) and what fits personal weights later.
-- See issue #6. Keyed by owner_id like every table since 0005_owners.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote -c wrangler.jsonc
--
-- Additive only: existing tables and rows are untouched. Reviews made before
-- this migration have no rows; history starts at the first review after it.

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  state_before INTEGER NOT NULL,
  stability_before REAL NOT NULL,
  difficulty_before REAL NOT NULL,
  last_reviewed_at_before INTEGER,
  state_after INTEGER NOT NULL,
  stability_after REAL NOT NULL,
  difficulty_after REAL NOT NULL,
  scheduled_days REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS review_logs_owner_card_idx
  ON review_logs(owner_id, card_id, reviewed_at);
