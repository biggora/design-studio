BEGIN;

-- The manual `active` switch: false hides a print from every public surface
-- (catalog, feeds, sitemap, public API) and 404s its direct URLs. Idempotent.
-- Rollout: run BEFORE deploying the code that filters on it (npm run db:migrate).
-- Existing rows become active via the column default; the scrapes never rewrite
-- the flag — it changes only through POST /api/designs/active or the CLI.
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- The random helpers follow the public filter; the app itself queries the table directly.
CREATE OR REPLACE FUNCTION public.get_random_design()
RETURNS SETOF public.designs
LANGUAGE sql
AS $$
  SELECT * FROM public.designs
  WHERE active
  ORDER BY random()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_random_designs()
RETURNS SETOF public.designs
LANGUAGE sql
AS $$
  SELECT * FROM public.designs
  WHERE active
  ORDER BY random()
  LIMIT 3;
$$;

COMMIT;
