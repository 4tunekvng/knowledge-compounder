-- Sign-in with Google: every row now belongs to one person, keyed by their
-- Google account id (the `user.id` fortuneking-auth's /session returns), and
-- every query filters on it.
--
-- Everything stored before sign-in was Fortune's (one shared dataset behind
-- a site password), so existing rows move to his id.
--
-- The column default is '' rather than an id: an insert that forgot its
-- owner then files the row under nobody, where no one can see it, instead of
-- under Fortune. The app always sets owner_id (lib/db/schema.ts declares it
-- with no default, so a missing owner is a type error).
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote -c wrangler.jsonc

ALTER TABLE sources ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE processings ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE themes ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE essays ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE decks ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';

UPDATE sources SET owner_id = '111796540707500759177';
UPDATE processings SET owner_id = '111796540707500759177';
UPDATE cards SET owner_id = '111796540707500759177';
UPDATE themes SET owner_id = '111796540707500759177';
UPDATE essays SET owner_id = '111796540707500759177';
UPDATE decks SET owner_id = '111796540707500759177';

-- A re-sync dedupes within one person's rows, not across people.
DROP INDEX IF EXISTS sources_source_type_external_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS sources_owner_external_idx
  ON sources(owner_id, source_type, external_id);

-- Each list a page shows is one person's rows in one order.
CREATE INDEX IF NOT EXISTS sources_owner_created_idx
  ON sources(owner_id, created_at);
CREATE INDEX IF NOT EXISTS processings_owner_idx ON processings(owner_id);
CREATE INDEX IF NOT EXISTS cards_owner_due_idx ON cards(owner_id, due_at);
CREATE INDEX IF NOT EXISTS themes_owner_idx ON themes(owner_id, created_at);
CREATE INDEX IF NOT EXISTS essays_owner_idx ON essays(owner_id, created_at);
CREATE INDEX IF NOT EXISTS decks_owner_idx ON decks(owner_id, created_at);

-- integration_tokens was one row per provider (`provider UNIQUE`), which
-- SQLite cannot drop in place, so the table is rebuilt as one row per
-- person and provider. Tokens are now sealed with AES-GCM before they are
-- stored (lib/token-box.ts); a row copied here in plain text fails to open,
-- and the next sync asks for the token again. Production had no rows here
-- when this ran.
CREATE TABLE integration_tokens_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  token TEXT NOT NULL,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
INSERT INTO integration_tokens_new
  (id, owner_id, provider, token, last_synced_at, created_at, updated_at)
  SELECT id, '111796540707500759177', provider, token, last_synced_at,
    created_at, updated_at
  FROM integration_tokens;
DROP TABLE integration_tokens;
ALTER TABLE integration_tokens_new RENAME TO integration_tokens;
CREATE UNIQUE INDEX IF NOT EXISTS integration_tokens_owner_provider_idx
  ON integration_tokens(owner_id, provider);
