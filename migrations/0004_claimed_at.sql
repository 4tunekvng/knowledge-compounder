-- Store first, process later: sync now only stores highlights as pending
-- rows, and a scheduled drain does the AI work. `claimed_at` records when a
-- worker took a row, so two drains never process the same row and a row
-- whose worker died is picked up again once its claim is old.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote
--
-- Existing rows get NULL, so every row already stuck in 'pending' is free
-- for the first drain to pick up.

ALTER TABLE sources ADD COLUMN claimed_at INTEGER;
