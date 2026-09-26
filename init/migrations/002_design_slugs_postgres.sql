-- Adds the URL slug for /designs/<slug>. Idempotent.
-- Rollout: run this BEFORE the next Redbubble sync (the sync inserts `slug`), then run `npm run backfill:slugs`.
alter table public.designs add column if not exists slug character varying null;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'designs_slug_key') THEN
    ALTER TABLE public.designs ADD CONSTRAINT designs_slug_key UNIQUE (slug);
  END IF;
END $$;
