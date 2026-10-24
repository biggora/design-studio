-- Adds tostadora to the design_listings platform CHECK (the first platform whose
-- storefronts span several country domains). Idempotent: the previous check — the
-- auto-named column CHECK from migration 003 — is found by its definition, dropped,
-- and replaced with the named design_listings_platform_check; reruns change nothing.
DO $$ DECLARE
  previous TEXT;
BEGIN
  SELECT conname INTO previous
  FROM pg_constraint con
  WHERE con.conrelid = 'public.design_listings'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%teepublic%'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%tostadora%';
  IF previous IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.design_listings DROP CONSTRAINT %I', previous);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = 'public.design_listings'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%tostadora%'
  ) THEN
    ALTER TABLE public.design_listings ADD CONSTRAINT design_listings_platform_check
      CHECK (platform IN ('redbubble', 'teepublic', 'spreadshirt', 'tostadora'));
  END IF;
END $$;
