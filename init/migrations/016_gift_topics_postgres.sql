ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS "giftTopics" JSONB;
COMMENT ON COLUMN public.designs."giftTopics" IS 'NULL: automatic gift selection; JSON array: authoritative reviewed gift topics; []: exclude from gifts. Marketplace imports must preserve this field.';
