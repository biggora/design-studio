CREATE TABLE IF NOT EXISTS public.article_announcements (
  "sourceArticleId" VARCHAR(100) NOT NULL,
  blog VARCHAR(253) NOT NULL,
  "tumblrPostId" VARCHAR(30) NOT NULL,
  "tumblrUrl" TEXT NOT NULL,
  title VARCHAR(300) NOT NULL,
  excerpt TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "imageSha256" CHAR(64) NOT NULL,
  "imageAlt" TEXT NOT NULL,
  revision CHAR(64) NOT NULL,
  "checkedAt" TIMESTAMPTZ,
  publication JSONB,
  PRIMARY KEY (blog, "sourceArticleId")
);
ALTER TABLE public.article_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.article_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.article_announcements TO service_role;
