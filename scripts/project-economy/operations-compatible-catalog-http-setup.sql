-- NEW committed disposable fixture. Genuine public commands precede HTTP reads.
-- No product routine, source invoice, authority grant or pricing rule is added.
begin;
do $$begin
 if current_database()<>'operations_compatible_install_runtime'
 or current_user<>'postgres' or session_user<>'postgres'
 or current_setting('server_version_num')<>'150019'
 or current_setting('eventflow.compatible_install_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.compatible_catalog_http_isolated',true) is distinct from 'synthetic-disposable'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_catalog_http_fixture') is not null
 or exists(select 1 from pg_roles where rolname='operations_catalog_http_authenticator')
 or not exists(select 1 from pg_namespace where nspname='operations_full_catalog_fixture')
 or not exists(select 1 from pg_namespace where nspname='operations_remaining_reader_private')
 or (select count(*) from auth.users)<>4
 or (select count(*) from public.profiles)<>4
 or (select count(*) from public.user_roles)<>3
 or (select count(*) from public.projects)<>3
 or exists(select 1 from public.profiles p where p.organization_id is null or (p.user_id,p.organization_id) not in (
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'88888888-8888-4888-8888-888888888888'::uuid),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'11111111-1111-4111-8111-111111111111'::uuid)))
 or not exists(select 1 from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin')
 or exists(select 1 from public.operations_project_obligation_heads)
 or exists(select 1 from public.operations_project_scope_heads)
 or exists(select 1 from public.operations_scope_obligation_composition_heads)
 or exists(select 1 from public.operations_finance_invoice_streams)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 then raise exception using errcode='22023',message='catalog_http_fresh_fixture_required';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname,p.proname) in (
 ('public','read_operations_scope_invoice_kernel_evidence_v1'),('public','read_operations_scope_invoice_capture_admin_v1'),
 ('public','read_operations_scope_obligation_evidence_v1'),('public','read_operations_scope_obligation_drilldown_v1'),
 ('public','read_operations_scope_obligation_composition_v1'),('public','read_operations_invoice_obligation_kernel_evidence_v1'),
 ('public','read_operations_obligation_original_v1'),('public','read_operations_obligation_source_policy_v1'))
 and (p.proowner<>(select oid from pg_roles where rolname='postgres') or p.prosecdef
 or p.proconfig is distinct from case when p.proname in ('read_operations_scope_invoice_kernel_evidence_v1','read_operations_scope_invoice_capture_admin_v1')
 then array['search_path=""'] else array['search_path=""','lock_timeout=100ms'] end))
 or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 'read_operations_scope_invoice_kernel_evidence_v1','read_operations_scope_invoice_capture_admin_v1',
 'read_operations_scope_obligation_evidence_v1','read_operations_scope_obligation_drilldown_v1',
 'read_operations_scope_obligation_composition_v1','read_operations_invoice_obligation_kernel_evidence_v1',
 'read_operations_obligation_original_v1','read_operations_obligation_source_policy_v1'))<>8
 or has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','EXECUTE')
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','EXECUTE')
 then raise exception using errcode='55000',message='catalog_http_installed_readers_required';end if;
end$$;

create schema operations_catalog_http_fixture authorization postgres;
revoke all on schema operations_catalog_http_fixture from public,anon,authenticated,service_role;
create table operations_catalog_http_fixture.capture(slot text primary key,document jsonb not null);
revoke all on operations_catalog_http_fixture.capture from public,anon,authenticated,service_role;
create temporary table catalog_http_seed(slot text primary key,document jsonb not null) on commit drop;
grant select,insert on catalog_http_seed to authenticated,service_role;

set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into catalog_http_seed values('baseline',public.append_operations_manual_obligation_baseline_v1(jsonb_build_object(
 'schema_version','operations-obligation-manual-baseline.v1',
 'project_id','55555555-5555-4555-8555-555555555555','obligation_id','10101010-1010-4010-8010-101010101010',
 'expected_revision',0,'currency','SEK','category','supplier','cost_basis','invoice',
 'estimate_minor',null,'committed_minor',null,'idempotency_key','catalog-http-baseline-v1','reason','Isolated explicit unknown manual baseline')));
insert into catalog_http_seed values('preview',public.preview_operations_project_scope_v1('large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
insert into catalog_http_seed values('enrollment',public.enroll_operations_project_scope_v1(jsonb_build_object(
 'schema','operations-project-scope-enroll.v1','economic_scope_id','20202020-2020-4020-8020-202020202020',
 'root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_revision',0,
 'expected_membership_fingerprint',(select document->>'membership_fingerprint' from catalog_http_seed where slot='preview'),
 'idempotency_key','catalog-http-enrollment-v1','reason','Isolated actual full large-project membership')));
insert into catalog_http_seed values('composition',public.compose_operations_scope_obligations_v1(jsonb_build_object(
 'schema_version','operations-scope-obligation-compose.v1','economic_scope_id','20202020-2020-4020-8020-202020202020',
 'expected_scope_revision',1,'expected_membership_fingerprint',(select document->>'membership_fingerprint' from catalog_http_seed where slot='preview'),
 'expected_composition_revision',0,'currency','SEK',
 'baseline_event_ids',jsonb_build_array((select document->>'event_id' from catalog_http_seed where slot='baseline')),
 'idempotency_key','catalog-http-composition-v1','reason','Isolated copied nullable manual baseline')));
reset role;

do $$begin
 if (select document->>'outcome' from catalog_http_seed where slot='baseline') is distinct from 'accepted'
 or (select document->>'revision' from catalog_http_seed where slot='baseline') is distinct from '1'
 or (select document->>'outcome' from catalog_http_seed where slot='enrollment') is distinct from 'accepted'
 or (select document->>'scope_revision' from catalog_http_seed where slot='enrollment') is distinct from '1'
 or (select document->>'outcome' from catalog_http_seed where slot='composition') is distinct from 'accepted'
 or (select document->>'composition_revision' from catalog_http_seed where slot='composition') is distinct from '1'
 or (select document->'eac_minor' from catalog_http_seed where slot='composition') is distinct from 'null'::jsonb
 or (select document->'membership'->'source_project_ids' from catalog_http_seed where slot='preview') is distinct from '["55555555-5555-4555-8555-555555555555","77777777-7777-4777-8777-777777777777"]'::jsonb
 then raise exception using errcode='22023',message='catalog_http_genuine_receipts_required';end if;
end$$;
insert into public.operations_invoice_obligation_kernel_read_gates(organization_id,enabled) values('11111111-1111-4111-8111-111111111111',true);
insert into public.operations_scope_invoice_kernel_read_gates(organization_id,enabled) values('11111111-1111-4111-8111-111111111111',true);
insert into catalog_http_seed values('service_request',jsonb_build_object(
 'schema_version','operations-scope-invoice-kernel-read.v1','organization_id','11111111-1111-4111-8111-111111111111',
 'economic_scope_id','20202020-2020-4020-8020-202020202020','expected_scope_revision',1,
 'expected_membership_fingerprint',(select document->>'membership_fingerprint' from catalog_http_seed where slot='preview'),
 'expected_composition_revision',1,'expected_composition_fingerprint',(select document->>'fingerprint' from catalog_http_seed where slot='composition')));
insert into catalog_http_seed values('admin_request',jsonb_build_object(
 'schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','large_project',
 'root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_composition_snapshot_id',(select document->>'snapshot_id' from catalog_http_seed where slot='composition')));
insert into catalog_http_seed values('kernel_request',jsonb_build_object(
 'schema_version','operations-invoice-obligation-kernel-read.v1','organization_id','11111111-1111-4111-8111-111111111111',
 'project_id','55555555-5555-4555-8555-555555555555','obligation_id','10101010-1010-4010-8010-101010101010'));
insert into catalog_http_seed values('drilldown_request',jsonb_build_object(
 'schema_version','operations-scope-obligation-drilldown-read.v1','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'obligation_id','10101010-1010-4010-8010-101010101010','expected_composition_snapshot_id',(select document->>'snapshot_id' from catalog_http_seed where slot='composition'),
 'expected_baseline_event_id',(select document->>'event_id' from catalog_http_seed where slot='baseline')));

set local role authenticated;
insert into catalog_http_seed values('admin_reply',public.read_operations_scope_invoice_capture_admin_v1((select document from catalog_http_seed where slot='admin_request')));
insert into catalog_http_seed values('parent_reply',public.read_operations_scope_obligation_evidence_v1('11111111-1111-4111-8111-111111111111','large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
insert into catalog_http_seed values('drilldown_reply',public.read_operations_scope_obligation_drilldown_v1((select document from catalog_http_seed where slot='drilldown_request')));
insert into catalog_http_seed values('no_scope_reply',public.read_operations_scope_obligation_evidence_v1('11111111-1111-4111-8111-111111111111','project','77777777-7777-4777-8777-777777777777'));
reset role;
set local role service_role;
insert into catalog_http_seed values('service_reply',public.read_operations_scope_invoice_kernel_evidence_v1((select document from catalog_http_seed where slot='service_request')));
insert into catalog_http_seed values('composition_reply',public.read_operations_scope_obligation_composition_v1('11111111-1111-4111-8111-111111111111','20202020-2020-4020-8020-202020202020'));
insert into catalog_http_seed values('kernel_reply',public.read_operations_invoice_obligation_kernel_evidence_v1((select document from catalog_http_seed where slot='kernel_request')));
insert into catalog_http_seed values('original_reply',public.read_operations_obligation_original_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','10101010-1010-4010-8010-101010101010',repeat('a',64)));
insert into catalog_http_seed values('policy_reply',public.read_operations_obligation_source_policy_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','10101010-1010-4010-8010-101010101010',repeat('a',64)));
reset role;
insert into operations_catalog_http_fixture.capture select * from catalog_http_seed;

create role operations_catalog_http_authenticator login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 10;
grant anon,authenticated,service_role to operations_catalog_http_authenticator;
-- Password is assigned by the owned native runner from fresh private randomness,
-- after source/setup checks and before the read-only baseline. Never in this file.
commit;
