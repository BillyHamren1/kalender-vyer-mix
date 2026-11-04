-- Disposable database only. Keep this transaction open across migration/assertions.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.packing_projects') IS NOT NULL THEN
    RAISE EXCEPTION 'Scanner fixture requires an empty disposable database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
-- Reproduce broad hosted defaults: RLS alone cannot stop TRUNCATE.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
CREATE TABLE public.packing_projects(id uuid PRIMARY KEY,organization_id uuid,booking_id text);
CREATE TABLE public.packing_parcels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),packing_id uuid,organization_id uuid,parcel_number integer,created_by text,created_by_staff_id text);
CREATE TABLE public.packing_list_items(id uuid PRIMARY KEY,packing_id uuid,organization_id uuid,excluded boolean,wms_item_type_id uuid,wms_line_id text,parcel_id uuid);
CREATE UNIQUE INDEX fixture_packing_wms_identity ON public.packing_list_items(packing_id,wms_line_id) WHERE wms_line_id IS NOT NULL;
CREATE TABLE public.packing_list_item_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,packing_list_item_id uuid,parcel_id uuid,quantity integer,scanned_by text,created_at timestamptz DEFAULT now());
INSERT INTO public.packing_projects VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
INSERT INTO public.packing_list_items VALUES('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',false,'60000000-0000-4000-8000-000000000001','line',NULL);
