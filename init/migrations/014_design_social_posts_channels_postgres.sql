-- Social posts: adds the facebook and tumblr channels and the scheduled status (a post
-- placed in the platform's native scheduler; publishedAt then holds the planned publish
-- time), enforces the status transitions in upsert_design_social_post, and adds
-- delete_design_social_post for marks recorded by mistake. Idempotent: the previous
-- channel/status checks — the auto-named column CHECKs from migration 004 — are found
-- by their definitions, dropped, and replaced with named ones; reruns change nothing.
DO $$ DECLARE
  previous TEXT;
BEGIN
  SELECT conname INTO previous
  FROM pg_constraint con
  WHERE con.conrelid = 'public.design_social_posts'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%pinterest%'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%tumblr%';
  IF previous IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.design_social_posts DROP CONSTRAINT %I', previous);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = 'public.design_social_posts'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%tumblr%'
  ) THEN
    ALTER TABLE public.design_social_posts ADD CONSTRAINT design_social_posts_channel_check
      CHECK (channel IN ('pinterest', 'bluesky', 'mastodon', 'instagram', 'threads', 'reddit', 'tiktok', 'youtube', 'x', 'linkedin', 'facebook', 'tumblr'));
  END IF;

  previous := NULL;
  SELECT conname INTO previous
  FROM pg_constraint con
  WHERE con.conrelid = 'public.design_social_posts'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%''published''%'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%scheduled%';
  IF previous IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.design_social_posts DROP CONSTRAINT %I', previous);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = 'public.design_social_posts'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%scheduled%'
  ) THEN
    ALTER TABLE public.design_social_posts ADD CONSTRAINT design_social_posts_status_check
      CHECK (status IN ('scheduled', 'published', 'removed'));
  END IF;
END $$;

-- Invoker privileges, callable only by the service role. Records one scheduled,
-- published or removed post per (channel, externalId); never relinks a post to another
-- design. Status moves forward only: scheduled -> published | removed, published -> removed.
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
  IF entry.status IN ('published', 'removed') AND p->>'status' = 'scheduled' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post cannot be scheduled again once it is ' || entry.status,
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
      CASE WHEN p->>'status' = 'removed' THEN (p->>'removedAt')::TIMESTAMPTZ ELSE NULL END,
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
      "removedAt" = CASE WHEN p->>'status' <> 'removed' THEN NULL
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

-- Hard-deletes one mark, addressed by {"id"} or by {"channel", "externalId"}; for marks
-- recorded by mistake (a post taken down on the platform is status 'removed' instead).
-- Returns {"post": <deleted row>}, or {"post": null} when nothing matched.
CREATE OR REPLACE FUNCTION public.delete_design_social_post(identity JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  entry public.design_social_posts%ROWTYPE;
BEGIN
  DELETE FROM public.design_social_posts
  WHERE CASE WHEN identity ? 'id' THEN id = (identity->>'id')::UUID
    ELSE channel = identity->>'channel' AND "externalId" = identity->>'externalId' END
  RETURNING * INTO entry;
  RETURN jsonb_build_object('post', CASE WHEN entry.id IS NULL THEN NULL ELSE to_jsonb(entry) END);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_design_social_post(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_design_social_post(JSONB) TO service_role;
