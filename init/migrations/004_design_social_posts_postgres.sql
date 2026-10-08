BEGIN;

CREATE TABLE IF NOT EXISTS public.design_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "designId" UUID NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('pinterest', 'bluesky', 'mastodon', 'instagram', 'threads', 'reddit', 'tiktok', 'youtube', 'x', 'linkedin')),
  account TEXT NOT NULL CHECK (char_length(account) <= 100),
  variant TEXT NOT NULL CHECK (char_length(variant) <= 50),
  "externalId" TEXT NOT NULL CHECK (char_length("externalId") <= 200),
  url TEXT NOT NULL CHECK (char_length(url) <= 2000),
  "linkUrl" TEXT,
  title TEXT CHECK (char_length(title) <= 500),
  caption TEXT CHECK (char_length(caption) <= 5000),
  hashtags JSONB,
  "imageUrl" TEXT,
  board TEXT CHECK (char_length(board) <= 200),
  status TEXT NOT NULL CHECK (status IN ('published', 'removed')),
  "publishedAt" TIMESTAMPTZ NOT NULL,
  "removedAt" TIMESTAMPTZ,
  extra JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT design_social_posts_removed_check CHECK (status <> 'removed' OR "removedAt" IS NOT NULL),
  UNIQUE (channel, "externalId"),
  UNIQUE ("designId", channel, account, variant)
);
CREATE INDEX IF NOT EXISTS design_social_posts_designid_idx ON public.design_social_posts ("designId");
CREATE INDEX IF NOT EXISTS design_social_posts_channel_publishedat_idx ON public.design_social_posts (channel, "publishedAt");
CREATE INDEX IF NOT EXISTS design_social_posts_account_publishedat_idx ON public.design_social_posts (account, "publishedAt");
CREATE INDEX IF NOT EXISTS design_social_posts_status_idx ON public.design_social_posts (status);

-- Social posts are private operational data: service role only, no public read.
ALTER TABLE public.design_social_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_social_posts FROM anon, authenticated;
GRANT ALL ON public.design_social_posts TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'design_social_posts' AND policyname = 'Service Role Social Posts All') THEN
    CREATE POLICY "Service Role Social Posts All" ON public.design_social_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Invoker privileges, callable only by the service role. Records one published or
-- removed post per (channel, externalId); never relinks a post to another design.
CREATE OR REPLACE FUNCTION public.upsert_design_social_post(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  d JSONB := payload->'design';
  p JSONB := payload->'post';
  channel_name TEXT := p->>'channel';
  post_id TEXT := p->>'externalId';
  hash_id UUID;
  source_id UUID;
  other_id UUID;
  target public.designs%ROWTYPE;
  entry public.design_social_posts%ROWTYPE;
  is_new BOOLEAN;
  constraint_name TEXT;
BEGIN
  -- Same-post calls serialize on the post identity; same-design calls on the design row.
  PERFORM pg_advisory_xact_lock(hashtextextended(channel_name || ':' || post_id, 0));
  SELECT id INTO hash_id FROM public.designs WHERE sha256 = d->>'sha256';
  SELECT id INTO source_id FROM public.designs WHERE "sourceImageId" = (d->>'sourceImageId')::BIGINT;
  IF hash_id IS NOT NULL AND source_id IS NOT NULL AND hash_id <> source_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'sha256 and sourceImageId identify different designs',
      DETAIL = jsonb_build_object('sha256DesignId', hash_id, 'sourceImageIdDesignId', source_id)::TEXT;
  END IF;
  SELECT * INTO target FROM public.designs WHERE id = coalesce(hash_id, source_id) FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Design not found';
  END IF;

  SELECT * INTO entry FROM public.design_social_posts WHERE channel = channel_name AND "externalId" = post_id;
  is_new := entry.id IS NULL;
  IF NOT is_new AND entry."designId" <> target.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post belongs to another design',
      DETAIL = jsonb_build_object('designId', target.id, 'postDesignId', entry."designId", 'postId', entry.id)::TEXT;
  END IF;
  IF entry.status = 'removed' AND p->>'status' = 'published' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A removed post cannot be published again',
      DETAIL = jsonb_build_object('postId', entry.id)::TEXT;
  END IF;
  SELECT id INTO other_id FROM public.design_social_posts WHERE "designId" = target.id AND channel = channel_name
    AND account = p->>'account' AND variant = p->>'variant' AND "externalId" <> post_id;
  IF other_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Account already has a different post for this design and variant',
      DETAIL = jsonb_build_object('designId', target.id, 'postId', other_id)::TEXT;
  END IF;

  IF is_new THEN
    INSERT INTO public.design_social_posts ("designId", channel, account, variant, "externalId", url, "linkUrl", title,
      caption, hashtags, "imageUrl", board, status, "publishedAt", "removedAt", extra)
    VALUES (target.id, channel_name, p->>'account', p->>'variant', post_id, p->>'url', p->>'linkUrl', p->>'title',
      p->>'caption', nullif(p->'hashtags', 'null'::JSONB), p->>'imageUrl', p->>'board', p->>'status',
      (p->>'publishedAt')::TIMESTAMPTZ,
      CASE WHEN p->>'status' = 'published' THEN NULL ELSE (p->>'removedAt')::TIMESTAMPTZ END,
      nullif(p->'extra', 'null'::JSONB))
    RETURNING * INTO entry;
  ELSE
    UPDATE public.design_social_posts SET
      account = p->>'account', variant = p->>'variant', url = p->>'url', status = p->>'status',
      "publishedAt" = (p->>'publishedAt')::TIMESTAMPTZ,
      "linkUrl" = CASE WHEN p ? 'linkUrl' THEN p->>'linkUrl' ELSE "linkUrl" END,
      title = CASE WHEN p ? 'title' THEN p->>'title' ELSE title END,
      caption = CASE WHEN p ? 'caption' THEN p->>'caption' ELSE caption END,
      hashtags = CASE WHEN p ? 'hashtags' THEN nullif(p->'hashtags', 'null'::JSONB) ELSE hashtags END,
      "imageUrl" = CASE WHEN p ? 'imageUrl' THEN p->>'imageUrl' ELSE "imageUrl" END,
      board = CASE WHEN p ? 'board' THEN p->>'board' ELSE board END,
      "removedAt" = CASE WHEN p->>'status' = 'published' THEN NULL
        WHEN p ? 'removedAt' THEN (p->>'removedAt')::TIMESTAMPTZ ELSE "removedAt" END,
      extra = CASE WHEN p ? 'extra' THEN nullif(p->'extra', 'null'::JSONB) ELSE extra END,
      "updatedAt" = now()
    WHERE id = entry.id
    RETURNING * INTO entry;
  END IF;

  RETURN jsonb_build_object(
    'design', jsonb_build_object('id', target.id, 'slug', target.slug, 'title', target.title,
      'sha256', target.sha256, 'sourceImageId', target."sourceImageId"),
    'post', to_jsonb(entry),
    'created', is_new);
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Social post identity conflict',
    DETAIL = jsonb_build_object('constraint', constraint_name)::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_design_social_post(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_design_social_post(JSONB) TO service_role;

-- Filters: sha256, sourceImageId, channel, account, status, since/until (on publishedAt),
-- q (case-insensitive substring of post title/caption or design title), page, limit.
CREATE OR REPLACE FUNCTION public.list_design_social_posts(filters JSONB)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH params AS (
    SELECT greatest(coalesce((filters->>'page')::INTEGER, 1), 1) AS page_number,
      least(greatest(coalesce((filters->>'limit')::INTEGER, 50), 1), 200) AS page_size,
      '%' || replace(replace(replace(filters->>'q', '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern
  ), matched AS (
    SELECT p AS post, d.id AS design_id, d.slug, d.title AS design_title
    FROM public.design_social_posts p JOIN public.designs d ON d.id = p."designId", params
    WHERE (filters->>'sha256' IS NULL OR d.sha256 = filters->>'sha256')
      AND (filters->>'sourceImageId' IS NULL OR d."sourceImageId" = (filters->>'sourceImageId')::BIGINT)
      AND (filters->>'channel' IS NULL OR p.channel = filters->>'channel')
      AND (filters->>'account' IS NULL OR p.account = filters->>'account')
      AND (filters->>'status' IS NULL OR p.status = filters->>'status')
      AND (filters->>'since' IS NULL OR p."publishedAt" >= (filters->>'since')::TIMESTAMPTZ)
      AND (filters->>'until' IS NULL OR p."publishedAt" <= (filters->>'until')::TIMESTAMPTZ)
      AND (filters->>'q' IS NULL OR p.title ILIKE params.pattern ESCAPE '\'
        OR p.caption ILIKE params.pattern ESCAPE '\' OR d.title ILIKE params.pattern ESCAPE '\')
  ), paged AS (
    SELECT * FROM matched, params
    ORDER BY (post)."publishedAt" DESC, (post).id DESC
    LIMIT (SELECT page_size FROM params) OFFSET (SELECT (page_number - 1) * page_size FROM params)
  )
  SELECT jsonb_build_object(
    'data', coalesce((SELECT jsonb_agg(jsonb_build_object('post', to_jsonb(post),
        'design', jsonb_build_object('id', design_id, 'slug', slug, 'title', design_title))
      ORDER BY (post)."publishedAt" DESC, (post).id DESC) FROM paged), '[]'::JSONB),
    'total', (SELECT count(*) FROM matched));
$$;
REVOKE ALL ON FUNCTION public.list_design_social_posts(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_design_social_posts(JSONB) TO service_role;

-- Post counts per channel/account/status, optionally limited to a publishedAt window.
CREATE OR REPLACE FUNCTION public.summarize_design_social_posts(filters JSONB)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT jsonb_build_object('data', coalesce(jsonb_agg(jsonb_build_object(
      'channel', channel, 'account', account, 'status', status, 'count', total)
    ORDER BY channel, account, status), '[]'::JSONB))
  FROM (
    SELECT channel, account, status, count(*) AS total FROM public.design_social_posts
    WHERE (filters->>'since' IS NULL OR "publishedAt" >= (filters->>'since')::TIMESTAMPTZ)
      AND (filters->>'until' IS NULL OR "publishedAt" <= (filters->>'until')::TIMESTAMPTZ)
    GROUP BY channel, account, status
  ) counts;
$$;
REVOKE ALL ON FUNCTION public.summarize_design_social_posts(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.summarize_design_social_posts(JSONB) TO service_role;
COMMIT;
