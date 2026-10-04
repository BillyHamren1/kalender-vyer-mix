-- Default-off native Catering evidence, isolated from Time/legacy project totals.
create table public.operations_catering_source_bindings (
 organization_id uuid not null, worker_id uuid not null, catering_organization_id uuid not null, catering_person_id uuid not null,
 endpoint_url text not null check(endpoint_url ~ '^https://[^/?#@]+/api/project-economy-read$'),
 key_id text not null check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 enabled boolean not null default false, primary key(organization_id,worker_id),unique(catering_organization_id,catering_person_id)
);
create table public.operations_catering_publish_gates (
 organization_id uuid primary key, enabled boolean not null default false
);
create table public.operations_catering_project_mappings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,worker_id uuid not null,
 catering_organization_id uuid not null,catering_person_id uuid not null,time_entry_id uuid not null,workplace_id uuid not null,
 work_date date not null,time_zone text not null check(length(time_zone) between 1 and 100),
 project_id uuid not null,obligation_id uuid not null,currency text not null check(currency ~ '^[A-Z]{3}$'),
 mapping_revision text not null check(length(mapping_revision) between 1 and 200),enabled boolean not null default false,
 foreign key(organization_id,worker_id) references public.operations_catering_source_bindings(organization_id,worker_id),
 unique(organization_id,catering_organization_id,time_entry_id,mapping_revision)
);
create unique index operations_catering_current_mapping on public.operations_catering_project_mappings(organization_id,catering_organization_id,time_entry_id) where enabled;
create table public.operations_catering_source_observations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,catering_organization_id uuid not null,
 person_id uuid not null,time_entry_id uuid not null,entry_version integer not null check(entry_version>0),
 raw_entry text not null,raw_review text,raw_entry_sha256 text not null check(raw_entry_sha256 ~ '^[0-9a-f]{64}$'),
 raw_review_sha256 text check(raw_review_sha256 is null or raw_review_sha256 ~ '^[0-9a-f]{64}$'),
 source_fingerprint text not null check(source_fingerprint ~ '^[0-9a-f]{64}$'),source_request_hash text not null check(source_request_hash ~ '^[0-9a-f]{64}$'),
 observed_at timestamptz not null default now(),unique(organization_id,catering_organization_id,time_entry_id,entry_version),
 unique(organization_id,id),check((raw_review is null)=(raw_review_sha256 is null))
);
create table public.operations_catering_cost_streams (
 organization_id uuid not null,source_stream_id text not null,worker_id uuid not null,catering_organization_id uuid not null,
 person_id uuid not null,time_entry_id uuid not null,current_revision bigint not null default 0 check(current_revision between 0 and 9007199254740991),
 primary key(organization_id,source_stream_id),unique(catering_organization_id,time_entry_id)
);
create table public.operations_catering_cost_publications (
 organization_id uuid not null,source_stream_id text not null,source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 observation_id uuid not null,mapping_id uuid not null references public.operations_catering_project_mappings(id),
 snapshot jsonb not null,idempotency_key text not null check(length(idempotency_key) between 12 and 200),created_at timestamptz not null default now(),
 primary key(organization_id,source_stream_id,source_revision),unique(organization_id,idempotency_key),
 foreign key(organization_id,source_stream_id) references public.operations_catering_cost_streams(organization_id,source_stream_id),
 foreign key(organization_id,observation_id) references public.operations_catering_source_observations(organization_id,id)
);
create table public.operations_catering_cost_outbox (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,source_stream_id text not null,source_revision bigint not null,
 destinations jsonb not null,status text not null default 'parked' check(status='parked'),created_at timestamptz not null default now(),
 unique(organization_id,source_stream_id,source_revision),foreign key(organization_id,source_stream_id,source_revision)
 references public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision)
);
create function public.operations_catering_mapping_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' or (to_jsonb(NEW)-'enabled') is distinct from (to_jsonb(OLD)-'enabled') then
 raise exception 'native source/mapping identity is immutable' using errcode='55000';end if;return NEW;
end;$$;
create function public.operations_catering_stream_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' or (to_jsonb(NEW)-'current_revision') is distinct from (to_jsonb(OLD)-'current_revision') or NEW.current_revision<>OLD.current_revision+1 then
 raise exception 'native stream identity/head is immutable or nonmonotonic' using errcode='55000';end if;return NEW;
end;$$;
create trigger operations_catering_stream_identity before update or delete on public.operations_catering_cost_streams for each row execute function public.operations_catering_stream_guard();
create trigger operations_catering_stream_no_truncate before truncate on public.operations_catering_cost_streams for each statement execute function public.operations_personnel_evidence_immutable();
do $$declare t text;begin
 foreach t in array array['operations_catering_publish_gates','operations_catering_source_bindings','operations_catering_project_mappings','operations_catering_source_observations','operations_catering_cost_streams','operations_catering_cost_publications','operations_catering_cost_outbox'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 end loop;
 foreach t in array array['operations_catering_source_observations','operations_catering_cost_publications','operations_catering_cost_outbox'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.operations_personnel_evidence_immutable()',t||'_immutable',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;
 foreach t in array array['operations_catering_source_bindings','operations_catering_project_mappings'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.operations_catering_mapping_guard()',t||'_identity',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;
end;$$;
grant update on public.operations_catering_publish_gates,public.operations_catering_source_bindings,public.operations_catering_project_mappings,public.operations_catering_cost_streams to service_role;
create schema if not exists operations_catering_private;
revoke all on schema operations_catering_private from public,anon,authenticated;
grant usage on schema operations_catering_private to service_role;
-- Native rows/reviews currently contain lowercase SQL column keys and safe
-- integer numeric fields. Unsupported future JSON shapes fail closed.
create function operations_catering_private.canonical_source_json_v1(p jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare result text;
begin
 case jsonb_typeof(p)
 when 'object' then
 if exists(select 1 from jsonb_object_keys(p) k where k !~ '^[a-z][a-z0-9_]*$') then raise exception 'unsupported native source key' using errcode='22023';end if;
 select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||operations_catering_private.canonical_source_json_v1(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(p);
 when 'array' then select '['||coalesce(string_agg(operations_catering_private.canonical_source_json_v1(value),',' order by ord),'')||']' into result from jsonb_array_elements(p) with ordinality a(value,ord);
 when 'number' then
 if p::numeric<>trunc(p::numeric) or abs(p::numeric)>9007199254740991 then raise exception 'unsupported native source number' using errcode='22023';end if;
 result:=trunc(p::numeric)::text;
 else result:=p::text;
 end case;return result;
end;$$;
revoke all on function operations_catering_private.canonical_source_json_v1(jsonb) from public,anon,authenticated;
grant execute on function operations_catering_private.canonical_source_json_v1(jsonb) to service_role;
create function operations_catering_private.valid_source_timestamp_v1(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'string' or p#>>'{}' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return false;end if;
 return isfinite((p#>>'{}')::timestamptz);
 exception when invalid_datetime_format or datetime_field_overflow then return false;
end;$$;
revoke all on function operations_catering_private.valid_source_timestamp_v1(jsonb) from public,anon,authenticated;
grant execute on function operations_catering_private.valid_source_timestamp_v1(jsonb) to service_role;
create function operations_catering_private.publish_operations_catering_cost_v1(
 p_snapshot jsonb,p_raw_entry text,p_raw_review text,p_mapping_id uuid,p_source_request_hash text,p_expected_revision bigint,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_org uuid;v_worker uuid;v_source_org uuid;v_entry_id uuid;v_person uuid;v_stream text;v_revision bigint;
 v_entry jsonb;v_review jsonb;v_observation public.operations_catering_source_observations%rowtype;
 v_mapping public.operations_catering_project_mappings%rowtype;v_head public.operations_catering_cost_streams%rowtype;
 v_prior public.operations_catering_cost_publications%rowtype;v_existing public.operations_catering_cost_publications%rowtype;
 v_rate public.operations_personnel_rate_history%rowtype;v_rate_count integer;v_minutes numeric;v_start timestamptz;v_end timestamptz;
 v_destinations jsonb;v_expected_review text;v_same_date boolean;v_keys text[]:=array['schema_version','calculation_version','organization_id','worker_id','project_id','obligation_id','currency','work_date','time_zone','mapping_revision','source_organization_id','source_person_id','source_time_entry_id','source_time_entry_version','source_fingerprint','source_review_id','source_review_fingerprint','source_status','publication_revision','project_review_status','minutes','rate_revision','hourly_rate_minor','amount_minor','coverage'];
begin
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or not p_snapshot ?& v_keys or p_snapshot-v_keys<>'{}'::jsonb
 or p_snapshot->>'schema_version' is distinct from 'operations-catering-personnel-v1' or p_snapshot->>'calculation_version' is distinct from 'operations-personnel-cost.v1.half-up'
 or p_raw_entry is null or octet_length(p_raw_entry)>524288 or (p_raw_review is not null and octet_length(p_raw_review)>1048576)
 or p_source_request_hash is null or p_source_request_hash!~'^[0-9a-f]{64}$' or p_expected_revision is null or p_expected_revision<0
 or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 then raise exception 'invalid native publication' using errcode='22023';end if;
 v_org:=(p_snapshot->>'organization_id')::uuid;v_worker:=(p_snapshot->>'worker_id')::uuid;
 v_source_org:=(p_snapshot->>'source_organization_id')::uuid;v_entry_id:=(p_snapshot->>'source_time_entry_id')::uuid;v_person:=(p_snapshot->>'source_person_id')::uuid;
 perform 1 from public.operations_catering_publish_gates where organization_id=v_org and enabled for share;
 if not found then raise exception 'native publication disabled' using errcode='42501';end if;
 if exists(select 1 from unnest(array['schema_version','calculation_version','organization_id','worker_id','project_id','obligation_id','currency','work_date','time_zone','mapping_revision','source_organization_id','source_person_id','source_time_entry_id','source_status','project_review_status','coverage']) k where jsonb_typeof(p_snapshot->k) is distinct from 'string')
 or exists(select 1 from unnest(array['source_time_entry_version','publication_revision','minutes']) k where jsonb_typeof(p_snapshot->k) is distinct from 'number')
 or p_snapshot->>'project_review_status' not in ('preliminary','confirmed','rejected') then raise exception 'native strict snapshot types required' using errcode='22023';end if;
 v_entry:=p_raw_entry::jsonb;v_review:=p_raw_review::jsonb;v_revision:=(p_snapshot->>'publication_revision')::bigint;
 v_stream:='catering:'||v_source_org::text||':'||v_entry_id::text;
 perform 1 from public.operations_catering_source_bindings where organization_id=v_org and worker_id=v_worker
 and catering_organization_id=v_source_org and catering_person_id=v_person and enabled for share;
 if not found then raise exception 'native source binding disabled' using errcode='42501';end if;
 select * into v_mapping from public.operations_catering_project_mappings where id=p_mapping_id and enabled for share;
 if not found or v_mapping.organization_id is distinct from v_org or v_mapping.worker_id is distinct from v_worker
 or v_mapping.catering_organization_id is distinct from v_source_org or v_mapping.catering_person_id is distinct from v_person
 or v_mapping.time_entry_id is distinct from v_entry_id or v_mapping.workplace_id::text is distinct from v_entry->>'workplace_id'
 or v_mapping.project_id::text is distinct from p_snapshot->>'project_id' or v_mapping.obligation_id::text is distinct from p_snapshot->>'obligation_id'
 or v_mapping.currency is distinct from p_snapshot->>'currency' or v_mapping.work_date::text is distinct from p_snapshot->>'work_date'
 or v_mapping.time_zone is distinct from p_snapshot->>'time_zone' or v_mapping.mapping_revision is distinct from p_snapshot->>'mapping_revision'
 then raise exception 'native exact allocation mapping denied' using errcode='42501';end if;
 perform 1 from public.projects where id=v_mapping.project_id and organization_id=v_org and deleted_at is null for share;
 if not found then raise exception 'native project tenant/deletion denied' using errcode='42501';end if;
 if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'id' is distinct from v_entry_id::text or v_entry->>'organization_id' is distinct from v_source_org::text
 or v_entry->>'person_id' is distinct from v_person::text or v_entry->'version' is distinct from p_snapshot->'source_time_entry_version'
 or jsonb_typeof(v_entry->'version')<>'number' or (v_entry->>'version')::integer<1
 or v_entry->>'status' is distinct from p_snapshot->>'source_status' or v_entry->>'status' not in ('pending','approved','rejected')
 or jsonb_typeof(v_entry->'status') is distinct from 'string' or jsonb_typeof(v_entry->'source') is distinct from 'string' or v_entry->>'source' not in ('ledger','manual') or jsonb_typeof(p_snapshot->'source_fingerprint')<>'string'
 or p_snapshot->>'source_fingerprint' is distinct from encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(v_entry),'UTF8')),'hex') then raise exception 'native source identity mismatch' using errcode='22023';end if;
 if (p_raw_review is null) is distinct from (p_snapshot->'source_review_id'='null'::jsonb)
 or (p_raw_review is null) is distinct from (p_snapshot->'source_review_fingerprint'='null'::jsonb)
 or (p_raw_review is not null and (jsonb_typeof(v_review) is distinct from 'object' or jsonb_typeof(v_review->'before_payload') is distinct from 'object'
 or jsonb_typeof(v_review#>'{before_payload,version}') is distinct from 'number' or jsonb_typeof(v_review->'id') is distinct from 'string'
 or coalesce(v_review->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(v_review->'reviewed_by') is distinct from 'string' or coalesce(v_review->>'reviewed_by','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or not operations_catering_private.valid_source_timestamp_v1(v_review->'reviewed_at')
 or jsonb_typeof(v_review->'from_status') is distinct from 'string' or v_review->>'from_status' not in ('pending','approved','rejected')
 or v_review->>'organization_id' is distinct from v_source_org::text
 or v_review->>'time_entry_id' is distinct from v_entry_id::text or v_review->>'id' is distinct from p_snapshot->>'source_review_id'
 or v_review->>'to_status' is distinct from v_entry->>'status' or v_review->>'from_status' is distinct from v_review#>>'{before_payload,status}'
 or v_review#>>'{before_payload,id}' is distinct from v_entry_id::text or v_review#>>'{before_payload,organization_id}' is distinct from v_source_org::text
 or v_review->'after_payload' is distinct from v_entry or (v_review#>>'{before_payload,version}')::integer is distinct from (v_entry->>'version')::integer-1
 or jsonb_typeof(p_snapshot->'source_review_fingerprint') is distinct from 'string' or p_snapshot->>'source_review_fingerprint' is distinct from encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(v_review),'UTF8')),'hex')))
 or (v_entry->>'status'='approved' and (jsonb_typeof(v_entry->'approved_by') is distinct from 'string' or coalesce(v_entry->>'approved_by','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not operations_catering_private.valid_source_timestamp_v1(v_entry->'approved_at') or p_raw_review is null or v_entry->>'approved_by' is distinct from v_review->>'reviewed_by' or v_entry->>'approved_at' is null))
 or (v_entry->>'status'<>'approved' and (v_entry->'approved_by' is distinct from 'null'::jsonb or v_entry->'approved_at' is distinct from 'null'::jsonb))
 then raise exception 'native original review mismatch' using errcode='22023';end if;
 if not operations_catering_private.valid_source_timestamp_v1(v_entry->'started_at') or not operations_catering_private.valid_source_timestamp_v1(v_entry->'ended_at') then raise exception 'invalid native source timestamps' using errcode='22023';end if;
 v_start:=(v_entry->>'started_at')::timestamptz;v_end:=(v_entry->>'ended_at')::timestamptz;
 v_minutes:=extract(epoch from v_end-v_start)/60-(v_entry->>'break_minutes')::integer;
 if v_end<=v_start or mod(extract(epoch from v_end-v_start),60)<>0 or v_minutes<0
 or jsonb_typeof(v_entry->'break_minutes') is distinct from 'number' or (v_entry->>'break_minutes')::numeric<>trunc((v_entry->>'break_minutes')::numeric) or (v_entry->>'break_minutes')::integer<0
 or v_minutes is distinct from (p_snapshot->>'minutes')::numeric or jsonb_typeof(p_snapshot->'minutes')<>'number'
 or (v_start at time zone v_mapping.time_zone)::date<>v_mapping.work_date
 or ((v_end-interval '1 microsecond') at time zone v_mapping.time_zone)::date<>v_mapping.work_date
 then raise exception 'native interval/date allocation unsupported' using errcode='22023';end if;
 insert into public.operations_catering_cost_streams(organization_id,source_stream_id,worker_id,catering_organization_id,person_id,time_entry_id)
 values(v_org,v_stream,v_worker,v_source_org,v_person,v_entry_id) on conflict(organization_id,source_stream_id) do nothing;
 select * into v_head from public.operations_catering_cost_streams where organization_id=v_org and source_stream_id=v_stream for update;
 if v_head.worker_id is distinct from v_worker or v_head.person_id is distinct from v_person then raise exception 'native stream identity changed' using errcode='22023';end if;
 select * into v_existing from public.operations_catering_cost_publications where organization_id=v_org and idempotency_key=p_idempotency_key;
 if found then
 select * into v_observation from public.operations_catering_source_observations where organization_id=v_org and id=v_existing.observation_id;
 if v_observation.raw_entry is distinct from p_raw_entry or v_observation.raw_review is distinct from p_raw_review or v_existing.snapshot is distinct from p_snapshot or v_existing.mapping_id is distinct from p_mapping_id then raise exception 'native idempotency collision' using errcode='22023';end if;
 return jsonb_build_object('outcome','replayed','source_revision',v_existing.source_revision,'current_revision',v_head.current_revision,'observation_id',v_existing.observation_id,'delivery_status','parked');end if;
 if v_head.current_revision<>p_expected_revision or v_revision<>v_head.current_revision+1 or v_revision>9007199254740991
 then raise exception 'native publication head changed' using errcode='40001';end if;
 if v_head.current_revision>0 then
 select * into v_prior from public.operations_catering_cost_publications where organization_id=v_org and source_stream_id=v_stream and source_revision=v_head.current_revision;
 if v_prior.snapshot is null or v_prior.snapshot->>'currency' is distinct from p_snapshot->>'currency' then raise exception 'native prior identity missing or currency changed' using errcode='22023';end if;
 if (v_prior.snapshot->>'source_time_entry_version')::integer>(v_entry->>'version')::integer then raise exception 'stale native entry' using errcode='40001';end if;
 end if;
 select * into v_observation from public.operations_catering_source_observations where organization_id=v_org and catering_organization_id=v_source_org and time_entry_id=v_entry_id and entry_version=(v_entry->>'version')::integer;
 if found then
 if v_observation.person_id is distinct from v_person or v_observation.raw_entry is distinct from p_raw_entry or v_observation.raw_review is distinct from p_raw_review
 or v_observation.source_fingerprint is distinct from p_snapshot->>'source_fingerprint' then raise exception 'same native version changed' using errcode='22023';end if;
 if v_prior.snapshot is not null and (v_prior.snapshot->>'source_time_entry_version')::integer=(v_entry->>'version')::integer
 and (v_prior.snapshot-array['publication_revision','project_review_status']) is distinct from (p_snapshot-array['publication_revision','project_review_status'])
 then raise exception 'same native source revaluation denied' using errcode='22023';end if;
 end if;
 v_same_date:=v_prior.snapshot is not null and v_prior.snapshot->>'work_date'=p_snapshot->>'work_date';
 if p_snapshot->>'coverage'='complete' then
 if jsonb_typeof(p_snapshot->'rate_revision') is distinct from 'string' or jsonb_typeof(p_snapshot->'hourly_rate_minor') is distinct from 'number' or jsonb_typeof(p_snapshot->'amount_minor') is distinct from 'number'
 then raise exception 'native strict monetary types required' using errcode='22023';end if;
 if v_same_date then
 if v_prior.snapshot->>'coverage'<>'complete' or v_prior.snapshot->'rate_revision' is distinct from p_snapshot->'rate_revision'
 or v_prior.snapshot->'hourly_rate_minor' is distinct from p_snapshot->'hourly_rate_minor' then raise exception 'captured native rate changed' using errcode='22023';end if;
 else
 select count(*) into v_rate_count from public.operations_personnel_rate_history where organization_id=v_org and worker_id=v_worker and category='work' and currency=v_mapping.currency
 and effective_from<=v_mapping.work_date and (effective_to is null or v_mapping.work_date<effective_to);
 if v_rate_count<>1 then raise exception 'missing or ambiguous historical rate' using errcode='22023';end if;
 end if;
 select * into v_rate from public.operations_personnel_rate_history where organization_id=v_org and worker_id=v_worker and rate_revision=p_snapshot->>'rate_revision';
 if not found or v_rate.category<>'work' or v_rate.currency<>v_mapping.currency or v_rate.effective_from>v_mapping.work_date or (v_rate.effective_to is not null and v_mapping.work_date>=v_rate.effective_to)
 or (p_snapshot->>'hourly_rate_minor')::numeric is distinct from v_rate.hourly_rate_minor::numeric
 or floor((v_minutes*v_rate.hourly_rate_minor+30)/60) is distinct from (p_snapshot->>'amount_minor')::numeric
 or (p_snapshot->>'amount_minor')::numeric not between 0 and 9007199254740991
 then raise exception 'native historical amount mismatch' using errcode='22023';end if;
 elsif p_snapshot->>'coverage'='missing_rate' then
 if p_snapshot->'rate_revision'<>'null'::jsonb or p_snapshot->'hourly_rate_minor'<>'null'::jsonb or p_snapshot->'amount_minor'<>'null'::jsonb
 or (v_same_date and v_prior.snapshot->>'coverage'<>'missing_rate')
 or (not coalesce(v_same_date,false) and exists(select 1 from public.operations_personnel_rate_history where organization_id=v_org and worker_id=v_worker and category='work' and currency=v_mapping.currency
 and effective_from<=v_mapping.work_date and (effective_to is null or v_mapping.work_date<effective_to))) then raise exception 'native missing rate must remain null' using errcode='22023';end if;
 else raise exception 'native rate coverage required' using errcode='22023';end if;
 -- Operations decision survives only unchanged economic tuple, never source payroll authority.
 v_expected_review:=case when v_entry->>'status'='rejected' then 'rejected' else 'preliminary' end;
 if v_prior.snapshot is not null and v_entry->>'status'<>'rejected' and v_prior.snapshot->>'source_status'<>'rejected'
 and (select jsonb_object_agg(k,v_prior.snapshot->k) from unnest(array['organization_id','worker_id','project_id','obligation_id','currency','work_date','time_zone','source_organization_id','source_person_id','source_time_entry_id','minutes','rate_revision','hourly_rate_minor','amount_minor','coverage']) k)
 = (select jsonb_object_agg(k,p_snapshot->k) from unnest(array['organization_id','worker_id','project_id','obligation_id','currency','work_date','time_zone','source_organization_id','source_person_id','source_time_entry_id','minutes','rate_revision','hourly_rate_minor','amount_minor','coverage']) k)
 then v_expected_review:=v_prior.snapshot->>'project_review_status';end if;
 if p_snapshot->>'project_review_status' is distinct from v_expected_review then raise exception 'native publication cannot invent project attest' using errcode='42501';end if;
 if v_observation.id is null then
 insert into public.operations_catering_source_observations(organization_id,catering_organization_id,person_id,time_entry_id,entry_version,raw_entry,raw_review,raw_entry_sha256,raw_review_sha256,source_fingerprint,source_request_hash)
 values(v_org,v_source_org,v_person,v_entry_id,(v_entry->>'version')::integer,p_raw_entry,p_raw_review,
 encode(sha256(convert_to(p_raw_entry,'UTF8')),'hex'),case when p_raw_review is null then null else encode(sha256(convert_to(p_raw_review,'UTF8')),'hex') end,p_snapshot->>'source_fingerprint',p_source_request_hash) returning * into v_observation;
 end if;
 insert into public.operations_catering_cost_publications(organization_id,source_stream_id,source_revision,observation_id,mapping_id,snapshot,idempotency_key)
 values(v_org,v_stream,v_revision,v_observation.id,p_mapping_id,p_snapshot,p_idempotency_key);
 select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into v_destinations from jsonb_array_elements(jsonb_build_array(
 jsonb_build_object('project_id',v_mapping.project_id,'obligation_id',v_mapping.obligation_id),
 case when v_prior.snapshot is null then jsonb_build_object('project_id',v_mapping.project_id,'obligation_id',v_mapping.obligation_id)
 else jsonb_build_object('project_id',v_prior.snapshot->>'project_id','obligation_id',v_prior.snapshot->>'obligation_id') end));
 insert into public.operations_catering_cost_outbox(organization_id,source_stream_id,source_revision,destinations) values(v_org,v_stream,v_revision,v_destinations);
 update public.operations_catering_cost_streams set current_revision=v_revision where organization_id=v_org and source_stream_id=v_stream;
 return jsonb_build_object('outcome','accepted','source_revision',v_revision,'current_revision',v_revision,'observation_id',v_observation.id,'delivery_status','parked');
end;$$;
revoke all on function operations_catering_private.publish_operations_catering_cost_v1(jsonb,text,text,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function operations_catering_private.publish_operations_catering_cost_v1(jsonb,text,text,uuid,text,bigint,text) to service_role;

create function public.publish_operations_catering_cost_v1(p_snapshot jsonb,p_raw_entry text,p_raw_review text,p_mapping_id uuid,p_source_request_hash text,p_expected_revision bigint,p_idempotency_key text)
returns jsonb language sql security invoker set search_path='' as $$
 select operations_catering_private.publish_operations_catering_cost_v1(p_snapshot,p_raw_entry,p_raw_review,p_mapping_id,p_source_request_hash,p_expected_revision,p_idempotency_key);
$$;
revoke all on function public.publish_operations_catering_cost_v1(jsonb,text,text,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.publish_operations_catering_cost_v1(jsonb,text,text,uuid,text,bigint,text) to service_role;
