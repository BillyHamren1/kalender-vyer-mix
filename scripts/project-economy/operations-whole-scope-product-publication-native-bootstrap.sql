\set ON_ERROR_STOP on
-- TEST ONLY prerequisite augmentation of the deliberately limited scoped23
-- bootstrap. Not a product migration or evidence of full hosted schema/RLS.
-- FK/unique definitions are copied from genuine373 permission fixture blob
-- 58133640f070a5536aa94f59e1e660cadfb756a5. sort_order/id default supply the
-- production columns consumed by the exact legacy link function below.
begin;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_whole_scope_product_native') is not null
 or to_regnamespace('operations_whole_scope_publication_private') is not null
 or (select count(*) from auth.users)<>4
 or (select count(*) from public.profiles)<>4
 or (select count(*) from public.user_roles)<>3
 or exists(select 1 from public.operations_project_scope_heads)
 or exists(select 1 from public.operations_scope_obligation_composition_heads)
 or exists(select 1 from public.operations_finance_invoice_streams)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 or exists(select 1 from pg_constraint where conrelid='public.user_roles'::regclass and conname='user_roles_user_id_fkey')
 or to_regclass('public.user_roles_user_role_org_key') is not null
 or exists(select 1 from pg_attribute where attrelid='public.large_project_bookings'::regclass and attname='sort_order' and not attisdropped)
 then raise exception 'fresh_product_prerequisite_fixture_required' using errcode='22023';end if;
end;$$;
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
create unique index user_roles_user_role_org_key on public.user_roles(user_id,role,organization_id);
alter table public.large_project_bookings add column sort_order integer not null default 0;
alter table public.large_project_bookings alter column id set default gen_random_uuid();
-- Exact named function extraction, genuine Git373 path
-- supabase/migrations/20260925103906_4b61bf34-4afa-4e77-9eed-933e2872da1f.sql
-- Git blob9e9a582456312df13454bb27ddcbbd1b5cfbc668. Full legacy migration,
-- other writers, their triggers/backfills and hosted policies are NOT installed.
CREATE OR REPLACE FUNCTION public.link_booking_to_large_project(
  p_large_project_id uuid,
  p_booking_id text,
  p_make_primary boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_booking_org uuid;
  v_conflict uuid;
  v_link uuid;
  v_next int;
BEGIN
  SELECT organization_id INTO v_booking_org FROM public.bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT organization_id INTO v_org FROM public.large_projects
   WHERE id = p_large_project_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_booking_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'ORGANIZATION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT lp.id INTO v_conflict
    FROM public.large_projects lp
   WHERE lp.deleted_at IS NULL AND lp.id <> p_large_project_id
     AND (lp.id IN (SELECT large_project_id FROM public.large_project_bookings WHERE booking_id = p_booking_id)
          OR lp.id = (SELECT large_project_id FROM public.bookings WHERE id = p_booking_id))
   LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_IN_OTHER_PROJECT:%', v_conflict USING ERRCODE = '23505';
  END IF;

  SELECT id INTO v_link FROM public.large_project_bookings
   WHERE large_project_id = p_large_project_id AND booking_id = p_booking_id;
  IF v_link IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
      FROM public.large_project_bookings WHERE large_project_id = p_large_project_id;
    INSERT INTO public.large_project_bookings (large_project_id, booking_id, sort_order, organization_id)
    VALUES (p_large_project_id, p_booking_id, v_next, v_org)
    RETURNING id INTO v_link;
  END IF;

  UPDATE public.bookings SET large_project_id = p_large_project_id WHERE id = p_booking_id;

  IF p_make_primary THEN
    UPDATE public.large_projects SET primary_booking_id = p_booking_id
     WHERE id = p_large_project_id AND primary_booking_id IS NULL;
  END IF;

  RETURN v_link;
END;
$$;

revoke all on function public.link_booking_to_large_project(uuid,text,boolean) from public,anon,authenticated,service_role;
-- Invoked by owned postgres fixture only. No synthetic wider client grants.
commit;

