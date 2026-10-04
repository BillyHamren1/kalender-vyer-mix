\set ON_ERROR_STOP on
-- TEST-ONLY SKELETON. Captures a genuine displayed parent, NEVER calls the
-- currently unsafe standalone whole reader and NEVER enables a read gate.
-- Root must replace this BLOCKED skeleton only after an independently reviewed
-- genuine product entry/closure and its native queued-writer proof exist.
begin;
set local statement_timeout='8s';set local lock_timeout='1s';
do $$begin
 if current_database()<>'eventflow_project_evidence_http_runtime'
 or current_setting('test.project_evidence_fixture',true) is distinct from 'true'
 then raise exception 'exact_disposable_scope_invoice_required' using errcode='42501';end if;
 if not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000001017' and organization_id='00000000-0000-4000-8000-000000000001' and booking_id is null and deleted_at is null)
 or not exists(select 1 from public.project_purchases where id='00000000-0000-4000-8000-000000001030' and project_id='00000000-0000-4000-8000-000000001017' and amount=700 and approved)
 or not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id join public.user_roles r on r.user_id=p.user_id and r.organization_id=p.organization_id where p.user_id='00000000-0000-4000-8000-000000000199' and p.organization_id='00000000-0000-4000-8000-000000000001' and r.role='admin')
 then raise exception 'genuine_parent_and_live_admin_required' using errcode='55000';end if;
end;$$;
create temporary table scope_invoice_mounted_selectors(data jsonb not null);
do $$declare r jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',true);
 execute 'set local role authenticated';
 r:=public.read_operations_scope_obligation_evidence_v1('00000000-0000-4000-8000-000000000001','project','00000000-0000-4000-8000-000000001017');
 execute 'reset role';
 if r->>'state' is distinct from 'evidence' or r->>'rootId' is distinct from '00000000-0000-4000-8000-000000001017'
 or r#>>'{referenceCurrentness,membership}' is distinct from 'true' or r#>>'{referenceCurrentness,baselines}' is distinct from 'true'
 or coalesce(r->>'snapshotId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'accepted_actual_displayed_parent_required' using errcode='55000';end if;
 insert into scope_invoice_mounted_selectors values(jsonb_build_object('schema','operations-scope-invoice-mounted-selectors.v1','organizationId','00000000-0000-4000-8000-000000000001','actorId','00000000-0000-4000-8000-000000000199','rootKind','project','rootId','00000000-0000-4000-8000-000000001017','compositionSnapshotId',r->>'snapshotId','state','blocked_product_reader_entry_unavailable'));
end;$$;
commit;
select 'SCOPE_INVOICE_MOUNTED_SELECTORS='||data::text as result from scope_invoice_mounted_selectors;
select 'operations-scope-invoice-mounted-browser-fixture BLOCKED product_reader_entry_unavailable' as result;
