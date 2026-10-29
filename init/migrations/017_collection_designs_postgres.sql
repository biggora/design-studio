-- Keep the function inlinable: SQL + STABLE + SECURITY INVOKER, without SET
-- clauses or STRICT. All table references are schema-qualified. RLS and table
-- privileges remain those of the caller; this is a read-only filter, not a bypass.
CREATE OR REPLACE FUNCTION public.get_collection_designs(collection_title text)
RETURNS SETOF public.designs
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT d.* FROM public.designs AS d
  WHERE d.active = true AND EXISTS (
    SELECT 1 FROM public.design_collections AS dc
    JOIN public.collections AS c ON c.id = dc."collectionId"
    WHERE dc."designId" = d.id AND c.title = collection_title
  );
$$;
REVOKE ALL ON FUNCTION public.get_collection_designs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_collection_designs(text) TO anon, authenticated, service_role;
