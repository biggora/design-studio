create or replace function get_random_design()
returns setof designs
language sql
as $$
select * from designs
order by random()
    limit 1;
$$;

create or replace function get_random_designs()
returns setof designs
language sql
as $$
select * from designs
order by random()
    limit 3;
$$;-- Invoker privileges, callable only by the service role. Raising an error rolls back
-- every change, including a newly created or adopted design.
CREATE OR REPLACE FUNCTION public.ingest_design_listing(payload JSONB, slug_base TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  d JSONB := payload->'design';
  l JSONB := payload->'listing';
  hash_id UUID;
  source_id UUID;
  target public.designs%ROWTYPE;
  entry public.design_listings%ROWTYPE;
  bridge_ids UUID[];
  platform_name TEXT := l->>'platform';
  work_id TEXT := l->>'externalId';
  is_new_design BOOLEAN := false;
  is_new_listing BOOLEAN;
  chosen_slug TEXT := slug_base;
  suffix INTEGER := 2;
  props_value JSONB;
  constraint_name TEXT;
BEGIN
  -- A short ingest serializes with catalog writes (including scraper inserts),
  -- covering missing-row identity checks and slug allocation as well as updates.
  LOCK TABLE public.designs, public.design_listings IN SHARE ROW EXCLUSIVE MODE;
  SELECT id INTO hash_id FROM public.designs WHERE sha256 = d->>'sha256';
  SELECT id INTO source_id FROM public.designs WHERE "sourceImageId" = (d->>'sourceImageId')::BIGINT;
  IF hash_id IS NOT NULL AND source_id IS NOT NULL AND hash_id <> source_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'sha256 and sourceImageId identify different designs',
      DETAIL = jsonb_build_object('sha256DesignId', hash_id, 'sourceImageIdDesignId', source_id)::TEXT;
  END IF;
  SELECT * INTO target FROM public.designs WHERE id = coalesce(hash_id, source_id);
  IF target.id IS NULL AND platform_name = 'redbubble' THEN
    SELECT * INTO target FROM public.designs WHERE "externalId" = work_id::BIGINT;
  ELSIF target.id IS NULL AND platform_name = 'teepublic' THEN
    SELECT array_agg(id) INTO bridge_ids FROM public.designs WHERE props->>'teepublicId' = work_id;
    IF cardinality(bridge_ids) > 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TeePublic legacy ID identifies multiple designs';
    END IF;
    SELECT * INTO target FROM public.designs WHERE id = bridge_ids[1];
  END IF;
  IF target.id IS NOT NULL AND (
    (target.sha256 IS NOT NULL AND target.sha256 <> d->>'sha256') OR
    (target."sourceImageId" IS NOT NULL AND target."sourceImageId" <> (d->>'sourceImageId')::BIGINT)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Existing design has a different source identity',
      DETAIL = jsonb_build_object('designId', target.id)::TEXT;
  END IF;
  IF target.id IS NULL THEN
    WHILE EXISTS (SELECT FROM public.designs WHERE slug = chosen_slug) LOOP
      chosen_slug := slug_base || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    INSERT INTO public.designs (title, slug, description, keywords, "backgroundColor", source, sha256, "sourceImageId", "externalId", "cdnImage")
    VALUES (d->>'title', chosen_slug, coalesce(d->>'description', ''),
      coalesce((SELECT string_agg(value, ',') FROM jsonb_array_elements_text(d->'tags')), ''),
      coalesce(d->>'backgroundColor', '#FFFFFF'), 'pod-studio', d->>'sha256', (d->>'sourceImageId')::BIGINT,
      CASE WHEN platform_name = 'redbubble' THEN work_id::BIGINT END, d->'cdnImage')
    RETURNING * INTO target;
    is_new_design := true;
  END IF;

  SELECT * INTO entry FROM public.design_listings WHERE platform = platform_name AND "externalId" = work_id;
  is_new_listing := entry.id IS NULL;
  IF entry.id IS NOT NULL AND entry."designId" <> target.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Listing belongs to another design',
      DETAIL = jsonb_build_object('designId', target.id, 'listingDesignId', entry."designId")::TEXT;
  END IF;
  IF EXISTS (SELECT FROM public.design_listings WHERE "designId" = target.id AND platform = platform_name
      AND account = l->>'account' AND "externalId" <> work_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Account already has a different listing for this design';
  END IF;
  IF platform_name = 'redbubble' AND EXISTS (SELECT FROM public.designs WHERE "externalId" = work_id::BIGINT AND id <> target.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Redbubble work belongs to another legacy design';
  END IF;

  INSERT INTO public.design_listings ("designId", platform, account, "externalId", url, title, description, tags, "thumbnailUrl", "publishedAt", extra)
  VALUES (target.id, platform_name, l->>'account', work_id, l->>'url', l->>'title', l->>'description',
    l->'tags', l->>'thumbnailUrl', coalesce((l->>'publishedAt')::TIMESTAMPTZ, now()), l->'extra')
  ON CONFLICT (platform, "externalId") DO UPDATE SET
    account = EXCLUDED.account, url = EXCLUDED.url,
    title = CASE WHEN l ? 'title' THEN EXCLUDED.title ELSE design_listings.title END,
    description = CASE WHEN l ? 'description' THEN EXCLUDED.description ELSE design_listings.description END,
    tags = CASE WHEN l ? 'tags' THEN EXCLUDED.tags ELSE design_listings.tags END,
    "thumbnailUrl" = CASE WHEN l ? 'thumbnailUrl' THEN EXCLUDED."thumbnailUrl" ELSE design_listings."thumbnailUrl" END,
    "publishedAt" = CASE WHEN l ? 'publishedAt' THEN EXCLUDED."publishedAt" ELSE design_listings."publishedAt" END,
    extra = CASE WHEN l ? 'extra' THEN EXCLUDED.extra ELSE design_listings.extra END,
    "updatedAt" = now()
  RETURNING * INTO entry;

  props_value := coalesce(target.props::JSONB, '{}'::JSONB);
  IF platform_name = 'redbubble' AND l->'extra' ? 'mockupTshirt' AND coalesce(props_value->>'mockup_tshirt', '') = '' THEN
    props_value := props_value || jsonb_build_object('mockup_tshirt', l->'extra'->>'mockupTshirt');
  ELSIF platform_name = 'teepublic' THEN
    props_value := props_value || jsonb_build_object('teepublicLink', l->>'url', 'teepublicId', work_id);
  END IF;
  UPDATE public.designs SET
    sha256 = coalesce(sha256, d->>'sha256'), "sourceImageId" = coalesce("sourceImageId", (d->>'sourceImageId')::BIGINT),
    source = coalesce(source, 'pod-studio'),
    description = coalesce(description, d->>'description'),
    keywords = coalesce(keywords, (SELECT string_agg(value, ',') FROM jsonb_array_elements_text(d->'tags'))),
    "backgroundColor" = coalesce("backgroundColor", d->>'backgroundColor'),
    "externalId" = CASE WHEN platform_name = 'redbubble' THEN coalesce("externalId", work_id::BIGINT) ELSE "externalId" END,
    "externalLink" = CASE WHEN platform_name = 'redbubble' THEN 'https://www.redbubble.com/shop/ap/' || work_id ELSE "externalLink" END,
    -- A present cdnImage overwrites (e.g. a higher version); an absent one keeps the
    -- stored value. There is no way to clear the column through the API.
    "cdnImage" = CASE WHEN d ? 'cdnImage' THEN d->'cdnImage' ELSE "cdnImage" END,
    props = props_value::JSON, "updatedAt" = now()
  WHERE id = target.id RETURNING * INTO target;

  RETURN jsonb_build_object(
    'design', jsonb_build_object('id', target.id, 'slug', target.slug, 'title', target.title,
      'externalId', target."externalId", 'sha256', target.sha256, 'sourceImageId', target."sourceImageId",
      'cdnImage', target."cdnImage"),
    'listing', to_jsonb(entry) - 'designId' - 'description' - 'createdAt' - 'updatedAt',
    'created', jsonb_build_object('design', is_new_design, 'listing', is_new_listing));
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unique identity, title, or listing conflict',
    DETAIL = jsonb_build_object('constraint', constraint_name)::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_design_listing(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_design_listing(JSONB, TEXT) TO service_role;

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
