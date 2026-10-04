\set ON_ERROR_STOP on
-- COMMITTED fixture in a dedicated fresh CI database. NEVER product migration.
begin;
do $$begin
 if current_database() !~ '^eventflow_scope_alias_[a-z0-9_]+$'
  or current_setting('eventflow.scope_alias_isolated',true) is distinct from 'synthetic-disposable'
  or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
  or to_regnamespace('operations_scope_alias_native') is not null
  or (select count(*) from auth.users)<>4
  or exists(select 1 from auth.users where id<>all(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[]))
  or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3
  or exists(select 1 from public.profiles where organization_id is null or (user_id,organization_id) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
   ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
  or exists(select 1 from public.user_roles where (user_id,organization_id,role::text) not in (
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'admin'),
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'projekt'),
   ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid,'admin')))
  or (select count(*) from public.projects)<>3
  or exists(select 1 from public.projects where deleted_at is not null or (id,organization_id) not in (
   ('55555555-5555-4555-8555-555555555555'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('77777777-7777-4777-8777-777777777777'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
   ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)))
  or (select count(*) from public.bookings)<>1 or not exists(select 1 from public.bookings where id='Legacy-Order-42' and organization_id='11111111-1111-4111-8111-111111111111' and large_project_id is null)
  or (select count(*) from public.large_projects)<>1 or not exists(select 1 from public.large_projects where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and organization_id='11111111-1111-4111-8111-111111111111' and deleted_at is null and primary_booking_id='Legacy-Order-42')
  or (select count(*) from public.packing_projects)<>1 or not exists(select 1 from public.packing_projects where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and organization_id='11111111-1111-4111-8111-111111111111' and status='delivered' and booking_id='Legacy-Order-42' and large_project_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  or (select count(*) from public.large_project_bookings)<>1 or (select count(*) from public.packing_project_bookings)<>1
  or not exists(select 1 from public.large_project_bookings where id='ffffffff-ffff-4fff-8fff-ffffffffffff' and organization_id='11111111-1111-4111-8111-111111111111' and large_project_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and booking_id='Legacy-Order-42')
  or not exists(select 1 from public.packing_project_bookings where id='12121212-1212-4212-8212-121212121212' and organization_id='11111111-1111-4111-8111-111111111111' and packing_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and booking_id='Legacy-Order-42')
  or exists(select 1 from public.operations_project_scope_heads) or exists(select 1 from public.operations_project_scope_snapshots)
  or exists(select 1 from public.operations_project_scope_member_ownership) or exists(select 1 from public.operations_project_scope_packing_policies)
  or exists(select 1 from public.operations_project_personnel_review_grants)
  or exists(select 1 from public.operations_personnel_cost_streams) or exists(select 1 from public.operations_personnel_cost_publications)
  or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.role='admin')
 then raise exception 'Fresh disposable scope alias fixture required' using errcode='22023';end if;
end;$$;
create schema operations_scope_alias_native;
revoke all on schema operations_scope_alias_native from public,anon,authenticated,service_role;
create table operations_scope_alias_native.controls(slot text primary key,canonical_scope_id uuid not null,project_view_id uuid not null,packing_view_id uuid not null);
insert into operations_scope_alias_native.controls values('only','90909090-9090-4909-8909-909090909090','55555555-5555-4555-8555-555555555555','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.bookings values('Alias-𐀀-Order-99','11111111-1111-4111-8111-111111111111',null);
update public.projects set booking_id='Alias-𐀀-Order-99' where id='77777777-7777-4777-8777-777777777777';
insert into public.large_project_bookings values('14141414-1414-4414-8414-141414141414','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Alias-𐀀-Order-99');
insert into public.operations_project_scope_packing_policies values('11111111-1111-4111-8111-111111111111','delivered',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
do $$declare p jsonb;r jsonb;begin
 p:=public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 if jsonb_array_length(p#>'{membership,local_booking_ids}')<>2 or jsonb_array_length(p#>'{membership,source_project_ids}')<>2 then raise exception 'Two genuine alias fixture bookings/leaves required';end if;
 r:=public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id','90909090-9090-4909-8909-909090909090','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_revision',0,'expected_membership_fingerprint',p->'membership_fingerprint','idempotency_key','native-alias-canonical-initial','reason','Actual two-booking canonical scope, alias evidence only'));
 if r->>'outcome'<>'accepted' or r->>'scope_revision'<>'1' then raise exception 'Real canonical initial enrollment failed';end if;
 r:=public.grant_operations_project_personnel_review_v1('55555555-5555-4555-8555-555555555555','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'granted','Synthetic leaf grant is not full-scope financial authority','native-alias-leaf-review-grant');
 if r->>'status'<>'accepted' or r->>'grant_sequence'<>'1' then raise exception 'Real leaf grant fixture failed';end if;
end;$$;
reset role;
commit;
\echo operations-scope-view-alias-native-setup PASS
