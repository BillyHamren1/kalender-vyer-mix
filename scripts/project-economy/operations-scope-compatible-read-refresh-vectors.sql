-- TEST ONLY: current private fixture requests -> actual old owner and new public role reads.
-- No economic/head/write action and no old core role grant restoration.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or (select count(*) from operations_scope_compatible_read_native.requests)<>2
 or has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','execute')
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','execute')
 then raise exception 'private_current_product_read_parity_required' using errcode='22023';end if;
end;$$;
create temporary table current_native_requests as select * from operations_scope_compatible_read_native.requests;
create temporary table current_native_vectors(label text primary key,request jsonb,evidence text);
create temporary table current_native_before(data text);insert into current_native_before select operations_scope_compatible_read_native.state_sha256();
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into current_native_vectors select 'old_service_'||case_id,service_request,operations_economy_private.read_scope_invoice_kernel_v1(service_request)::text from current_native_requests;
insert into current_native_vectors select 'old_admin_'||case_id,admin_request,operations_economy_private.read_scope_invoice_capture_admin_v1(admin_request)::text from current_native_requests;
grant select on current_native_requests to authenticated,service_role;
grant insert on current_native_vectors to authenticated,service_role;
set local role service_role;
insert into current_native_vectors select 'new_service_'||case_id,service_request,public.read_operations_scope_invoice_kernel_evidence_v1(service_request)::text from current_native_requests;
reset role;set local role authenticated;
insert into current_native_vectors select 'new_admin_'||case_id,admin_request,public.read_operations_scope_invoice_capture_admin_v1(admin_request)::text from current_native_requests;
reset role;
do $$begin
 if (select count(*) from current_native_vectors)<>8
 or (select data from current_native_before) is distinct from operations_scope_compatible_read_native.state_sha256()
 then raise exception 'refresh_public_read_wrote_canonical_state' using errcode='22023';end if;
end;$$;
select jsonb_agg(jsonb_build_object('label',label,'request',request,'evidence',evidence) order by label) from current_native_vectors;
rollback;
