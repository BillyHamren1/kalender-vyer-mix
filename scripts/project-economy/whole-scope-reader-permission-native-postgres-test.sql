-- TEST ONLY direct permission assertions. Requires same-session frozen calculator,
-- frozen publication prototype and additive TRY entry; all changes roll back.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_reader_permission_native.fixture') is null
 or to_regprocedure('pg_temp.publish_scope_native_try_v1(jsonb)') is null
 or (select count(*) from operations_scope_reader_permission_native.fixture)<>1
 or (select count(*) from public.user_roles)<>3
 or (select count(*) from public.projects)<>4
 or (select count(*) from public.operations_project_scope_heads)<>2
 or not exists(select 1 from public.operations_project_scope_heads where organization_id='11111111-1111-4111-8111-111111111111' and economic_scope_id='67676767-6767-4676-8676-676767676767' and root_kind='packing_project' and root_id='65656565-6565-4656-8656-656565656565' and current_revision=1)
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from operations_scope_publication_native.heads)
 or exists(select 1 from operations_scope_publication_native.blocked_controls)
 or not exists(select 1 from pg_constraint c where c.conrelid='public.user_roles'::regclass and c.confrelid='auth.users'::regclass and c.contype='f' and c.confdeltype='c' and c.convalidated and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='user_id')]::smallint[])
 or not exists(select 1 from pg_index i where i.indexrelid='public.user_roles_user_role_org_key'::regclass and i.indisunique and i.indisvalid and i.indrelid='public.user_roles'::regclass and i.indnatts=3 and (select array_agg(a.attname::text order by x.ordinality) from unnest(i.indkey) with ordinality x(attnum,ordinality) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.attnum)=array['user_id','role','organization_id'])
 or exists(select 1 from operations_scope_publication_try_native.controls where slot<>'only' or pause_stage<>'none')
 then raise exception 'fresh_disposable_permission_assertions_required' using errcode='22023';end if;
end;$$;
create temporary table permission_command(command jsonb not null);
insert into permission_command select (read_request-'organization_id')||jsonb_build_object('schema_version','operations-scope-publication-native.v1','expected_publication_revision',0,'idempotency_key','native-permission-direct-publication','reason','Actual unknown manual source-free scope proof') from operations_scope_reader_permission_native.fixture;
grant select on pg_temp.permission_command to authenticated;
create function pg_temp.permission_assert(v boolean) returns void language plpgsql as $$begin
 if v is distinct from true then raise exception 'permission_direct_assertion_failed' using errcode='22023';end if;
end;$$;
-- Explicit expected SQLSTATE only; unknown schema/permission faults cannot PASS.
do $$begin
 begin insert into public.user_roles(user_id,organization_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin');raise exception 'duplicate_role_accepted' using errcode='22023';exception when unique_violation then null;end;
 begin insert into public.user_roles(user_id,organization_id,role) values('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','admin');raise exception 'missing_auth_role_accepted' using errcode='22023';exception when foreign_key_violation then null;end;
 begin insert into public.profiles(user_id,organization_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');raise exception 'duplicate_profile_accepted' using errcode='22023';exception when unique_violation then null;end;
end;$$;
select pg_temp.permission_assert((select count(*)=3 from public.user_roles) and (select count(*)=4 from public.profiles));
-- No-actor and the existing granted leaf reviewer do not authorize this whole scope.
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform pg_temp.publish_scope_native_try_v1(command) from pg_temp.permission_command;raise exception 'no_actor_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'authenticated_scope_admin_required' then raise;end if;end;
end;$$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$begin
 begin perform pg_temp.publish_scope_native_try_v1(command) from pg_temp.permission_command;raise exception 'leaf_role_elevated' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'organization_scope_admin_required' then raise;end if;end;
end;$$;
reset role;
-- Revoke the real qualifying role and recheck before any private hint access.
update public.user_roles set role='projekt' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform pg_temp.publish_scope_native_try_v1(command) from pg_temp.permission_command;raise exception 'revoked_admin_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'organization_scope_admin_required' then raise;end if;end;
end;$$;
reset role;
update public.user_roles set role='admin' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='projekt';
-- An enabled DIFFERENT status does not authorize adoption of an unhinted row.
update public.packing_projects set status='ready' where id='65656565-6565-4656-8656-656565656565';
set local role authenticated;
do $$begin
 begin perform pg_temp.publish_scope_native_try_v1(command) from pg_temp.permission_command;raise exception 'new_unhinted_policy_accepted' using errcode='22023';exception when sqlstate 'PT409' then if sqlerrm<>'native_publication_source_changed' then raise;end if;end;
end;$$;
reset role;
update public.packing_projects set status='planning' where id='65656565-6565-4656-8656-656565656565';
update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';
set local role authenticated;
do $$begin
 begin perform pg_temp.publish_scope_native_try_v1(command) from pg_temp.permission_command;raise exception 'revoked_packing_policy_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'scope_packing_missing_or_unenrolled' then raise;end if;end;
end;$$;
reset role;
update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='planning';
select pg_temp.permission_assert(not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.blocked_controls));
set local role authenticated;
do $$declare r jsonb;begin
 select pg_temp.publish_scope_native_try_v1(command) into strict r from pg_temp.permission_command;
 perform pg_temp.permission_assert(r->>'outcome'='accepted' and r->'publication_revision'='1'::jsonb and r->>'delivery_state'='blocked_missing_authoritative_destination');
end;$$;
reset role;
select pg_temp.permission_assert((select count(*)=1 and bool_and(projection->'known_captured_invoice_cost_minor'='null'::jsonb and projection->'remaining_minor'='null'::jsonb and projection->'eac_minor'='null'::jsonb and projection->'budget_minor'='null'::jsonb and projection->'margin_minor'='null'::jsonb and capture->'source_inventory'='[]'::jsonb) from operations_scope_publication_native.publications) and (select count(*)=1 and bool_and(destination_id is null and wire_payload is null) from operations_scope_publication_native.blocked_controls));
rollback;
select 'whole-scope-reader-permission-direct PASS constraints3_denials5_unknown_saved1_rollback' as proof;
