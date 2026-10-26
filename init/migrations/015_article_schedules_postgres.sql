ALTER TABLE public.article_announcements
  ADD COLUMN IF NOT EXISTS "showAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS "shownAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "scheduleRevision" VARCHAR(36) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "lastError" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.article_announcements'::regclass AND conname = 'article_schedule_state_check') THEN
    ALTER TABLE public.article_announcements ADD CONSTRAINT article_schedule_state_check
      CHECK (status IN ('automatic','scheduled','published','cancelled') AND (status <> 'scheduled' OR "showAt" IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS article_schedule_due ON public.article_announcements (status, "showAt");
-- Retain the server-only access model from migration 012.
ALTER TABLE public.article_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.article_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.article_announcements TO service_role;
