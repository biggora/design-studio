-- Adds zazzle to the design_listings platform CHECK (pod-uploader publishes every
-- pod-studio package design to Zazzle as well). Idempotent: the previous check —
-- the named design_listings_platform_check from migration 011 — is found by its
-- definition, dropped, and replaced; reruns change nothing.
DO $$ DECLARE
  previous TEXT;
BEGIN
  SELECT conname INTO previous
  FROM pg_constraint con
  WHERE con.conrelid = 'public.design_listings'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tostadora%'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%zazzle%';
  IF previous IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.design_listings DROP CONSTRAINT %I', previous);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = 'public.design_listings'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%zazzle%'
  ) THEN
    ALTER TABLE public.design_listings ADD CONSTRAINT design_listings_platform_check
      CHECK (platform IN ('redbubble', 'teepublic', 'spreadshirt', 'tostadora', 'zazzle'));
  END IF;
END $$;
