\set ON_ERROR_STOP on
-- Disposable native PostgreSQL fixture. The outer transaction is rolled back.
begin;
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists operations_economy_private;
do $$begin create role anon nologin; exception when duplicate_object then null;end$$;
do $$begin create role authenticated nologin; exception when duplicate_object then null;end$$;
do $$begin create role service_role nologin bypassrls; exception when duplicate_object then null;end$$;

create or replace function auth.role() returns text language sql stable set search_path=''
as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create or replace function public.operations_personnel_evidence_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'immutable' using errcode='55000';end$$;
create or replace function operations_economy_private.canonical_json_v1(p_value jsonb) returns text
language sql immutable set search_path='' as $$select p_value::text$$;
create or replace function operations_economy_private.scope_text_v1(p_value text,p_max int) returns boolean
language sql immutable set search_path='' as $$select p_value is not null and length(p_value) between 1 and p_max and btrim(p_value)=p_value$$;

create table public.operations_project_scope_heads(
 organization_id uuid not null,economic_scope_id uuid not null,root_kind text not null,root_id uuid not null,
 current_revision bigint not null,primary key(organization_id,economic_scope_id));
create table public.operations_project_scope_snapshots(
 snapshot_id uuid primary key,organization_id uuid not null,economic_scope_id uuid not null,scope_revision bigint not null,
 membership jsonb not null,membership_raw text not null,membership_fingerprint text not null,actor_system_user_id uuid not null,
 reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 integration_state text not null,shadow_only boolean not null,
 unique(organization_id,economic_scope_id,scope_revision),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id));

insert into public.operations_project_scope_heads values(
 '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','project',
 '33333333-3333-4333-8333-333333333333',1);
insert into public.operations_project_scope_snapshots values(
 '44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',1,
 '{"local_booking_ids":["Booking-A","Booking-B"],"source_project_ids":["33333333-3333-4333-8333-333333333333"]}',
 '{"local_booking_ids":["Booking-A","Booking-B"],"source_project_ids":["33333333-3333-4333-8333-333333333333"]}',
 repeat('a',64),'55555555-5555-4555-8555-555555555555','synthetic','scope-idem','{}',now(),'membership_only',true);

\ir ../../supabase/migrations/20261003120000_operations_catering_valuation_census_persistence_v1.sql

create function pg_temp.mapping_v1() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('booking_id','Booking-A','source_project_id','33333333-3333-4333-8333-333333333333',
      'obligation_id','66666666-6666-4666-8666-666666666661','mapping_revision','map-A-1'),
    jsonb_build_object('booking_id','Booking-B','source_project_id','33333333-3333-4333-8333-333333333333',
      'obligation_id','66666666-6666-4666-8666-666666666662','mapping_revision','map-B-1'));
$$;

create function pg_temp.line(p_event uuid,p_origin uuid,p_replaces uuid,p_amount bigint,p_issue text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('source_event_id',p_event,'economic_origin_id',p_origin,
    'replaces_source_event_id',p_replaces,'amount_minor',p_amount,'issue_code',p_issue);
$$;

create function pg_temp.head(p_booking text,p_basis text,p_currentness text,p_reason text,p_lines jsonb,p_suffix int)
returns jsonb language sql immutable as $$
  select jsonb_build_object('booking_id',p_booking,'basis',p_basis,'currentness',p_currentness,
    'unavailable_reason',p_reason,'source_stream_id',
      case p_booking||':'||p_basis
        when 'Booking-A:ingredient_estimate' then '81000000-0000-4000-8000-000000000001'::uuid
        when 'Booking-B:ingredient_estimate' then '81000000-0000-4000-8000-000000000002'::uuid
        when 'Booking-A:purchase_estimate' then '81000000-0000-4000-8000-000000000003'::uuid
        when 'Booking-B:purchase_estimate' then '81000000-0000-4000-8000-000000000004'::uuid
        when 'Booking-A:stock_consumption' then '81000000-0000-4000-8000-000000000005'::uuid
        else '81000000-0000-4000-8000-000000000006'::uuid end,
    'source_revision','r'||p_suffix::text,'source_fingerprint',encode(digest(p_booking||p_basis||p_suffix::text,'sha256'),'hex'),
    'currency','SEK','lines',p_lines,
    'source_observation_id',(md5('observation:'||p_booking||':'||p_basis||':'||p_suffix::text))::uuid,
    'source_sequence',p_suffix,'source_as_of','2026-01-0'||p_suffix::text||'T00:00:00Z',
    'previous_source_observation_id',case when p_suffix=1 then null else (md5('observation:'||p_booking||':'||p_basis||':'||(p_suffix-1)::text))::uuid end,
    'previous_source_sequence',case when p_suffix=1 then null else p_suffix-1 end,
    'previous_source_fingerprint',case when p_suffix=1 then null else encode(digest(p_booking||p_basis||(p_suffix-1)::text,'sha256'),'hex') end,
    'expected_effective_observed_revision',p_suffix-1,
    'expected_effective_source_observation_id',case when p_suffix=1 then null else (md5('observation:'||p_booking||':'||p_basis||':'||(p_suffix-1)::text))::uuid end,
    'expected_effective_source_sequence',case when p_suffix=1 then null else p_suffix-1 end,
    'expected_effective_source_fingerprint',case when p_suffix=1 then null else encode(digest(p_booking||p_basis||(p_suffix-1)::text,'sha256'),'hex') end,
    'mapping_revision',1,'mapping_fingerprint',encode(digest(pg_temp.mapping_v1()::text,'sha256'),'hex'));
$$;

create function pg_temp.heads_v1(p_revision int) returns jsonb language plpgsql immutable as $$
begin
 if p_revision=1 then return jsonb_build_array(
  pg_temp.head('Booking-A','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',null,0,null)),1),
  pg_temp.head('Booking-A','purchase_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003',null,500,null)),1),
  pg_temp.head('Booking-A','stock_consumption','current_empty',null,'[]',1),
  pg_temp.head('Booking-B','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',null,null,'missing_cost')),1),
  pg_temp.head('Booking-B','purchase_estimate','current_empty',null,'[]',1),
  pg_temp.head('Booking-B','stock_consumption','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000004',null,700,null)),1));
 end if;
 return jsonb_build_array(
  pg_temp.head('Booking-A','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',100,null)),2),
  pg_temp.head('Booking-A','purchase_estimate','unavailable','source_unreachable','[]',2),
  pg_temp.head('Booking-A','stock_consumption','current_empty',null,'[]',2),
  pg_temp.head('Booking-B','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',null,null,'missing_cost')),2),
  pg_temp.head('Booking-B','purchase_estimate','current_empty',null,'[]',2),
  pg_temp.head('Booking-B','stock_consumption','current_empty',null,'[]',2));
end;$$;

create function pg_temp.heads_v3() returns jsonb language sql immutable as $$
 select jsonb_build_array(
  pg_temp.head('Booking-A','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',100,null)),3),
  pg_temp.head('Booking-A','purchase_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003',null,500,null)),3)
    || jsonb_build_object(
      'expected_effective_observed_revision',1,
      'expected_effective_source_observation_id',(md5('observation:Booking-A:purchase_estimate:1'))::uuid,
      'expected_effective_source_sequence',1,
      'expected_effective_source_fingerprint',encode(digest('Booking-Apurchase_estimate1','sha256'),'hex')),
  pg_temp.head('Booking-A','stock_consumption','current_empty',null,'[]',3),
  pg_temp.head('Booking-B','ingredient_estimate','current',null,
    jsonb_build_array(pg_temp.line('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',null,null,'missing_cost')),3),
  pg_temp.head('Booking-B','purchase_estimate','current_empty',null,'[]',3),
  pg_temp.head('Booking-B','stock_consumption','current_empty',null,'[]',3));
$$;

create function pg_temp.command_v1(p_revision int,p_expected bigint,p_idem text) returns jsonb
language plpgsql immutable as $$
declare v_mapping jsonb:=pg_temp.mapping_v1();v_heads jsonb:=pg_temp.heads_v1(p_revision);v_previous_heads jsonb:=pg_temp.heads_v1(1);
begin
 return jsonb_build_object(
  'schema','operations-catering-valuation-persist.v1','organization_id','11111111-1111-4111-8111-111111111111',
  'economic_scope_id','22222222-2222-4222-8222-222222222222','expected_scope_revision',1,
  'expected_scope_fingerprint',repeat('a',64),'idempotency_key',p_idem,
  'mapping',jsonb_build_object('expected_revision',case when p_revision=1 then 0 else 1 end,
    'revision',1,'fingerprint',encode(digest(v_mapping::text,'sha256'),'hex'),'bookings',v_mapping),
  'census',jsonb_build_object('expected_observed_revision',p_expected,
    'census_id',case when p_revision=1 then '70000000-0000-4000-8000-000000000001' else '70000000-0000-4000-8000-000000000002' end,
    'census_revision',p_revision,'census_fingerprint',encode(digest(v_heads::text,'sha256'),'hex'),
    'previous_census_id',case when p_revision=1 then null else '70000000-0000-4000-8000-000000000001' end,
    'previous_census_revision',case when p_revision=1 then null else 1 end,
    'previous_census_fingerprint',case when p_revision=1 then null else encode(digest(v_previous_heads::text,'sha256'),'hex') end,
    'booking_basis_heads',v_heads));
end;$$;

create function pg_temp.command_v3(p_idem text) returns jsonb language plpgsql immutable as $$
declare v_mapping jsonb:=pg_temp.mapping_v1();v_heads jsonb:=pg_temp.heads_v3();v_previous_heads jsonb:=pg_temp.heads_v1(2);
begin
 return jsonb_build_object(
  'schema','operations-catering-valuation-persist.v1','organization_id','11111111-1111-4111-8111-111111111111',
  'economic_scope_id','22222222-2222-4222-8222-222222222222','expected_scope_revision',1,
  'expected_scope_fingerprint',repeat('a',64),'idempotency_key',p_idem,
  'mapping',jsonb_build_object('expected_revision',1,'revision',1,
    'fingerprint',encode(digest(v_mapping::text,'sha256'),'hex'),'bookings',v_mapping),
  'census',jsonb_build_object('expected_observed_revision',2,
    'census_id','70000000-0000-4000-8000-000000000003','census_revision',3,
    'census_fingerprint',encode(digest(v_heads::text,'sha256'),'hex'),
    'previous_census_id','70000000-0000-4000-8000-000000000002','previous_census_revision',2,
    'previous_census_fingerprint',encode(digest(v_previous_heads::text,'sha256'),'hex'),
    'booking_basis_heads',v_heads));
end;$$;

select set_config('request.jwt.claim.role','authenticated',false);
do $$begin
 perform public.publish_operations_catering_valuation_census_v1(pg_temp.command_v1(1,0,'auth-denied'));
 raise exception 'authenticated_role_was_accepted';
exception when insufficient_privilege then null;end$$;

select set_config('request.jwt.claim.role','service_role',false);
create temporary table receipts(value jsonb);
insert into receipts select public.publish_operations_catering_valuation_census_v1(pg_temp.command_v1(1,0,'census-1'));
do $$begin
 if (select value->>'outcome' from receipts limit 1)<>'accepted' then raise exception 'initial_receipt_missing';end if;
 if (select value->'economic_total_minor' from receipts limit 1)<>'null'::jsonb then raise exception 'total_was_invented';end if;
 if (select current_observed_revision from public.operations_catering_valuation_census_heads)<>1 then raise exception 'observed_head_not_one';end if;
 if (select amount_minor from public.operations_catering_valuation_origin_events where source_event_id='82000000-0000-4000-8000-000000000001')<>0 then raise exception 'explicit_zero_not_preserved';end if;
 if (select amount_minor is null and issue_code='missing_cost' from public.operations_catering_valuation_origin_events where source_event_id='82000000-0000-4000-8000-000000000002') is not true then raise exception 'null_cost_not_preserved';end if;
end$$;

do $$declare v jsonb;begin
 v:=public.publish_operations_catering_valuation_census_v1(pg_temp.command_v1(1,0,'census-1'));
 if v->>'outcome'<>'replayed' or v->>'observed_revision'<>'1' then raise exception 'exact_replay_failed';end if;
end$$;
do $$declare v jsonb:=pg_temp.command_v1(1,0,'census-1');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_revision}','"changed"');
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'changed_replay_was_accepted';
exception when unique_violation then null;end$$;

-- A cross-booking origin replay is denied atomically before the valid successor.
do $$declare v jsonb:=pg_temp.command_v1(2,1,'cross-booking-origin');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,3,lines,0,economic_origin_id}','"83000000-0000-4000-8000-000000000003"');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'cross_booking_origin_was_accepted';
exception when unique_violation then null;end$$;

-- Delayed/reordered observations and mapping substitutions fail before any head advances.
do $$declare v jsonb:=pg_temp.command_v1(2,1,'delayed-empty');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,currentness}','"current_empty"');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,unavailable_reason}','null');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines}','[]');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_observation_id}',to_jsonb((md5('observation:Booking-A:ingredient_estimate:1'))::uuid));
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_sequence}','1');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_as_of}','"2026-01-01T00:00:00Z"');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_observation_id}','null');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_sequence}','null');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_fingerprint}','null');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'delayed_empty_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,1,'sequence-gap');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_sequence}','3');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_sequence}','2');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_observation_id}',to_jsonb((md5('observation:Booking-A:ingredient_estimate:2'))::uuid));
 v:=jsonb_set(v,'{census,booking_basis_heads,0,previous_source_fingerprint}',to_jsonb(encode(digest('Booking-Aingredient_estimate2','sha256'),'hex')));
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'source_sequence_gap_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,1,'source-stream-substitution');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_stream_id}','"81000000-0000-4000-8000-000000000099"');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'source_stream_substitution_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,1,'nonmonotonic-as-of');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,source_as_of}','"2026-01-01T00:00:00Z"');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'nonmonotonic_as_of_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,1,'effective-predecessor-mismatch');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,expected_effective_source_fingerprint}',to_jsonb(repeat('0',64)));
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'effective_predecessor_mismatch_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,1,'mapping-substitution');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,mapping_fingerprint}',to_jsonb(repeat('0',64)));
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'mapping_substitution_was_accepted';
exception when data_exception then null;end$$;

insert into receipts select public.publish_operations_catering_valuation_census_v1(pg_temp.command_v1(2,1,'census-2'));
do $$begin
 if (select current_observed_revision from public.operations_catering_valuation_census_heads)<>2 then raise exception 'observed_head_not_two';end if;
 if (select effective_observed_revision from public.operations_catering_valuation_effective_basis_heads where booking_id='Booking-A' and basis='purchase_estimate')<>1 then raise exception 'unavailable_destroyed_prior_authority';end if;
 if (select source_sequence from public.operations_catering_valuation_observed_source_heads where booking_id='Booking-A' and basis='purchase_estimate')<>2 then raise exception 'unavailable_observation_not_recorded';end if;
 if (select source_sequence from public.operations_catering_valuation_effective_basis_heads where booking_id='Booking-A' and basis='purchase_estimate')<>1 then raise exception 'unavailable_changed_effective_source';end if;
 if (select currentness from public.operations_catering_valuation_effective_basis_heads where booking_id='Booking-B' and basis='stock_consumption')<>'current_empty' then raise exception 'current_empty_not_authoritative';end if;
 if (select replaces_source_event_id from public.operations_catering_valuation_origin_events where source_event_id='82000000-0000-4000-8000-000000000011')<>'82000000-0000-4000-8000-000000000001' then raise exception 'correction_not_linked';end if;
 if (select count(*) from public.operations_catering_valuation_origin_ownership)<>4 then raise exception 'origin_ownership_wrong';end if;
 if (select count(*) from public.operations_catering_valuation_basis_observations where observed_revision=2 and booking_id in('Booking-A','Booking-B'))<>6 then raise exception 'two_booking_history_missing';end if;
end$$;

-- The current observed CAS cannot be paired with an older non-current predecessor.
do $$declare v jsonb:=pg_temp.command_v1(2,2,'fork-from-census-1');begin
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'global_census_fork_was_accepted';
exception when unique_violation then null;end$$;

-- A delayed correction cannot fork an origin after its newer effective event.
do $$declare v jsonb:=pg_temp.command_v3('stale-old-event');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines,0,source_event_id}','"82000000-0000-4000-8000-000000000001"');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines,0,replaces_source_event_id}','null');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines,0,amount_minor}','0');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'stale_old_source_event_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v3('duplicate-command-origin');v_line jsonb;begin
 v_line:=(v#>'{census,booking_basis_heads,0,lines,0}') ||
   jsonb_build_object('source_event_id','82000000-0000-4000-8000-000000000013');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines}',
   (v#>'{census,booking_basis_heads,0,lines}')||jsonb_build_array(v_line));
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'duplicate_command_origin_was_accepted';
exception when data_exception then null;end$$;
do $$declare v jsonb:=pg_temp.command_v3('reordered-correction');begin
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines,0,source_event_id}','"82000000-0000-4000-8000-000000000012"');
 v:=jsonb_set(v,'{census,booking_basis_heads,0,lines,0,replaces_source_event_id}','"82000000-0000-4000-8000-000000000001"');
 v:=jsonb_set(v,'{census,census_fingerprint}',to_jsonb(encode(digest((v#>'{census,booking_basis_heads}')::text,'sha256'),'hex')));
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'reordered_correction_was_accepted';
exception when unique_violation then null;end$$;

-- An exact current successor after unavailable advances effective authority from its retained predecessor.
insert into receipts select public.publish_operations_catering_valuation_census_v1(pg_temp.command_v3('census-3'));
do $$begin
 if (select current_observed_revision from public.operations_catering_valuation_census_heads)<>3 then raise exception 'observed_head_not_three';end if;
 if (select source_sequence from public.operations_catering_valuation_observed_source_heads where booking_id='Booking-A' and basis='purchase_estimate')<>3 then raise exception 'recovered_observation_not_current';end if;
 if (select effective_observed_revision from public.operations_catering_valuation_effective_basis_heads where booking_id='Booking-A' and basis='purchase_estimate')<>3 then raise exception 'recovered_effective_head_not_advanced';end if;
 if (select source_sequence from public.operations_catering_valuation_effective_basis_heads where booking_id='Booking-A' and basis='purchase_estimate')<>3 then raise exception 'recovered_effective_source_not_advanced';end if;
end$$;

do $$begin
 perform public.publish_operations_catering_valuation_census_v1(pg_temp.command_v1(2,1,'stale-observed'));
 raise exception 'stale_observed_cas_was_accepted';
exception when unique_violation then null;end$$;
do $$declare v jsonb:=pg_temp.command_v1(2,2,'foreign-tenant');begin
 v:=jsonb_set(v,'{organization_id}','"99999999-9999-4999-8999-999999999999"');
 perform public.publish_operations_catering_valuation_census_v1(v);raise exception 'foreign_tenant_was_accepted';
exception when unique_violation then null;end$$;

-- Additive/rollback compatibility: the pre-existing scope authority is unchanged.
do $$begin
 if (select current_revision from public.operations_project_scope_heads where organization_id='11111111-1111-4111-8111-111111111111')<>1 then raise exception 'scope_authority_changed';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='operations_project_scope_heads' and column_name like 'catering%') then raise exception 'legacy_scope_table_mutated';end if;
end$$;

rollback;
