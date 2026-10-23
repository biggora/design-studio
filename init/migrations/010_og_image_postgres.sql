BEGIN;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS "ogImage" JSONB;

-- Row lock makes the first assignment win. Neither metadata nor updatedAt changes.
CREATE OR REPLACE FUNCTION public.set_design_og_image(write JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE stored JSONB; result JSONB; state TEXT;
BEGIN
  SELECT "ogImage" INTO stored FROM public.designs
    WHERE id = (write->>'designId')::UUID AND active = TRUE FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found','ogImage',NULL); END IF;
  result := stored;
  IF write->>'operation' = 'assign' THEN
    IF stored IS NULL THEN
      result := jsonb_build_object('assignment',write->'assignment','asset',NULL); state := 'created';
    ELSIF stored->'assignment' = write->'assignment' THEN state := 'unchanged';
    ELSE state := 'conflict'; END IF;
  ELSIF write->>'operation' = 'ready' AND stored->'assignment'->>'hash' = write->>'assignmentHash' THEN
    IF stored->'asset' IS NULL OR stored->'asset' = 'null'::JSONB THEN
      result := jsonb_set(stored,'{asset}',write->'asset'); state := 'ready';
    ELSIF stored->'asset' = write->'asset' THEN state := 'unchanged';
    ELSE state := 'conflict'; END IF;
  ELSE state := 'conflict'; END IF;
  IF state IN ('created','ready') THEN
    UPDATE public.designs SET "ogImage" = result WHERE id = (write->>'designId')::UUID;
  END IF;
  RETURN jsonb_build_object('status',state,'ogImage',result);
END;
$$;
REVOKE ALL ON FUNCTION public.set_design_og_image(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_design_og_image(JSONB) TO service_role;
COMMIT;
