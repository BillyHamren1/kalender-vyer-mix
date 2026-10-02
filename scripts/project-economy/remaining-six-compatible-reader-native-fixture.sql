\set ON_ERROR_STOP on
-- NEW disposable native fixture. Derived genuine receiver/enroll/baseline/bind/compose paths.
-- No prior HTTP control journey or UI/provider mock is installed. Seven captured roots.
-- Caller supplies output from the actual canonical operations-obligation-fixture.ts.
do $$begin
 if current_database()<>'operations_remaining_six_read_runtime' or current_setting('test.remaining_six_isolated',true) is distinct from 'synthetic-disposable' then raise exception 'isolated_drilldown_fixture_required' using errcode='42501';end if;
 if exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
 or exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000000117') then raise exception 'fresh_drilldown_namespace_required' using errcode='55000';end if;
end;$$;
begin;
create temporary table drilldown_http_fixture(data jsonb not null);
insert into drilldown_http_fixture values(:'fixture'::jsonb);
grant select on drilldown_http_fixture to authenticated,service_role;
create temporary table drilldown_http_selectors(data jsonb not null);
insert into auth.users values('00000000-0000-4000-8000-000000000199'),('00000000-0000-4000-8000-000000000292');
insert into public.profiles(user_id,organization_id) values
 ('00000000-0000-4000-8000-000000000199','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000292','00000000-0000-4000-8000-000000000001');
insert into public.user_roles(user_id,organization_id,role) values
 ('00000000-0000-4000-8000-000000000199','00000000-0000-4000-8000-000000000001','admin'),
 ('00000000-0000-4000-8000-000000000292','00000000-0000-4000-8000-000000000001','projekt');
insert into public.bookings(id,organization_id) select 'drilldown-local-booking-'||n,'00000000-0000-4000-8000-000000000001' from unnest(array[1,2,3,4,5,6,10]) n;
insert into public.projects(id,organization_id,deleted_at,booking_id) select
 ('00000000-0000-4000-8000-'||lpad((n*100+17)::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001',null,'drilldown-local-booking-'||n from unnest(array[1,2,3,4,5,6,10]) n;
insert into public.large_projects(id,organization_id,primary_booking_id,deleted_at) values('00000000-0000-4000-8000-000000000219','00000000-0000-4000-8000-000000000001','drilldown-local-booking-2',null);
insert into public.large_project_bookings(id,organization_id,large_project_id,booking_id) values('00000000-0000-4000-8000-000000000220','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000219','drilldown-local-booking-2');
insert into public.packing_projects(id,organization_id,booking_id,large_project_id,status) values('00000000-0000-4000-8000-000000000319','00000000-0000-4000-8000-000000000001','drilldown-local-booking-3',null,'drilldown_ready');
insert into public.packing_project_bookings(id,organization_id,packing_id,booking_id) values('00000000-0000-4000-8000-000000000320','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000319','drilldown-local-booking-3');
insert into public.operations_project_scope_packing_policies values('00000000-0000-4000-8000-000000000001','drilldown_ready',true);
insert into public.operations_finance_invoice_enrollments values('fixture_drilldown_http','99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-000000000001',true,now());
insert into public.operations_finance_invoice_project_scopes select 'fixture_drilldown_http',
 ('00000000-0000-4000-8000-'||lpad((n*100+16)::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad((n*100+17)::text,12,'0'))::uuid,true from unnest(array[1,2,3,4,10]) n;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',true);
do $$declare f jsonb;invoice jsonb;allocations jsonb:='[]';r jsonb;baseline jsonb;binding jsonb;compose jsonb;preview jsonb;request jsonb;selectors jsonb:='{}';event uuid;snapshot uuid;project uuid;obligation uuid;root uuid;scope uuid;kind text;label text;n integer;org uuid:='00000000-0000-4000-8000-000000000001';begin
 select data into f from drilldown_http_fixture;
 foreach n in array array[1,2,3,4,10] loop
 allocations:=allocations||jsonb_build_array((f#>'{invoice,allocations,0}')||jsonb_build_object('allocation_id',('00000000-0000-4000-8000-'||lpad((n*100+15)::text,12,'0'))::uuid,
 'project_id',('00000000-0000-4000-8000-'||lpad((n*100+16)::text,12,'0'))::uuid,'cost_line_id',('00000000-0000-4000-8000-'||lpad((n*100+14)::text,12,'0'))::uuid,'destination_organization_id',org,
 'destination_project_id',('00000000-0000-4000-8000-'||lpad((n*100+17)::text,12,'0'))::uuid,'amount_minor',180000));
 end loop;
 invoice:=(f->'invoice')||jsonb_build_object('invoice_id','00000000-0000-4000-8000-000000000120','destination_organization_id',org,'recipient_net_minor',900000,'allocations',allocations);
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_drilldown_http',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_drilldown_http_source_nonce',invoice::text);snapshot:=(r->>'snapshot_receipt_id')::uuid;execute 'reset role';
 foreach n in array array[1,2,3,4,5,6,10] loop
 project:=('00000000-0000-4000-8000-'||lpad((n*100+17)::text,12,'0'))::uuid;
 obligation:=('00000000-0000-4000-8000-'||lpad((n*100+18)::text,12,'0'))::uuid;
 scope:=('00000000-0000-4000-8000-'||lpad((n*100+21)::text,12,'0'))::uuid;
 kind:=case when n=2 then 'large_project' when n=3 then 'packing_project' else 'project' end;
 root:=case when n in(2,3) then ('00000000-0000-4000-8000-'||lpad((n*100+19)::text,12,'0'))::uuid else project end;
 label:=case n when 1 then 'project' when 2 then 'large' when 3 then 'packing' when 4 then 'baselineChanged' when 5 then 'superseded' else 'membershipChanged' end;
 execute 'set local role authenticated';preview:=public.preview_operations_project_scope_v1(kind,root);
 perform public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id',scope,'root_kind',kind,'root_id',root,'expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint','idempotency_key','synthetic-drilldown-http-scope-'||n,'reason','Enroll actual isolated root'));
 baseline:=(f->'baseline')||jsonb_build_object('project_id',project,'obligation_id',obligation,'idempotency_key','synthetic-drilldown-http-baseline-'||n);r:=public.append_operations_manual_obligation_baseline_v1(baseline);event:=(r->>'event_id')::uuid;
 if n<=4 or n=10 then
 binding:=jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',project,'obligation_id',obligation,'expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id',('00000000-0000-4000-8000-'||lpad((n*100+15)::text,12,'0'))::uuid,'expected_economic_revision',1,'expected_economic_fingerprint',invoice->>'source_publication_fingerprint','idempotency_key','synthetic-drilldown-http-binding-'||n,'reason','Bind actual received selected allocation');r:=public.bind_operations_invoice_obligation_v1(binding);
 if n=1 then r:=public.append_operations_obligation_source_policy_v1(jsonb_build_object('schema_version','operations-obligation-source-policy.v1','project_id',project,'obligation_id',obligation,'baseline_event_id',event,'binding_event_id',r->>'event_id','expected_policy_revision',0,'replaces_estimate_minor',180000,'consumes_commitment_minor',null,'idempotency_key','synthetic-six-native-policy','reason','Explicit isolated policy, commitment remains unknown'));if r->>'outcome'<>'accepted' then raise exception 'actual_source_policy_owner_required';end if;end if;
 end if;
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope,'expected_scope_revision',1,'expected_membership_fingerprint',preview->>'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(event),'idempotency_key','synthetic-drilldown-http-compose-'||n,'reason','Capture actual partial manual evidence');perform public.compose_operations_scope_obligations_v1(compose);
 r:=public.read_operations_scope_obligation_evidence_v1(org,kind,root);
 request:=jsonb_build_object('schema_version','operations-scope-obligation-drilldown-read.v1','root_kind',kind,'root_id',root,'obligation_id',obligation,'expected_composition_snapshot_id',r->>'snapshotId','expected_baseline_event_id',event);
 selectors:=selectors||jsonb_build_object(label,request);
 if n=4 then perform public.append_operations_manual_obligation_baseline_v1(baseline||jsonb_build_object('expected_revision',1,'estimate_minor',2000000,'idempotency_key','synthetic-drilldown-http-baseline-changed'));end if;
 if n=5 then perform public.compose_operations_scope_obligations_v1(compose||jsonb_build_object('expected_composition_revision',1,'idempotency_key','synthetic-drilldown-http-compose-replaced'));end if;
 execute 'reset role';
 end loop;
 -- Real source graph changes after capture, not a fake stale marker.
 insert into public.projects(id,organization_id,booking_id) values('00000000-0000-4000-8000-000000000622',org,'drilldown-local-booking-6');
 execute 'set local role authenticated';r:=public.grant_operations_project_personnel_review_v1('00000000-0000-4000-8000-000000000117','00000000-0000-4000-8000-000000000292',0,'granted','Synthetic project review grant is not scope administration','synthetic-drilldown-http-review-grant');
 if r->>'status' is distinct from 'accepted' then raise exception 'actual_project_grant_required';end if;
 -- Default-off means actual denied read before isolated gate enrollment.
 begin perform public.read_operations_scope_obligation_drilldown_v1(selectors->'project');raise exception 'disabled read gate allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';insert into public.operations_invoice_obligation_kernel_read_gates(organization_id,enabled) values(org,true) on conflict(organization_id) do update set enabled=true;
 insert into drilldown_http_selectors values(jsonb_build_object('schema','operations-obligation-drilldown-http-selectors.v1','organizationId',org,'actorId','00000000-0000-4000-8000-000000000199','requests',selectors));
 execute 'set local role service_role';update public.operations_finance_invoice_enrollments set enabled=false where key_id='fixture_drilldown_http';execute 'reset role';
end;$$;
commit;
-- IDs only: actual capture receipts needed by signed HTTP selectors. No amount, person/rate/raw/token.
-- Selectors stay private: matrix derives fixed saved selectors directly from actual tables.
select 'remaining-six-native-fixture PASS genuine_invoice_baseline_binding_composition_three_root_kinds' as result;
