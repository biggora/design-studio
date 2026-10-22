BEGIN;

-- PUT /api/v1/designs/cdn-image: writes designs."cdnImage" (the pod-uploader mockup array) for up to
-- 100 designs in one transaction. Each item is {sha256?, sourceImageId?, redbubbleId?, cdnImage};
-- redbubbleId matches designs."externalId". Returns one result per item, in order:
-- {index, status: 'updated'|'not_found'|'conflict', designId?, cdnImage?, message?}.
-- Per-item failures never abort the batch. The column is overwritten; a NULL sha256 /
-- "sourceImageId" is filled from the item (coalesce, as ingest does); nothing else changes
-- except "updatedAt". Shape validation (1-8 mockups, key/kind/ints) is the route's job; the function
-- only checks identities and that the keys address the resolved design's sha256.
-- Invoker privileges, callable only by the service role. Rollout: run BEFORE deploying the route.
CREATE OR REPLACE FUNCTION public.set_design_cdn_image(items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  item JSONB;
  idx INTEGER;
  hash_id UUID;
  source_id UUID;
  rb_id UUID;
  ids UUID[];
  target public.designs%ROWTYPE;
  results JSONB := '[]'::JSONB;
  expected_prefix TEXT;
BEGIN
  FOR item, idx IN SELECT value, (ordinality - 1)::INTEGER FROM jsonb_array_elements(items) WITH ORDINALITY LOOP
    hash_id := NULL; source_id := NULL; rb_id := NULL;
    IF item ? 'sha256' THEN
      SELECT id INTO hash_id FROM public.designs WHERE sha256 = item->>'sha256';
    END IF;
    IF item ? 'sourceImageId' THEN
      SELECT id INTO source_id FROM public.designs WHERE "sourceImageId" = (item->>'sourceImageId')::BIGINT;
    END IF;
    IF item ? 'redbubbleId' THEN
      SELECT id INTO rb_id FROM public.designs WHERE "externalId" = (item->>'redbubbleId')::BIGINT;
    END IF;
    SELECT array_agg(DISTINCT candidate) INTO ids FROM unnest(ARRAY[hash_id, source_id, rb_id]) AS u(candidate) WHERE candidate IS NOT NULL;

    IF ids IS NULL THEN
      results := results || jsonb_build_object('index', idx, 'status', 'not_found');
      CONTINUE;
    ELSIF cardinality(ids) > 1 THEN
      results := results || jsonb_build_object('index', idx, 'status', 'conflict',
        'message', 'The identifiers resolve to different designs');
      CONTINUE;
    END IF;

    SELECT * INTO target FROM public.designs WHERE id = ids[1] FOR UPDATE;
    expected_prefix := left(coalesce(target.sha256, item->>'sha256'), 16);
    IF item ? 'sha256' AND target.sha256 IS NOT NULL AND target.sha256 <> item->>'sha256' THEN
      results := results || jsonb_build_object('index', idx, 'status', 'conflict', 'designId', target.id,
        'message', 'The design has a different sha256');
    ELSIF item ? 'sourceImageId' AND target."sourceImageId" IS NOT NULL
        AND target."sourceImageId" <> (item->>'sourceImageId')::BIGINT THEN
      results := results || jsonb_build_object('index', idx, 'status', 'conflict', 'designId', target.id,
        'message', 'The design has a different sourceImageId');
    ELSIF expected_prefix IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(item->'cdnImage') AS m
        WHERE split_part(m->>'key', '/', 2) <> expected_prefix) THEN
      results := results || jsonb_build_object('index', idx, 'status', 'conflict', 'designId', target.id,
        'message', 'The cdnImage keys do not address this design''s sha256');
    ELSE
      UPDATE public.designs SET
        "cdnImage" = item->'cdnImage',
        sha256 = coalesce(sha256, item->>'sha256'),
        "sourceImageId" = coalesce("sourceImageId", (item->>'sourceImageId')::BIGINT),
        "updatedAt" = now()
      WHERE id = target.id RETURNING * INTO target;
      results := results || jsonb_build_object('index', idx, 'status', 'updated', 'designId', target.id,
        'cdnImage', target."cdnImage");
    END IF;
  END LOOP;
  RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.set_design_cdn_image(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_design_cdn_image(JSONB) TO service_role;
COMMIT;
