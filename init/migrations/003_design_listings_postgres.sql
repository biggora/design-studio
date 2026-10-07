BEGIN;

ALTER TABLE public.designs ALTER COLUMN "externalId" DROP NOT NULL;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS "sourceImageId" BIGINT UNIQUE;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS sha256 TEXT UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS source TEXT;

CREATE TABLE IF NOT EXISTS public.design_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "designId" UUID NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('redbubble', 'teepublic', 'spreadshirt')),
  account TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  tags JSONB,
  "thumbnailUrl" TEXT,
  "publishedAt" TIMESTAMPTZ,
  extra JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, "externalId"),
  UNIQUE ("designId", platform, account)
);

ALTER TABLE public.design_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_listings FROM anon, authenticated;
-- The public catalog and read-only scraper checks only need these safe columns.
GRANT SELECT ("designId", platform, "externalId", url) ON public.design_listings TO anon, authenticated;
GRANT ALL ON public.design_listings TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'design_listings' AND policyname = 'Public Read Listing Links') THEN
    CREATE POLICY "Public Read Listing Links" ON public.design_listings FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'design_listings' AND policyname = 'Service Role Listings All') THEN
    CREATE POLICY "Service Role Listings All" ON public.design_listings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Invoker privileges, callable only by the service role. Raising an error rolls back
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
    INSERT INTO public.designs (title, slug, description, keywords, "backgroundColor", source, sha256, "sourceImageId", "externalId")
    VALUES (d->>'title', chosen_slug, coalesce(d->>'description', ''),
      coalesce((SELECT string_agg(value, ',') FROM jsonb_array_elements_text(d->'tags')), ''),
      coalesce(d->>'backgroundColor', '#FFFFFF'), 'pod-studio', d->>'sha256', (d->>'sourceImageId')::BIGINT,
      CASE WHEN platform_name = 'redbubble' THEN work_id::BIGINT END)
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
    props = props_value::JSON, "updatedAt" = now()
  WHERE id = target.id RETURNING * INTO target;

  RETURN jsonb_build_object(
    'design', jsonb_build_object('id', target.id, 'slug', target.slug, 'title', target.title,
      'externalId', target."externalId", 'sha256', target.sha256, 'sourceImageId', target."sourceImageId"),
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
COMMIT;
