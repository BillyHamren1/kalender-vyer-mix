-- Isolated shadow Operations forecast contract. No legacy reader, Finance
-- transport, source mapper or release activation. Every row names this gate.
create table public.operations_project_forecast_streams (
 organization_id uuid not null,project_id uuid not null,currency text not null check(currency~'^[A-Z]{3}$'),
 current_revision bigint not null default 0 check(current_revision between 0 and 9007199254740991),
 primary key(organization_id,project_id,currency)
);
create table public.operations_project_forecast_publications (
 organization_id uuid not null,project_id uuid not null,currency text not null,source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 input_snapshot jsonb not null,raw_input text not null,result_snapshot jsonb not null,input_fingerprint text not null,
 raw_body text not null,body_sha256 text not null,idempotency_key text not null,
 integration_state text not null default 'isolated_contract' check(integration_state='isolated_contract'),
 created_at timestamptz not null default now(),primary key(organization_id,project_id,currency,source_revision),unique(organization_id,idempotency_key),
 foreign key(organization_id,project_id,currency) references public.operations_project_forecast_streams(organization_id,project_id,currency)
);
create table public.operations_project_forecast_source_links (
 organization_id uuid not null,project_id uuid not null,currency text not null,source_revision bigint not null,
 obligation_id uuid not null,category text not null,baseline_revision bigint not null,baseline_fingerprint text not null,
 source_id text not null,source_system text not null,source_stream_id text not null,source_publication_revision bigint not null,source_fingerprint text not null,
 source_snapshot jsonb not null,primary key(organization_id,project_id,currency,source_revision,source_id),
 foreign key(organization_id,project_id,currency,source_revision) references public.operations_project_forecast_publications(organization_id,project_id,currency,source_revision)
);
create table public.operations_project_forecast_booking_captures (
 organization_id uuid not null,project_id uuid not null,currency text not null,source_revision bigint not null,
 source_booking_id uuid not null,booking_snapshot jsonb not null,primary key(organization_id,project_id,currency,source_revision,source_booking_id),
 foreign key(organization_id,project_id,currency,source_revision) references public.operations_project_forecast_publications(organization_id,project_id,currency,source_revision)
);
alter table public.operations_project_forecast_streams enable row level security;
alter table public.operations_project_forecast_publications enable row level security;
alter table public.operations_project_forecast_source_links enable row level security;
alter table public.operations_project_forecast_booking_captures enable row level security;
revoke all on public.operations_project_forecast_streams,public.operations_project_forecast_publications,public.operations_project_forecast_source_links,
 public.operations_project_forecast_booking_captures from public,anon,authenticated;
grant select,insert,update on public.operations_project_forecast_streams to service_role;
grant select,insert on public.operations_project_forecast_publications,public.operations_project_forecast_source_links,public.operations_project_forecast_booking_captures to service_role;
create trigger operations_project_forecast_pub_immutable before update or delete on public.operations_project_forecast_publications for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_pub_no_truncate before truncate on public.operations_project_forecast_publications for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_sources_immutable before update or delete on public.operations_project_forecast_source_links for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_sources_no_truncate before truncate on public.operations_project_forecast_source_links for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_bookings_immutable before update or delete on public.operations_project_forecast_booking_captures for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_bookings_no_truncate before truncate on public.operations_project_forecast_booking_captures for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.forecast_stream_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id or new.project_id is distinct from old.project_id or new.currency is distinct from old.currency then
  raise exception 'forecast_stream_identity_immutable' using errcode='55000';end if;
 if new.current_revision<>old.current_revision and (new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_project_forecast_publications
   where organization_id=old.organization_id and project_id=old.project_id and currency=old.currency and source_revision=new.current_revision)) then
  raise exception 'forecast_head_requires_next_saved_publication' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_economy_private.forecast_stream_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_project_forecast_stream_guard before update on public.operations_project_forecast_streams for each row execute function operations_economy_private.forecast_stream_guard_v1();
create trigger operations_project_forecast_stream_no_delete before delete on public.operations_project_forecast_streams for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_forecast_stream_no_truncate before truncate on public.operations_project_forecast_streams for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.publish_project_forecast_v1(p_input jsonb,p_result jsonb,p_raw_input text,p_expected_revision bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_project uuid;v_currency text;v_revision bigint;v_head bigint;v_hash text;v_body text;
 v_retry public.operations_project_forecast_publications%rowtype;v_item jsonb;v_calculated jsonb;v_source jsonb;v_evidence jsonb;v_budget jsonb;v_key text;
 v_confirmed numeric:=0;v_preliminary numeric:=0;v_remaining numeric:=0;v_budget_total numeric:=0;v_complete boolean;v_budget_complete boolean;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>10
  or not (p_input ?& array['schema_version','organization_id','project_id','currency','source_revision','scope_coverage','scope_reference','category_coverage','booking_budgets','obligations'])
  or jsonb_typeof(p_input->'schema_version') is distinct from 'string' or p_input->>'schema_version' is distinct from 'operations-project-cost-forecast-input-v1'
  or jsonb_typeof(p_result) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_result))<>17
  or not (p_result ?& array['schema_version','calculation_version','organization_id','project_id','currency','source_revision','input_fingerprint','coverage','issues',
    'confirmed_minor','preliminary_minor','known_cost_minor','remaining_minor','eac_minor','budget_minor','budget_variance_minor','calculated_obligations'])
  or jsonb_typeof(p_result->'schema_version') is distinct from 'string' or p_result->>'schema_version' is distinct from 'operations-project-cost-forecast-v1'
  or jsonb_typeof(p_result->'calculation_version') is distinct from 'string' or p_result->>'calculation_version' is distinct from 'operations-project-obligation-forecast-v1'
  or jsonb_typeof(p_input->'organization_id') is distinct from 'string' or jsonb_typeof(p_input->'project_id') is distinct from 'string'
  or coalesce(p_input->>'organization_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_input->>'project_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or jsonb_typeof(p_input->'currency') is distinct from 'string' or coalesce(p_input->>'currency','')!~'^[A-Z]{3}$'
  or jsonb_typeof(p_input->'source_revision') is distinct from 'number' or mod((p_input->>'source_revision')::numeric,1)<>0
  or (p_input->>'source_revision')::numeric not between 1 and 9007199254740991
  or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740990
  or (p_input->>'source_revision')::numeric<>p_expected_revision+1
  or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 or p_idempotency_key<>btrim(p_idempotency_key)
  or jsonb_typeof(p_input->'scope_reference') is distinct from 'string' or length(coalesce(p_input->>'scope_reference','')) not between 1 and 256
  or p_input->>'scope_reference' is distinct from btrim(p_input->>'scope_reference')
  or jsonb_typeof(p_input->'scope_coverage') is distinct from 'string' or coalesce(p_input->>'scope_coverage','') not in ('complete','unresolved')
  or jsonb_typeof(p_input->'category_coverage') is distinct from 'array' or jsonb_array_length(p_input->'category_coverage')<>4
  or jsonb_typeof(p_input->'obligations') is distinct from 'array' or jsonb_array_length(p_input->'obligations')>1000
  or jsonb_typeof(p_input->'booking_budgets') is distinct from 'array' or jsonb_array_length(p_input->'booking_budgets')>1000
  or jsonb_typeof(p_result->'calculated_obligations') is distinct from 'array'
  or jsonb_array_length(p_result->'calculated_obligations')<>jsonb_array_length(p_input->'obligations')
  or jsonb_typeof(p_result->'issues') is distinct from 'array' or jsonb_typeof(p_result->'coverage') is distinct from 'string'
  or coalesce(p_result->>'coverage','') not in ('complete','unavailable')
  then raise exception 'invalid_operational_forecast_contract' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_result->'issues') i where jsonb_typeof(i) is distinct from 'string') then
  raise exception 'invalid_forecast_issue_type' using errcode='22023';end if;
 foreach v_key in array array['organization_id','project_id','currency','source_revision'] loop
  if p_result->v_key is distinct from p_input->v_key then raise exception 'forecast_result_scope_mismatch' using errcode='22023';end if;end loop;
 foreach v_key in array array['confirmed_minor','preliminary_minor','known_cost_minor','remaining_minor','eac_minor','budget_minor','budget_variance_minor'] loop
  if (p_result->v_key is distinct from 'null'::jsonb) and (jsonb_typeof(p_result->v_key) is distinct from 'number' or mod((p_result->>v_key)::numeric,1)<>0
   or (p_result->>v_key)::numeric not between -9007199254740991 and 9007199254740991) then raise exception 'invalid_operational_forecast_money' using errcode='22023';end if;end loop;
 if p_result->'confirmed_minor'='null'::jsonb or p_result->'preliminary_minor'='null'::jsonb or p_result->'known_cost_minor'='null'::jsonb then
  raise exception 'known_forecast_subtotals_required' using errcode='22023';end if;
 foreach v_key in array array['known_cost_minor','remaining_minor','eac_minor','budget_minor'] loop
  if p_result->v_key<>'null'::jsonb and (p_result->>v_key)::numeric<0 then raise exception 'negative_forecast_cost' using errcode='22023';end if;end loop;
 v_org:=(p_input->>'organization_id')::uuid;v_project:=(p_input->>'project_id')::uuid;v_currency:=p_input->>'currency';v_revision:=(p_input->>'source_revision')::bigint;
 perform 1 from public.projects where id=v_project and organization_id=v_org and deleted_at is null for share;
 if not found then raise exception 'exact_forecast_project_scope_required' using errcode='22023';end if;
 if p_raw_input is null or octet_length(p_raw_input)>1048576 or p_raw_input::jsonb is distinct from p_input then
  raise exception 'forecast_raw_input_mismatch' using errcode='22023';end if;
 v_hash:=encode(sha256(convert_to(p_raw_input,'UTF8')),'hex');
 if p_result->>'input_fingerprint' is distinct from v_hash then raise exception 'forecast_input_fingerprint_mismatch' using errcode='22023';end if;
 v_complete:=p_input->>'scope_coverage'='complete' and jsonb_array_length(p_result->'issues')=0;
 if exists(select 1 from jsonb_array_elements(p_input->'category_coverage') c where jsonb_typeof(c) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(c))<>3 or not (c ?& array['category','coverage','source_reference'])
  or jsonb_typeof(c->'category') is distinct from 'string' or coalesce(c->>'category','') not in ('personnel','supplier','catering','other')
  or jsonb_typeof(c->'coverage') is distinct from 'string' or coalesce(c->>'coverage','') not in ('complete','unavailable')
  or jsonb_typeof(c->'source_reference') is distinct from 'string' or length(coalesce(c->>'source_reference','')) not between 1 and 256
  or c->>'source_reference' is distinct from btrim(c->>'source_reference'))
  or (select count(distinct c->>'category') from jsonb_array_elements(p_input->'category_coverage') c)<>4 then raise exception 'invalid_forecast_category_coverage' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_input->'category_coverage') c where c->>'coverage'<>'complete') then v_complete:=false;end if;
 if exists(select 1 from jsonb_array_elements(p_input->'obligations') i where jsonb_typeof(i#>'{input,obligation_id}') is distinct from 'string'
   or coalesce(i#>>'{input,obligation_id}','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  or (select count(distinct lower(i#>>'{input,obligation_id}')) from jsonb_array_elements(p_input->'obligations') i)<>jsonb_array_length(p_input->'obligations')
  then raise exception 'duplicate_or_invalid_forecast_obligation' using errcode='22023';end if;
 for v_item,v_calculated in select i.value,c.value from jsonb_array_elements(p_input->'obligations') with ordinality i(value,ord)
 join jsonb_array_elements(p_result->'calculated_obligations') with ordinality c(value,ord) using(ord) loop
  if jsonb_typeof(v_item) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_item))<>5
   or not (v_item ?& array['category','baseline_revision','baseline_fingerprint','input','source_evidence'])
   or jsonb_typeof(v_calculated) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_calculated))<>4
   or not (v_calculated ?& array['category','baseline_revision','baseline_fingerprint','result'])
   or jsonb_typeof(v_calculated->'result') is distinct from 'object' or (select count(*) from jsonb_object_keys(v_calculated->'result'))<>17
   or not ((v_calculated->'result') ?& array['schema_version','calculation_version','organization_id','project_id','obligation_id','currency','cost_basis','coverage','issues','source_ids',
     'confirmed_minor','preliminary_minor','known_cost_minor','estimate_remaining_minor','commitment_remaining_minor','remaining_minor','eac_minor'])
   or v_calculated#>>'{result,schema_version}' is distinct from 'operations-cost-obligation-v1'
   or v_calculated#>>'{result,calculation_version}' is distinct from 'operations-obligation-replacement-v1'
   or coalesce(v_item->>'category','') not in ('personnel','supplier','catering','other')
   or jsonb_typeof(v_item->'baseline_revision') is distinct from 'number' or (v_item->>'baseline_revision')::numeric not between 1 and 9007199254740991
   or mod((v_item->>'baseline_revision')::numeric,1)<>0 or jsonb_typeof(v_item->'baseline_fingerprint') is distinct from 'string'
   or coalesce(v_item->>'baseline_fingerprint','')!~'^[0-9a-f]{64}$'
   or v_item->'category' is distinct from v_calculated->'category' or v_item->'baseline_revision' is distinct from v_calculated->'baseline_revision'
   or v_item->'baseline_fingerprint' is distinct from v_calculated->'baseline_fingerprint'
   or v_item#>>'{input,organization_id}' is distinct from p_input->>'organization_id' or v_item#>>'{input,project_id}' is distinct from p_input->>'project_id'
   or v_item#>>'{input,currency}' is distinct from v_currency or v_calculated#>>'{result,organization_id}' is distinct from p_input->>'organization_id'
   or v_calculated#>>'{result,project_id}' is distinct from p_input->>'project_id' or v_calculated#>>'{result,currency}' is distinct from v_currency
   or v_item#>'{input,obligation_id}' is distinct from v_calculated#>'{result,obligation_id}'
   or v_item#>'{input,cost_basis}' is distinct from v_calculated#>'{result,cost_basis}'
   or coalesce(v_item#>>'{input,cost_basis}','') not in ('time','invoice','other')
   or jsonb_typeof(v_calculated#>'{result,coverage}') is distinct from 'string' or coalesce(v_calculated#>>'{result,coverage}','') not in ('complete','unavailable')
   or jsonb_typeof(v_item#>'{input,sources}') is distinct from 'array' or jsonb_typeof(v_item->'source_evidence') is distinct from 'array'
   or jsonb_array_length(v_item#>'{input,sources}')<>jsonb_array_length(v_item->'source_evidence')
   or jsonb_typeof(v_calculated#>'{result,issues}') is distinct from 'array' or jsonb_typeof(v_calculated#>'{result,source_ids}') is distinct from 'array'
   or v_calculated#>'{result,source_ids}' is distinct from (select coalesce(jsonb_agg(s.value->'source_id' order by s.ord),'[]'::jsonb)
     from jsonb_array_elements(v_item#>'{input,sources}') with ordinality s(value,ord))
   then raise exception 'forecast_obligation_result_mismatch' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(v_calculated#>'{result,issues}') i where jsonb_typeof(i) is distinct from 'string') then
   raise exception 'invalid_forecast_issue_type' using errcode='22023';end if;
  for v_evidence in select value from jsonb_array_elements(v_item->'source_evidence') loop
   if jsonb_typeof(v_evidence) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_evidence))<>5
    or not (v_evidence ?& array['source_id','source_system','source_stream_id','source_revision','source_fingerprint'])
    or jsonb_typeof(v_evidence->'source_id') is distinct from 'string' or length(coalesce(v_evidence->>'source_id','')) not between 1 and 256
    or v_evidence->>'source_id' is distinct from btrim(v_evidence->>'source_id')
    or jsonb_typeof(v_evidence->'source_system') is distinct from 'string' or coalesce(v_evidence->>'source_system','') not in ('time','finance','catering','operations')
    or jsonb_typeof(v_evidence->'source_stream_id') is distinct from 'string' or length(coalesce(v_evidence->>'source_stream_id','')) not between 1 and 256
    or v_evidence->>'source_stream_id' is distinct from btrim(v_evidence->>'source_stream_id')
    or jsonb_typeof(v_evidence->'source_fingerprint') is distinct from 'string' or coalesce(v_evidence->>'source_fingerprint','')!~'^[0-9a-f]{64}$'
    or jsonb_typeof(v_evidence->'source_revision') is distinct from 'number' or (v_evidence->>'source_revision')::numeric not between 1 and 9007199254740991
    or mod((v_evidence->>'source_revision')::numeric,1)<>0
    then raise exception 'invalid_forecast_source_provenance' using errcode='22023';end if;
  end loop;
  foreach v_key in array array['confirmed_minor','preliminary_minor','known_cost_minor','estimate_remaining_minor','commitment_remaining_minor','remaining_minor','eac_minor'] loop
   if jsonb_typeof(v_calculated#>array['result',v_key]) is distinct from 'number' and v_calculated#>array['result',v_key] is distinct from 'null'::jsonb
    or (v_calculated#>>array['result',v_key])::numeric not between -9007199254740991 and 9007199254740991
    or mod((v_calculated#>>array['result',v_key])::numeric,1)<>0 then raise exception 'invalid_forecast_obligation_money' using errcode='22023';end if;end loop;
  if v_calculated#>'{result,confirmed_minor}'='null'::jsonb or v_calculated#>'{result,preliminary_minor}'='null'::jsonb
   or v_calculated#>'{result,known_cost_minor}' is distinct from to_jsonb((v_calculated#>>'{result,confirmed_minor}')::numeric+(v_calculated#>>'{result,preliminary_minor}')::numeric)
   or (v_calculated#>>'{result,known_cost_minor}')::numeric<0 or (v_calculated#>>'{result,remaining_minor}')::numeric<0
   or (v_calculated#>>'{result,estimate_remaining_minor}')::numeric<0 or (v_calculated#>>'{result,commitment_remaining_minor}')::numeric<0
   then raise exception 'invalid_forecast_obligation_subtotal' using errcode='22023';end if;
  if v_calculated#>>'{result,coverage}'='complete' then
   if jsonb_array_length(v_calculated#>'{result,issues}')<>0 or v_calculated#>'{result,estimate_remaining_minor}'='null'::jsonb
    or v_calculated#>'{result,commitment_remaining_minor}'='null'::jsonb
    or v_calculated#>'{result,remaining_minor}' is distinct from to_jsonb(greatest((v_calculated#>>'{result,estimate_remaining_minor}')::numeric,(v_calculated#>>'{result,commitment_remaining_minor}')::numeric))
    or v_calculated#>'{result,eac_minor}' is distinct from to_jsonb((v_calculated#>>'{result,known_cost_minor}')::numeric+(v_calculated#>>'{result,remaining_minor}')::numeric)
    then raise exception 'forecast_obligation_eac_mismatch' using errcode='22023';end if;
  elsif jsonb_array_length(v_calculated#>'{result,issues}')=0 or v_calculated#>'{result,estimate_remaining_minor}' is distinct from 'null'::jsonb
   or v_calculated#>'{result,commitment_remaining_minor}' is distinct from 'null'::jsonb or v_calculated#>'{result,remaining_minor}' is distinct from 'null'::jsonb
   or v_calculated#>'{result,eac_minor}' is distinct from 'null'::jsonb then raise exception 'unavailable_obligation_must_withhold_eac' using errcode='22023';end if;
  v_confirmed:=v_confirmed+(v_calculated#>>'{result,confirmed_minor}')::numeric;v_preliminary:=v_preliminary+(v_calculated#>>'{result,preliminary_minor}')::numeric;
  if v_calculated#>>'{result,coverage}'<>'complete' or v_calculated#>'{result,remaining_minor}'='null'::jsonb then v_complete:=false;
  else v_remaining:=v_remaining+(v_calculated#>>'{result,remaining_minor}')::numeric;end if;
 end loop;
 if (select coalesce(sum(jsonb_array_length(i->'source_evidence')),0) from jsonb_array_elements(p_input->'obligations') i)>10000 then
  raise exception 'too_many_forecast_sources' using errcode='22023';end if;
 if p_result->'confirmed_minor' is distinct from to_jsonb(v_confirmed) or p_result->'preliminary_minor' is distinct from to_jsonb(v_preliminary)
  or p_result->'known_cost_minor' is distinct from to_jsonb(v_confirmed+v_preliminary) or p_result->>'coverage' is distinct from (case when v_complete then 'complete' else 'unavailable' end)
  or p_result->'remaining_minor' is distinct from (case when v_complete then to_jsonb(v_remaining) else 'null'::jsonb end)
  or p_result->'eac_minor' is distinct from (case when v_complete then to_jsonb(v_confirmed+v_preliminary+v_remaining) else 'null'::jsonb end)
  then raise exception 'forecast_project_totals_mismatch' using errcode='22023';end if;
 v_budget_complete:=jsonb_array_length(p_input->'booking_budgets')>0;
 for v_budget in select value from jsonb_array_elements(p_input->'booking_budgets') loop
  if jsonb_typeof(v_budget) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_budget))<>10
   or not (v_budget ?& array['organization_id','project_id','source_booking_id','source_revision','source_hash','mapping_version','currency','coverage','amount_minor','raw_payload'])
   or jsonb_typeof(v_budget->'source_booking_id') is distinct from 'string'
   or coalesce(v_budget->>'source_booking_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or (v_budget->'source_revision'<>'null'::jsonb and (jsonb_typeof(v_budget->'source_revision') is distinct from 'number'
     or (v_budget->>'source_revision')::numeric not between 1 and 9007199254740991 or mod((v_budget->>'source_revision')::numeric,1)<>0))
   or (v_budget->'source_hash'<>'null'::jsonb and (jsonb_typeof(v_budget->'source_hash') is distinct from 'string' or coalesce(v_budget->>'source_hash','')!~'^[0-9a-f]{64}$'))
   or (v_budget->'mapping_version'<>'null'::jsonb and (jsonb_typeof(v_budget->'mapping_version') is distinct from 'string'
     or length(coalesce(v_budget->>'mapping_version','')) not between 1 and 256 or v_budget->>'mapping_version' is distinct from btrim(v_budget->>'mapping_version')))
   then raise exception 'invalid_forecast_booking_metadata' using errcode='22023';end if;
  if v_budget->>'coverage'='verified' then
   if v_budget->'amount_minor'='null'::jsonb or jsonb_typeof(v_budget->'amount_minor') is distinct from 'number'
    or (v_budget->>'amount_minor')::numeric not between 0 and 9007199254740991 or mod((v_budget->>'amount_minor')::numeric,1)<>0
    or coalesce(v_budget->>'source_hash','')!~'^[0-9a-f]{64}$' or jsonb_typeof(v_budget->'source_revision') is distinct from 'number'
    or (v_budget->>'source_revision')::numeric not between 1 and 9007199254740991 or mod((v_budget->>'source_revision')::numeric,1)<>0
    or jsonb_typeof(v_budget->'mapping_version') is distinct from 'string' or length(coalesce(v_budget->>'mapping_version','')) not between 1 and 256
    then raise exception 'unproven_forecast_booking_budget' using errcode='22023';end if;
   v_budget_total:=v_budget_total+(v_budget->>'amount_minor')::numeric;
  elsif v_budget->>'coverage'='unavailable' and v_budget->'amount_minor'='null'::jsonb then v_budget_complete:=false;
  else raise exception 'invalid_forecast_booking_coverage' using errcode='22023';end if;
  if v_budget->>'organization_id' is distinct from p_input->>'organization_id' or v_budget->>'project_id' is distinct from p_input->>'project_id'
   or v_budget->>'currency' is distinct from v_currency then raise exception 'cross_scope_booking_budget' using errcode='22023';end if;
 end loop;
 if p_result->'budget_minor' is distinct from (case when v_budget_complete then to_jsonb(v_budget_total) else 'null'::jsonb end)
  or p_result->'budget_variance_minor' is distinct from (case when v_complete and v_budget_complete then to_jsonb(v_budget_total-v_confirmed-v_preliminary-v_remaining) else 'null'::jsonb end)
  then raise exception 'forecast_budget_totals_mismatch' using errcode='22023';end if;
 v_body:=p_result::text;
 if octet_length(p_input::text)>1048576 or octet_length(v_body)>1048576 then raise exception 'forecast_evidence_too_large' using errcode='22023';end if;
 if p_expected_revision>0 and not exists(select 1 from public.operations_project_forecast_streams where organization_id=v_org and project_id=v_project and currency=v_currency) then
  return jsonb_build_object('status','stale','current_revision',0);end if;
 insert into public.operations_project_forecast_streams(organization_id,project_id,currency) values(v_org,v_project,v_currency) on conflict do nothing;
 select current_revision into strict v_head from public.operations_project_forecast_streams where organization_id=v_org and project_id=v_project and currency=v_currency for update;
 select * into v_retry from public.operations_project_forecast_publications where organization_id=v_org and idempotency_key=p_idempotency_key;
 if found then
  if v_retry.input_snapshot is distinct from p_input or v_retry.raw_input is distinct from p_raw_input or v_retry.result_snapshot is distinct from p_result or v_retry.source_revision<>p_expected_revision+1 then
   raise exception 'forecast_idempotency_conflict' using errcode='23505';end if;
  return jsonb_build_object('status','duplicate','source_revision',v_retry.source_revision,'body_sha256',v_retry.body_sha256,'shadow_only',true,'integration_state','isolated_contract');end if;
 if v_head<>p_expected_revision then return jsonb_build_object('status','stale','current_revision',v_head);end if;
 insert into public.operations_project_forecast_publications(organization_id,project_id,currency,source_revision,input_snapshot,raw_input,result_snapshot,input_fingerprint,raw_body,body_sha256,idempotency_key)
  values(v_org,v_project,v_currency,v_revision,p_input,p_raw_input,p_result,v_hash,v_body,encode(sha256(convert_to(v_body,'UTF8')),'hex'),p_idempotency_key);
 for v_item in select value from jsonb_array_elements(p_input->'obligations') loop
  for v_source in select value from jsonb_array_elements(v_item#>'{input,sources}') loop
   select value into strict v_evidence from jsonb_array_elements(v_item->'source_evidence') where value->>'source_id'=v_source->>'source_id';
   if v_source->>'organization_id' is distinct from p_input->>'organization_id' or v_source->>'project_id' is distinct from p_input->>'project_id'
    or v_source->>'currency' is distinct from v_currency or v_source->'obligation_id' is distinct from v_item#>'{input,obligation_id}'
    or coalesce(v_evidence->>'source_fingerprint','')!~'^[0-9a-f]{64}$' or jsonb_typeof(v_evidence->'source_revision') is distinct from 'number'
    or (v_evidence->>'source_revision')::numeric not between 1 and 9007199254740991 or mod((v_evidence->>'source_revision')::numeric,1)<>0
    or coalesce(v_evidence->>'source_system','') not in ('time','finance','catering','operations')
    or jsonb_typeof(v_evidence->'source_stream_id') is distinct from 'string' or length(coalesce(v_evidence->>'source_stream_id','')) not between 1 and 256
    then raise exception 'invalid_forecast_source_provenance' using errcode='22023';end if;
   insert into public.operations_project_forecast_source_links(organization_id,project_id,currency,source_revision,obligation_id,category,baseline_revision,baseline_fingerprint,
    source_id,source_system,source_stream_id,source_publication_revision,source_fingerprint,source_snapshot)
    values(v_org,v_project,v_currency,v_revision,(v_item#>>'{input,obligation_id}')::uuid,v_item->>'category',(v_item->>'baseline_revision')::bigint,v_item->>'baseline_fingerprint',
    v_source->>'source_id',v_evidence->>'source_system',v_evidence->>'source_stream_id',(v_evidence->>'source_revision')::bigint,v_evidence->>'source_fingerprint',v_source);
  end loop;
 end loop;
 for v_budget in select value from jsonb_array_elements(p_input->'booking_budgets') loop
  insert into public.operations_project_forecast_booking_captures(organization_id,project_id,currency,source_revision,source_booking_id,booking_snapshot)
   values(v_org,v_project,v_currency,v_revision,(v_budget->>'source_booking_id')::uuid,v_budget);end loop;
 update public.operations_project_forecast_streams set current_revision=v_revision where organization_id=v_org and project_id=v_project and currency=v_currency;
 return jsonb_build_object('status','accepted','source_revision',v_revision,'body_sha256',encode(sha256(convert_to(v_body,'UTF8')),'hex'),'shadow_only',true,'integration_state','isolated_contract');
end;$$;
revoke all on function operations_economy_private.publish_project_forecast_v1(jsonb,jsonb,text,bigint,text) from public,anon,authenticated;
grant execute on function operations_economy_private.publish_project_forecast_v1(jsonb,jsonb,text,bigint,text) to service_role;
create function public.publish_operations_project_forecast_v1(p_input jsonb,p_result jsonb,p_raw_input text,p_expected_revision bigint,p_idempotency_key text)
returns jsonb language sql security invoker set search_path='' as $$
 select operations_economy_private.publish_project_forecast_v1(p_input,p_result,p_raw_input,p_expected_revision,p_idempotency_key);$$;
revoke all on function public.publish_operations_project_forecast_v1(jsonb,jsonb,text,bigint,text) from public,anon,authenticated;
grant execute on function public.publish_operations_project_forecast_v1(jsonb,jsonb,text,bigint,text) to service_role;
create view public.operations_project_forecast_current with(security_invoker=true) as
 select p.* from public.operations_project_forecast_streams h join public.operations_project_forecast_publications p
 on p.organization_id=h.organization_id and p.project_id=h.project_id and p.currency=h.currency and p.source_revision=h.current_revision;
revoke all on public.operations_project_forecast_current from public,anon,authenticated;
grant select on public.operations_project_forecast_current to service_role;
