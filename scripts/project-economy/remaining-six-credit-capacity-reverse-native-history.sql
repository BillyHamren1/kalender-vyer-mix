-- NEW TEST ONLY immutable-history evidence; no source or cost writer.
begin;set local time zone 'UTC';set local datestyle='ISO, YMD';
do $$begin
 if current_database() not in ('eventflow_own_credit_reverse_remaining_six','eventflow_own_credit_capacity_reverse_remaining_six')
 or current_setting('test.remaining_six_credit_cap_reverse_isolated',true) is distinct from 'synthetic-disposable'
 then raise exception 'credit_cap_reverse_history_isolated_required' using errcode='42501';end if;
end$$;
with rows as materialized (
select 'public.operations_project_obligation_source_ownership'::text table_name,organization_id::text||':'||source_anchor row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_project_obligation_source_ownership'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_project_obligation_source_ownership limit 1001)t
union all
select 'public.operations_project_obligation_baselines'::text table_name,event_id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_project_obligation_baselines'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_project_obligation_baselines limit 1001)t
union all
select 'public.operations_project_obligation_invoice_bindings'::text table_name,event_id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_project_obligation_invoice_bindings'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_project_obligation_invoice_bindings limit 1001)t
union all
select 'public.operations_obligation_credit_assignments'::text table_name,event_id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_obligation_credit_assignments'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_obligation_credit_assignments limit 1001)t
union all
select 'public.operations_obligation_credit_capacity_events'::text table_name,event_id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_obligation_credit_capacity_events'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_obligation_credit_capacity_events limit 1001)t
union all
select 'public.operations_finance_invoice_snapshots'::text table_name,id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_finance_invoice_snapshots'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_finance_invoice_snapshots limit 1001)t
union all
select 'public.operations_finance_credit_v2_snapshots'::text table_name,id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_finance_credit_v2_snapshots'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_finance_credit_v2_snapshots limit 1001)t
union all
select 'public.operations_finance_invoice_receipts'::text table_name,id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_finance_invoice_receipts'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_finance_invoice_receipts limit 1001)t
union all
select 'public.operations_finance_credit_v2_receipts'::text table_name,id::text row_key,octet_length(to_jsonb(t)::text) bytes,encode(sha256(convert_to('remaining-six-credit-capacity-reverse-history.v1'||E'\n'||'public.operations_finance_credit_v2_receipts'||E'\n'||to_jsonb(t)::text,'UTF8')),'hex') fingerprint from (select * from public.operations_finance_credit_v2_receipts limit 1001)t
),caps as (select table_name,count(*) n,coalesce(max(bytes),0) maxbytes from rows group by table_name)
select case when coalesce((select bool_and(n<=1000 and maxbytes<=262144) from caps),true)
 and coalesce((select sum(bytes) from rows),0)<=8388608
 then jsonb_build_object('schema','remaining-six-credit-capacity-reverse-history.v1','rows',coalesce(jsonb_agg(jsonb_build_object('table',table_name,'key',row_key,'fingerprint',fingerprint) order by table_name collate "C",row_key collate "C"),'[]'::jsonb)) else null end from rows;
rollback;
