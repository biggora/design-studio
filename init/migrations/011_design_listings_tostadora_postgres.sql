-- Adds tostadora to the design_listings platform CHECK (the first platform whose
-- storefronts span several country domains). Idempotent: the old check is replaced
-- only when it does not already accept tostadora.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.design_listings'::regclass
      AND conname = 'design_listings_platform_check'
      AND pg_get_constraintdef(con) LIKE '%tostadora%'
  ) THEN
    ALTER TABLE public.design_listings DROP CONSTRAINT IF EXISTS design_listings_platform_check;
    ALTER TABLE public.design_listings ADD CONSTRAINT design_listings_platform_check
      CHECK (platform IN ('redbubble', 'teepublic', 'spreadshirt', 'tostadora'));
  END IF;
END $$;
