\set ON_ERROR_STOP on
-- DISPOSABLE UI bootstrap ONLY, never a product migration.
-- Columns audited from actual generated schema blob 521b6de161276af85e0181cc2e0e109c1cdd8c3e.
-- Core operations RPCs/readers are unchanged genuine canonical migrations.
do $$begin
 if current_database()<>'eventflow_project_evidence_http_runtime'
 or current_setting('test.project_evidence_fixture',true) is distinct from 'true'
 then raise exception 'isolated_mounted_browser_required' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
 or not exists(select 1 from public.user_roles where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001' and role='admin')
 or exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000001017')
 then raise exception 'fresh_browser_namespace_and_live_actor_required' using errcode='55000';end if;
 if exists(select 1 from information_schema.tables where table_schema='public' and table_name in('project_budget','project_purchases','project_labor_costs','project_staff_time_cost_lines','product_cost_overrides','project_billing','project_tasks','project_files','project_activity_log'))
 then raise exception 'fresh_ui_tables_required' using errcode='55000';end if;
end;$$;
begin;
alter table public.projects add column address_geofence_mode text;
alter table public.projects add column address_geofence_polygon jsonb;
alter table public.projects add column address_radius_meters numeric;
alter table public.projects add column client text;
alter table public.projects add column contact_email text;
alter table public.projects add column contact_name text;
alter table public.projects add column contact_phone text;
alter table public.projects add column created_at timestamptz;
alter table public.projects add column customer_pickup boolean;
alter table public.projects add column delivery_city text;
alter table public.projects add column delivery_latitude numeric;
alter table public.projects add column delivery_longitude numeric;
alter table public.projects add column delivery_postal_code text;
alter table public.projects add column deliveryaddress text;
alter table public.projects add column description text;
alter table public.projects add column event_end_time text;
alter table public.projects add column event_start_time text;
alter table public.projects add column eventdate text;
alter table public.projects add column internalnotes text;
alter table public.projects add column is_internal boolean;
alter table public.projects add column location_id uuid;
alter table public.projects add column name text;
alter table public.projects add column planning_status text;
alter table public.projects add column project_leader text;
alter table public.projects add column rig_end_time text;
alter table public.projects add column rig_start_time text;
alter table public.projects add column rigdaydate text;
alter table public.projects add column rigdown_end_time text;
alter table public.projects add column rigdown_start_time text;
alter table public.projects add column rigdowndate text;
alter table public.projects add column status text;
alter table public.projects add column updated_at timestamptz;
alter table public.bookings add column assigned_project_id uuid;
alter table public.bookings add column assigned_project_name text;
alter table public.bookings add column assigned_to_project boolean;
alter table public.bookings add column booking_number text;
alter table public.bookings add column calendar_color text;
alter table public.bookings add column carry_more_than_10m boolean;
alter table public.bookings add column client text;
alter table public.bookings add column contact_email text;
alter table public.bookings add column contact_name text;
alter table public.bookings add column contact_phone text;
alter table public.bookings add column created_at timestamptz;
alter table public.bookings add column customer_pickup boolean;
alter table public.bookings add column delivery_city text;
alter table public.bookings add column delivery_latitude numeric;
alter table public.bookings add column delivery_longitude numeric;
alter table public.bookings add column delivery_postal_code text;
alter table public.bookings add column deliveryaddress text;
alter table public.bookings add column economics_data jsonb;
alter table public.bookings add column event_end_time text;
alter table public.bookings add column event_end_time_external text;
alter table public.bookings add column event_start_time text;
alter table public.bookings add column event_start_time_external text;
alter table public.bookings add column event_time_locked boolean;
alter table public.bookings add column eventdate text;
alter table public.bookings add column exact_time_info text;
alter table public.bookings add column exact_time_needed boolean;
alter table public.bookings add column ground_nails_allowed boolean;
alter table public.bookings add column internal_type text;
alter table public.bookings add column internalnotes text;
alter table public.bookings add column is_internal boolean;
alter table public.bookings add column last_applied_source_revision jsonb;
alter table public.bookings add column last_calendar_sync text;
alter table public.bookings add column map_drawing_url text;
alter table public.bookings add column needs_review boolean;
alter table public.bookings add column needs_review_reason text;
alter table public.bookings add column rental_only boolean;
alter table public.bookings add column rig_end_time text;
alter table public.bookings add column rig_end_time_external text;
alter table public.bookings add column rig_start_time text;
alter table public.bookings add column rig_start_time_external text;
alter table public.bookings add column rig_time_locked boolean;
alter table public.bookings add column rigdaydate text;
alter table public.bookings add column rigdown_end_time text;
alter table public.bookings add column rigdown_end_time_external text;
alter table public.bookings add column rigdown_start_time text;
alter table public.bookings add column rigdown_start_time_external text;
alter table public.bookings add column rigdown_time_locked boolean;
alter table public.bookings add column rigdowndate text;
alter table public.bookings add column status text;
alter table public.bookings add column title text;
alter table public.bookings add column updated_at timestamptz;
alter table public.bookings add column version numeric;
alter table public.bookings add column viewed boolean;
alter table public.projects add constraint projects_booking_id_fkey foreign key(booking_id) references public.bookings(id);
create table public.project_budget(
 budgeted_hours numeric,
 created_at timestamptz,
 description text,
 hourly_rate numeric,
 id uuid primary key,
 organization_id uuid,
 project_id uuid,
 updated_at timestamptz
);
create table public.project_purchases(
 amount numeric,
 approved boolean,
 approved_at timestamptz,
 approved_by uuid,
 category text,
 created_at timestamptz,
 created_by uuid,
 description text,
 id uuid primary key,
 organization_id uuid,
 project_id uuid,
 purchase_date text,
 receipt_url text,
 supplier text
);
create table public.project_labor_costs(
 created_at timestamptz,
 created_by uuid,
 description text,
 hourly_rate numeric,
 hours numeric,
 id uuid primary key,
 organization_id uuid,
 project_id uuid,
 staff_id uuid,
 staff_name text,
 work_date text
);
create table public.project_staff_time_cost_lines(
 assignment_id uuid,
 booking_id uuid,
 cost numeric,
 created_at timestamptz,
 date text,
 end_at timestamptz,
 hourly_rate numeric,
 hours numeric,
 id uuid primary key,
 large_project_id uuid,
 location_id uuid,
 minutes numeric,
 organization_id uuid,
 project_id uuid,
 rate_source text,
 source_block_id uuid,
 source_block_kind text,
 source_label text,
 staff_day_submission_id uuid,
 staff_id uuid,
 staff_name text,
 start_at timestamptz,
 submission_status text,
 updated_at timestamptz
);
create table public.product_cost_overrides(
 assembly_cost numeric,
 booking_id uuid,
 handling_cost numeric,
 id uuid primary key,
 organization_id uuid,
 product_id uuid,
 project_id uuid,
 purchase_cost numeric,
 updated_at timestamptz
);
create table public.project_billing(
 approved_by uuid,
 approved_for_invoicing_at timestamptz,
 billing_status text,
 booking_id uuid,
 client_name text,
 closed_at timestamptz,
 created_at timestamptz,
 delivery_date text,
 due_date text,
 event_date text,
 external_invoice_id uuid,
 id uuid primary key,
 internal_notes text,
 invoice_date text,
 invoice_number text,
 invoice_paid_at timestamptz,
 invoice_reference text,
 invoice_sent_at timestamptz,
 invoiceable_amount numeric,
 invoiced_amount numeric,
 organization_id uuid,
 project_id uuid,
 project_leader text,
 project_name text,
 project_type text,
 quoted_amount numeric,
 review_checklist jsonb,
 review_completed_at timestamptz,
 review_status text,
 total_cost numeric,
 updated_at timestamptz
);
create table public.project_tasks(
 assigned_to text,
 assigned_to_ids text[],
 category text,
 completed boolean,
 created_at timestamptz,
 created_by uuid,
 deadline text,
 dependency_task_id uuid,
 description text,
 end_date text,
 execution_task_id uuid,
 id uuid primary key,
 is_info_only boolean,
 organization_id uuid,
 phase text,
 project_id uuid,
 sort_order numeric,
 start_date text,
 title text,
 updated_at timestamptz
);
create table public.project_files(
 file_name text,
 file_type text,
 id uuid primary key,
 organization_id uuid,
 project_id uuid,
 uploaded_at timestamptz,
 uploaded_by uuid,
 url text
);
create table public.project_activity_log(
 action text,
 created_at timestamptz,
 description text,
 id uuid primary key,
 metadata jsonb,
 organization_id uuid,
 performed_by uuid,
 project_id uuid
);
-- Only actor-own identity and exact live project tenant can be read over signed JWT.
alter table public.profiles enable row level security;
create policy mounted_browser_self_profile on public.profiles for select to authenticated using(user_id=auth.uid());
alter table public.user_roles enable row level security;
create policy mounted_browser_self_roles on public.user_roles for select to authenticated using(user_id=auth.uid() and organization_id=(select organization_id from public.profiles where user_id=auth.uid()));
alter table public.projects enable row level security;
create policy mounted_browser_tenant_read on public.projects for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and deleted_at is null);
alter table public.bookings enable row level security;
create policy mounted_browser_tenant_read on public.bookings for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')));
alter table public.large_projects enable row level security;
create policy mounted_browser_tenant_read on public.large_projects for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and deleted_at is null);
alter table public.project_budget enable row level security;
create policy mounted_browser_tenant_read on public.project_budget for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_budget.project_id and p.organization_id=project_budget.organization_id and p.deleted_at is null));
alter table public.project_purchases enable row level security;
create policy mounted_browser_tenant_read on public.project_purchases for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_purchases.project_id and p.organization_id=project_purchases.organization_id and p.deleted_at is null));
alter table public.project_labor_costs enable row level security;
create policy mounted_browser_tenant_read on public.project_labor_costs for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_labor_costs.project_id and p.organization_id=project_labor_costs.organization_id and p.deleted_at is null));
alter table public.project_staff_time_cost_lines enable row level security;
create policy mounted_browser_tenant_read on public.project_staff_time_cost_lines for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_staff_time_cost_lines.project_id and p.organization_id=project_staff_time_cost_lines.organization_id and p.deleted_at is null));
alter table public.product_cost_overrides enable row level security;
create policy mounted_browser_tenant_read on public.product_cost_overrides for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=product_cost_overrides.project_id and p.organization_id=product_cost_overrides.organization_id and p.deleted_at is null));
alter table public.project_billing enable row level security;
create policy mounted_browser_tenant_read on public.project_billing for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_billing.project_id and p.organization_id=project_billing.organization_id and p.deleted_at is null));
alter table public.project_tasks enable row level security;
create policy mounted_browser_tenant_read on public.project_tasks for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.organization_id=project_tasks.organization_id and p.deleted_at is null));
alter table public.project_files enable row level security;
create policy mounted_browser_tenant_read on public.project_files for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_files.project_id and p.organization_id=project_files.organization_id and p.deleted_at is null));
alter table public.project_activity_log enable row level security;
create policy mounted_browser_tenant_read on public.project_activity_log for select to authenticated using(organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.organization_id=(select organization_id from public.profiles where user_id=auth.uid()) and r.role in ('admin','projekt','lager')) and exists(select 1 from public.projects p where p.id=project_activity_log.project_id and p.organization_id=project_activity_log.organization_id and p.deleted_at is null));
grant select on public.profiles,public.user_roles,public.projects,public.bookings,public.large_projects,public.project_budget,public.project_purchases,public.project_labor_costs,public.project_staff_time_cost_lines,public.product_cost_overrides,public.project_billing,public.project_tasks,public.project_files,public.project_activity_log to authenticated;
-- No browser write grant, no service credential in the browser.
insert into public.projects(id,organization_id,booking_id,name,status,created_at,updated_at,is_internal,customer_pickup)
 values('00000000-0000-4000-8000-000000001017','00000000-0000-4000-8000-000000000001',null,'Isolerad ekonomiverifiering','in_progress',now(),now(),true,false);
-- A genuine saved legacy purchase is independent of this unpublished shadow invoice.
insert into public.project_purchases(id,organization_id,project_id,amount,description,approved,created_at)
 values('00000000-0000-4000-8000-000000001030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001017',700,'Isolerat sparat inköp',true,now());
create temporary table mounted_browser_fixture(data jsonb not null);
insert into mounted_browser_fixture values(:'fixture'::jsonb);
grant select on mounted_browser_fixture to authenticated,service_role;
create temporary table mounted_browser_selectors(data jsonb not null);
insert into public.operations_finance_invoice_enrollments values('fixture_mounted_browser','99999999-9999-4999-8999-999999999999','00000000-0000-4000-8000-000000000001',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_mounted_browser','00000000-0000-4000-8000-000000001016','00000000-0000-4000-8000-000000001017',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',true);
do $$declare f jsonb;invoice jsonb;r jsonb;baseline jsonb;binding jsonb;preview jsonb;compose jsonb;snapshot uuid;event uuid;unknown_event uuid;
 org uuid:='00000000-0000-4000-8000-000000000001';project uuid:='00000000-0000-4000-8000-000000001017';obligation uuid:='00000000-0000-4000-8000-000000001018';scope uuid:='00000000-0000-4000-8000-000000001021';
begin
 select data into f from mounted_browser_fixture;
 invoice:=(f->'invoice')||jsonb_build_object('invoice_id','00000000-0000-4000-8000-000000001020','destination_organization_id',org,'recipient_net_minor',180000,'allocations',jsonb_build_array((f#>'{invoice,allocations,0}')||jsonb_build_object(
 'allocation_id','00000000-0000-4000-8000-000000001015','project_id','00000000-0000-4000-8000-000000001016','cost_line_id','00000000-0000-4000-8000-000000001014','destination_organization_id',org,'destination_project_id',project,'amount_minor',180000)));
 execute 'set local role service_role';
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_mounted_browser',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_mounted_browser_source_nonce',invoice::text);
 if r->>'outcome' is distinct from 'accepted' then raise exception 'genuine_invoice_receive_required';end if;
 snapshot:=(r->>'snapshot_receipt_id')::uuid;
 execute 'reset role';execute 'set local role authenticated';
 preview:=public.preview_operations_project_scope_v1('project',project);
 perform public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id',scope,'root_kind','project','root_id',project,'expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint','idempotency_key','synthetic-mounted-browser-scope','reason','Enroll isolated local project before display'));
 baseline:=(f->'baseline')||jsonb_build_object('project_id',project,'obligation_id',obligation,'idempotency_key','synthetic-mounted-browser-baseline');r:=public.append_operations_manual_obligation_baseline_v1(baseline);event:=(r->>'event_id')::uuid;
 binding:=jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',project,'obligation_id',obligation,'expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id','00000000-0000-4000-8000-000000001015','expected_economic_revision',1,'expected_economic_fingerprint',invoice->>'source_publication_fingerprint','idempotency_key','synthetic-mounted-browser-binding','reason','Bind genuine isolated received evidence');
 perform public.bind_operations_invoice_obligation_v1(binding);
 r:=public.append_operations_manual_obligation_baseline_v1(baseline||jsonb_build_object('obligation_id','00000000-0000-4000-8000-000000001028','estimate_minor',null,'committed_minor',null,'idempotency_key','synthetic-mounted-browser-unknown-baseline'));
 unknown_event:=(r->>'event_id')::uuid;
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope,'expected_scope_revision',1,'expected_membership_fingerprint',preview->>'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(event,unknown_event),'idempotency_key','synthetic-mounted-browser-compose','reason','Capture actual partial manual source evidence');
 perform public.compose_operations_scope_obligations_v1(compose);
 r:=public.read_operations_scope_obligation_evidence_v1(org,'project',project);
 execute 'reset role';
 insert into mounted_browser_selectors values(jsonb_build_object('schema','operations-obligation-mounted-browser-selectors.v1','organizationId',org,'actorId','00000000-0000-4000-8000-000000000199','projectId',project,'compositionSnapshotId',r->>'snapshotId','baselineEventId',event,'obligationId',obligation,'unknownBaselineEventId',unknown_event,'unknownObligationId','00000000-0000-4000-8000-000000001028','baselineRowIndex',(select ordinality from jsonb_array_elements(r->'baselines') with ordinality where value->>'baselineEventId'=event::text),'unknownBaselineRowIndex',(select ordinality from jsonb_array_elements(r->'baselines') with ordinality where value->>'baselineEventId'=unknown_event::text)));
 execute 'reset role';execute 'set local role service_role';update public.operations_finance_invoice_enrollments set enabled=false where key_id='fixture_mounted_browser';execute 'reset role';
end;$$;
commit;
select 'MOUNTED_BROWSER_SELECTORS='||data::text as result from mounted_browser_selectors;
select 'operations-obligation-mounted-browser-bootstrap SETUP PASS' as result;

