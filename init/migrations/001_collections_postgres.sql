-- Adds Redbubble collections support: `collections` table and the
-- `design_collections` many-to-many join table linking `designs` to `collections`,
-- plus matching Row Level Security policies.
-- Idempotent: safe to run multiple times.
-- Run once in the Supabase SQL editor (or via `psql`) against an existing database.

create table if not exists
    public.collections (
                       id uuid not null default gen_random_uuid (),
                       "externalId" bigint not null,
                       title character varying not null,
                       description text null,
                       "coverImageUrl" text null,
                       "createdAt" timestamp with time zone not null default now(),
                       "updatedAt" timestamp without time zone null,
                       constraint collections_pkey primary key (id),
                       constraint collections_externalid_key unique ("externalId")
) tablespace pg_default;

create table if not exists
    public.design_collections (
                       "designId" uuid not null references public.designs (id) on delete cascade,
                       "collectionId" uuid not null references public.collections (id) on delete cascade,
                       constraint design_collections_pkey primary key ("designId", "collectionId")
) tablespace pg_default;

create index if not exists design_collections_collectionid_idx on public.design_collections ("collectionId");

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_collections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'collections' AND policyname = 'Public Read Collections'
    ) THEN
        CREATE POLICY "Public Read Collections" ON public.collections FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'design_collections' AND policyname = 'Public Read Design Collections'
    ) THEN
        CREATE POLICY "Public Read Design Collections" ON public.design_collections FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'collections' AND policyname = 'Service Role Collections All'
    ) THEN
        CREATE POLICY "Service Role Collections All" ON public.collections FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'design_collections' AND policyname = 'Service Role Design Collections All'
    ) THEN
        CREATE POLICY "Service Role Design Collections All" ON public.design_collections FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END
$$;
