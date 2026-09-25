-- Fixture-schema: minimal spegling av produktionens typer (bookings.id text, uuid-övrigt).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE public.profiles(user_id uuid primary key, organization_id uuid not null);
CREATE FUNCTION public.get_user_organization_id(_uid uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ select organization_id from profiles where user_id=_uid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE public.bookings(id text primary key, organization_id uuid not null, booking_number text, client text, status text, large_project_id uuid, rigdaydate date, eventdate date, rigdowndate date);
CREATE TABLE public.large_projects(id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text, deleted_at timestamptz);
ALTER TABLE public.bookings ADD FOREIGN KEY (large_project_id) REFERENCES public.large_projects(id) ON DELETE SET NULL;
CREATE TABLE public.large_project_bookings(id uuid primary key default gen_random_uuid(), large_project_id uuid not null references public.large_projects(id) on delete cascade, booking_id text not null references public.bookings(id) on delete cascade, sort_order int default 0, organization_id uuid not null, created_at timestamptz default now());
CREATE TABLE public.booking_products(id uuid primary key default gen_random_uuid(), booking_id text references public.bookings(id), name text, quantity int, organization_id uuid not null);
CREATE TABLE public.calendar_events(id uuid primary key default gen_random_uuid(), booking_id text, event_type text, start_time timestamptz, resource_id text, organization_id uuid not null);
CREATE TABLE public.packing_projects(id uuid primary key default gen_random_uuid(), booking_id text, status text, organization_id uuid not null);
CREATE TABLE public.packing_list_items(id uuid primary key default gen_random_uuid(), packing_id uuid references public.packing_projects(id), quantity_packed int, organization_id uuid not null);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bookings','large_projects','large_project_bookings','booking_products','calendar_events','packing_projects','packing_list_items'] LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role; ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;',t,t,t);
  EXECUTE format('CREATE POLICY org_all ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid())) WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));',t);
 END LOOP; END $$;
GRANT SELECT ON public.profiles TO authenticated;
