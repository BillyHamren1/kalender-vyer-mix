-- TEST ONLY: separate fourth-mode state purpose; old COST47 proof remains unchanged.
-- Exact named disposable database, full 48-table rows, one financial MVCC SELECT.
-- No caller SQL, source writes, public RPC or reader-readiness authority.
begin;
set local statement_timeout='3s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='5s';
set local time zone 'UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
do $$begin 
if current_database()<>'eventflow_project_evidence_http_runtime' then raise exception 'wrong_isolated_database' using errcode='42501';end if;
if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
or not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000199' and organization_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099'))
or not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000000117' and organization_id='00000000-0000-4000-8000-000000000001')
or not exists(select 1 from public.operations_project_scope_packing_policies where organization_id='00000000-0000-4000-8000-000000000001' and status='drilldown_ready')
then raise exception 'exact_drilldown_fixture_required' using errcode='55000';end if;
if not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000001017' and organization_id='00000000-0000-4000-8000-000000000001' and booking_id is null)
or not exists(select 1 from public.project_purchases where id='00000000-0000-4000-8000-000000001030' and organization_id='00000000-0000-4000-8000-000000000001' and project_id='00000000-0000-4000-8000-000000001017')
or not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000292')
or not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000292' and organization_id='00000000-0000-4000-8000-000000000001')
then raise exception 'exact_scope_invoice_mounted_fixture_required' using errcode='55000';end if;
 end;$$;
with tags(table_name) as (values
 ('operations_catering_cost_outbox'),
 ('operations_catering_cost_publications'),
 ('operations_catering_cost_streams'),
 ('operations_catering_project_mappings'),
 ('operations_catering_publish_gates'),
 ('operations_catering_source_bindings'),
 ('operations_catering_source_observations'),
 ('operations_finance_credit_v2_enrollments'),
 ('operations_finance_credit_v2_project_scopes'),
 ('operations_finance_credit_v2_receipts'),
 ('operations_finance_credit_v2_snapshots'),
 ('operations_finance_credit_v2_streams'),
 ('operations_finance_invoice_enrollments'),
 ('operations_finance_invoice_project_scopes'),
 ('operations_finance_invoice_receipts'),
 ('operations_finance_invoice_snapshots'),
 ('operations_finance_invoice_streams'),
 ('operations_invoice_obligation_kernel_read_gates'),
 ('operations_obligation_source_policies'),
 ('operations_obligation_source_policy_heads'),
 ('operations_personnel_cost_outbox'),
 ('operations_personnel_cost_publications'),
 ('operations_personnel_cost_streams'),
 ('operations_personnel_rate_history'),
 ('operations_personnel_source_bindings'),
 ('operations_personnel_target_bindings'),
 ('operations_personnel_transport_routes'),
 ('operations_project_obligation_baselines'),
 ('operations_project_obligation_heads'),
 ('operations_project_obligation_invoice_bindings'),
 ('operations_project_obligation_source_ownership'),
 ('operations_project_personnel_review_grants'),
 ('operations_project_personnel_reviews'),
 ('operations_project_scope_heads'),
 ('operations_project_scope_member_ownership'),
 ('operations_project_scope_packing_policies'),
 ('operations_project_scope_snapshots'),
 ('operations_scope_invoice_kernel_read_gates'),
 ('operations_scope_obligation_baseline_captures'),
 ('operations_scope_obligation_composition_heads'),
 ('operations_scope_obligation_compositions'),
 ('operations_scope_obligation_ownership'),
 ('product_cost_overrides'),
 ('project_billing'),
 ('project_budget'),
 ('project_labor_costs'),
 ('project_purchases'),
 ('project_staff_time_cost_lines')),
rows as materialized (
 select 'operations_catering_cost_outbox'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_cost_outbox'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_outbox limit 1001)t)j
 union all
 select 'operations_catering_cost_publications'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_cost_publications'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_publications limit 1001)t)j
 union all
 select 'operations_catering_cost_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_cost_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_cost_streams limit 1001)t)j
 union all
 select 'operations_catering_project_mappings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_project_mappings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_project_mappings limit 1001)t)j
 union all
 select 'operations_catering_publish_gates'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_publish_gates'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_publish_gates limit 1001)t)j
 union all
 select 'operations_catering_source_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_source_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_source_bindings limit 1001)t)j
 union all
 select 'operations_catering_source_observations'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_catering_source_observations'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_catering_source_observations limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_enrollments'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_enrollments'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_enrollments limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_project_scopes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_project_scopes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_project_scopes limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_receipts'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_receipts'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_receipts limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_snapshots limit 1001)t)j
 union all
 select 'operations_finance_credit_v2_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_credit_v2_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_credit_v2_streams limit 1001)t)j
 union all
 select 'operations_finance_invoice_enrollments'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_invoice_enrollments'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_enrollments limit 1001)t)j
 union all
 select 'operations_finance_invoice_project_scopes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_invoice_project_scopes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_project_scopes limit 1001)t)j
 union all
 select 'operations_finance_invoice_receipts'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_invoice_receipts'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_receipts limit 1001)t)j
 union all
 select 'operations_finance_invoice_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_invoice_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_snapshots limit 1001)t)j
 union all
 select 'operations_finance_invoice_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_finance_invoice_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_finance_invoice_streams limit 1001)t)j
 union all
 select 'operations_invoice_obligation_kernel_read_gates'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_invoice_obligation_kernel_read_gates'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_invoice_obligation_kernel_read_gates limit 1001)t)j
 union all
 select 'operations_obligation_source_policies'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_obligation_source_policies'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_obligation_source_policies limit 1001)t)j
 union all
 select 'operations_obligation_source_policy_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_obligation_source_policy_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_obligation_source_policy_heads limit 1001)t)j
 union all
 select 'operations_personnel_cost_outbox'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_cost_outbox'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_outbox limit 1001)t)j
 union all
 select 'operations_personnel_cost_publications'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_cost_publications'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_publications limit 1001)t)j
 union all
 select 'operations_personnel_cost_streams'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_cost_streams'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_cost_streams limit 1001)t)j
 union all
 select 'operations_personnel_rate_history'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_rate_history'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_rate_history limit 1001)t)j
 union all
 select 'operations_personnel_source_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_source_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_source_bindings limit 1001)t)j
 union all
 select 'operations_personnel_target_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_target_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_target_bindings limit 1001)t)j
 union all
 select 'operations_personnel_transport_routes'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_personnel_transport_routes'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_personnel_transport_routes limit 1001)t)j
 union all
 select 'operations_project_obligation_baselines'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_obligation_baselines'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_baselines limit 1001)t)j
 union all
 select 'operations_project_obligation_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_obligation_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_heads limit 1001)t)j
 union all
 select 'operations_project_obligation_invoice_bindings'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_obligation_invoice_bindings'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_invoice_bindings limit 1001)t)j
 union all
 select 'operations_project_obligation_source_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_obligation_source_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_obligation_source_ownership limit 1001)t)j
 union all
 select 'operations_project_personnel_review_grants'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_personnel_review_grants'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_personnel_review_grants limit 1001)t)j
 union all
 select 'operations_project_personnel_reviews'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_personnel_reviews'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_personnel_reviews limit 1001)t)j
 union all
 select 'operations_project_scope_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_scope_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_heads limit 1001)t)j
 union all
 select 'operations_project_scope_member_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_scope_member_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_member_ownership limit 1001)t)j
 union all
 select 'operations_project_scope_packing_policies'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_scope_packing_policies'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_packing_policies limit 1001)t)j
 union all
 select 'operations_project_scope_snapshots'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_project_scope_snapshots'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_project_scope_snapshots limit 1001)t)j
 union all
 select 'operations_scope_invoice_kernel_read_gates'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_scope_invoice_kernel_read_gates'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_invoice_kernel_read_gates limit 1001)t)j
 union all
 select 'operations_scope_obligation_baseline_captures'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_scope_obligation_baseline_captures'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_baseline_captures limit 1001)t)j
 union all
 select 'operations_scope_obligation_composition_heads'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_scope_obligation_composition_heads'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_composition_heads limit 1001)t)j
 union all
 select 'operations_scope_obligation_compositions'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_scope_obligation_compositions'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_compositions limit 1001)t)j
 union all
 select 'operations_scope_obligation_ownership'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'operations_scope_obligation_ownership'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.operations_scope_obligation_ownership limit 1001)t)j
 union all
 select 'product_cost_overrides'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'product_cost_overrides'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.product_cost_overrides limit 1001)t)j
 union all
 select 'project_billing'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'project_billing'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_billing limit 1001)t)j
 union all
 select 'project_budget'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'project_budget'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_budget limit 1001)t)j
 union all
 select 'project_labor_costs'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'project_labor_costs'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_labor_costs limit 1001)t)j
 union all
 select 'project_purchases'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'project_purchases'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_purchases limit 1001)t)j
 union all
 select 'project_staff_time_cost_lines'::text table_name, octet_length(j.row_json)::bigint row_bytes,
 encode(sha256(convert_to('operations-scope-invoice-mounted-row.v1'||E'\n'||'project_staff_time_cost_lines'||E'\n'||j.row_json,'UTF8')),'hex') row_sha
 from (select to_jsonb(t)::text row_json from (select * from public.project_staff_time_cost_lines limit 1001)t)j
), summary as materialized (
 select tags.table_name, count(rows.row_sha)::bigint n,
 coalesce(sum(rows.row_bytes),0)::bigint serialized_bytes,
 coalesce(max(rows.row_bytes),0)::bigint largest_row,
 encode(sha256(convert_to('operations-scope-invoice-mounted-table.v1'||E'\n'||tags.table_name||E'\n'||count(rows.row_sha)::text||E'\n'||
 coalesce(string_agg(rows.row_sha,E'\n' order by rows.row_sha collate "C"),''),'UTF8')),'hex') fp
 from tags left join rows using(table_name) group by tags.table_name
), limits as (
 select bool_and(n<=1000 and largest_row<=2097152) and sum(serialized_bytes)<=16777216 allowed from summary
), fingerprints as (
 select jsonb_object_agg(table_name,fp order by table_name collate "C") value from summary
), pairs as (
 select '['||string_agg('['||to_json(table_name)::text||','||to_json(fp)::text||']',',' order by table_name collate "C")||']' bytes from summary
), state as (
 select jsonb_build_object(
 'schema','operations-scope-invoice-mounted-state.v1',
 'databaseName',current_database(),
 'cateringPublications',(select n from summary where table_name='operations_catering_cost_publications'),
 'cateringObservations',(select n from summary where table_name='operations_catering_source_observations'),
 'cateringOutbox',(select n from summary where table_name='operations_catering_cost_outbox'),
 'invoiceSnapshots',(select n from summary where table_name='operations_finance_invoice_snapshots'),
 'baselines',(select n from summary where table_name='operations_project_obligation_baselines'),
 'bindings',(select n from summary where table_name='operations_project_obligation_invoice_bindings'),
 'sourcePolicies',(select n from summary where table_name='operations_obligation_source_policies'),
 'compositions',(select n from summary where table_name='operations_scope_obligation_compositions'),
 'personnelPublications',(select n from summary where table_name='operations_personnel_cost_publications'),
 'personnelStreams',(select n from summary where table_name='operations_personnel_cost_streams'),
 'personnelOutbox',(select n from summary where table_name='operations_personnel_cost_outbox'),
 'personnelReviews',(select n from summary where table_name='operations_project_personnel_reviews'),
 'reviewGrants',(select n from summary where table_name='operations_project_personnel_review_grants'),
 'scopeInvoiceReadGates',(select n from summary where table_name='operations_scope_invoice_kernel_read_gates'),
 'legacyPurchasesFingerprint',(select fp from summary where table_name='project_purchases'),
 'tableFingerprints',(select value from fingerprints)) document
), proof as (
 select document,
 '['||to_json('operations-scope-invoice-mounted-state-proof.v1'::text)::text||','||
 to_json(document->>'schema')::text||','||to_json(document->>'databaseName')::text||',['||
 concat_ws(',',document->>'cateringPublications',document->>'cateringObservations',document->>'cateringOutbox',
 document->>'invoiceSnapshots',document->>'baselines',document->>'bindings',document->>'sourcePolicies',
 document->>'compositions',document->>'personnelPublications',document->>'personnelStreams',
 document->>'personnelOutbox',document->>'personnelReviews',document->>'reviewGrants',document->>'scopeInvoiceReadGates')||'],'||
 (select bytes from pairs)||','||to_json(document->>'legacyPurchasesFingerprint')::text||']' preimage
 from state
)
select case when (select allowed from limits) then
 (document||jsonb_build_object('stateFingerprint',encode(sha256(convert_to(preimage,'UTF8')),'hex')))::text
 else null end from proof;
commit;
