-- Additive candidate, DEFAULT OFF: private signed cursor cache and authenticated admission.
-- Historical inventory/permit/recovery and native authorization remain separate unfinished gates.
-- Existing allocation/producer/claim guards are not weakened; historical Ops maps stay disabled.
create schema operations_catering_reconciliation_private;
revoke all on schema operations_catering_reconciliation_private from public,anon;
grant usage on schema operations_catering_reconciliation_private to authenticated,service_role;
create table operations_catering_reconciliation_private.gates (
 organization_id uuid primary key,enabled boolean not null default false
);
create table operations_catering_reconciliation_private.cursor_verification_keys (
 key_id text primary key check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),organization_id uuid not null,
 finance_organization_id uuid not null,route_id uuid not null,route_revision text not null,
 secret text not null check(octet_length(secret)>=32),enabled boolean not null default false,
 check(length(route_revision) between 1 and 200 and route_revision=operations_catering_allocation_private.trim_command_text_v2(route_revision))
);
create table operations_catering_reconciliation_private.verified_cursors (
 cursor_id uuid primary key,key_id text not null references operations_catering_reconciliation_private.cursor_verification_keys(key_id),
 organization_id uuid not null,finance_organization_id uuid not null,source_stream_id text not null,
 finance_snapshot_id uuid not null,publication_revision bigint not null,allocation_event_id uuid,allocation_revision bigint not null,
 cursor_sha256 text not null,proof jsonb not null,raw_body text not null check(octet_length(raw_body)<=262144),body_sha256 text not null,
 response_timestamp text not null,request_nonce text not null,response_signature text not null,
 issued_at timestamptz not null,expires_at timestamptz not null,verified_at timestamptz not null default clock_timestamp(),
 check(expires_at=issued_at+interval '60 seconds'),unique(key_id,request_nonce)
);
do $$declare t text;begin
 foreach t in array array['gates','cursor_verification_keys','verified_cursors'] loop
 execute format('alter table operations_catering_reconciliation_private.%I enable row level security',t);
 execute format('revoke all on operations_catering_reconciliation_private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger %I before truncate on operations_catering_reconciliation_private.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;
end;$$;
grant select,insert on operations_catering_reconciliation_private.gates to service_role;
grant update(enabled) on operations_catering_reconciliation_private.gates to service_role;
grant select on operations_catering_reconciliation_private.verified_cursors to service_role;
-- Dedicated response verification secret: OWNER-provisioned only, never returned to service/browser.
create trigger reconciliation_gate_identity before update or delete on operations_catering_reconciliation_private.gates
 for each row execute function public.operations_catering_mapping_guard();
create trigger reconciliation_key_identity before update or delete on operations_catering_reconciliation_private.cursor_verification_keys
 for each row execute function public.operations_catering_mapping_guard();
create trigger reconciliation_cursor_immutable before update or delete on operations_catering_reconciliation_private.verified_cursors
 for each row execute function public.operations_personnel_evidence_immutable();
create function operations_catering_reconciliation_private.hmac_sha256_v1(k bytea,m bytea) returns bytea
 language plpgsql immutable strict security invoker set search_path='' as $$
declare key_bytes bytea:=k;inner_pad bytea:=decode(repeat('00',64),'hex');outer_pad bytea:=decode(repeat('00',64),'hex');i integer;
begin
 if octet_length(key_bytes)>64 then key_bytes:=sha256(key_bytes);end if;
 key_bytes:=key_bytes||decode(repeat('00',64-octet_length(key_bytes)),'hex');
 for i in 0..63 loop
 inner_pad:=set_byte(inner_pad,i,get_byte(key_bytes,i)#54);outer_pad:=set_byte(outer_pad,i,get_byte(key_bytes,i)#92);
 end loop;
 return sha256(outer_pad||sha256(inner_pad||m));
end;$$;
revoke all on function operations_catering_reconciliation_private.hmac_sha256_v1(bytea,bytea) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.json_guard_v1(p json,depth integer default 0) returns void
 language plpgsql immutable security invoker set search_path='' as $$
declare item record;v json;t text;
begin
 if depth>64 then raise exception 'reconciliation JSON invalid' using errcode='22023';end if;
 case json_typeof(p)
 when 'object' then
 if exists(select 1 from json_each(p) group by key having count(*)>1) then raise exception 'reconciliation duplicate key' using errcode='22023';end if;
 for item in select * from json_each(p) loop perform operations_catering_reconciliation_private.json_guard_v1(item.value,depth+1);end loop;
 when 'array' then for v in select * from json_array_elements(p) loop perform operations_catering_reconciliation_private.json_guard_v1(v,depth+1);end loop;
 when 'number' then t:=p::text;
 if t !~ '^-?(0|[1-9][0-9]*)$' or t='-0' or abs(t::numeric)>9007199254740991 then raise exception 'reconciliation number invalid' using errcode='22023';end if;
 else null;
 end case;
end;$$;
revoke all on function operations_catering_reconciliation_private.json_guard_v1(json,integer) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.stamp_v1(p jsonb) returns timestamptz
 language plpgsql immutable security invoker set search_path='' as $$
declare s text;v timestamptz;
begin
 if jsonb_typeof(p) is distinct from 'string' then raise exception 'reconciliation timestamp invalid' using errcode='22023';end if;
 s:=p#>>'{}';
 if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' then raise exception 'reconciliation timestamp invalid' using errcode='22023';end if;
 begin v:=s::timestamptz;exception when others then raise exception 'reconciliation timestamp invalid' using errcode='22023';end;
 if to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')<>s then raise exception 'reconciliation timestamp invalid' using errcode='22023';end if;return v;
end;$$;
revoke all on function operations_catering_reconciliation_private.stamp_v1(jsonb) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.exact_v1(p jsonb,keys text[]) returns void
 language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>cardinality(keys)
 or exists(select 1 from unnest(keys) k where not p?k) then
 raise exception 'reconciliation shape invalid' using errcode='22023';end if;
end;$$;
revoke all on function operations_catering_reconciliation_private.exact_v1(jsonb,text[]) from public,anon,authenticated,service_role;
-- New protocol timestamps use six microsecond digits. Original source timestamp strings stay unchanged.
create function operations_catering_reconciliation_private.hash_v1(domain text,p jsonb) returns text
 language plpgsql immutable security invoker set search_path='' as $$
begin
 if domain not in ('eventflow.catering.reconciliation.cursor.v1','eventflow.catering.reconciliation.map.v1',
 'eventflow.catering.reconciliation.mapset.v1','eventflow.catering.reconciliation.step.v1',
 'eventflow.catering.reconciliation.history.v1','eventflow.catering.reconciliation.link.v1',
 'eventflow.catering.reconciliation.preview.v1','eventflow.catering.reconciliation.permit.v1')
 or domain is null or jsonb_typeof(p) is distinct from 'object'
 or exists(select 1 from jsonb_each(p) where key !~ '^[a-z][a-z0-9_]*$' or jsonb_typeof(value) not in ('null','boolean','number','string')
 or (jsonb_typeof(value)='number' and ((value::text)::numeric<>trunc((value::text)::numeric) or abs((value::text)::numeric)>9007199254740991))) then
 raise exception 'reconciliation hash input invalid' using errcode='22023';end if;
 case domain
 when 'eventflow.catering.reconciliation.cursor.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['schema_version','cursor_id','operations_organization_id','finance_organization_id','source_stream_id','snapshot_id','publication_revision','allocation_event_id','allocation_revision','snapshot_body_sha256']);
 when 'eventflow.catering.reconciliation.map.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['mapping_id','mapping_revision','source_project_id','source_obligation_id','destination_project_id','currency']);
 when 'eventflow.catering.reconciliation.mapset.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['current_map_sha256','retirement_map_sha256']);
 when 'eventflow.catering.reconciliation.step.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['index','publication_revision','allocation_revision','event_id','event_fingerprint','source_outbox_id','source_observation_id','source_mapping_id','source_entry_version','source_cost_fingerprint','raw_entry_sha256','raw_review_sha256','delivery_body_sha256','previous_body_sha256','previous_publication_revision','route_id','route_revision','key_id','destination_capabilities_sha256']);
 when 'eventflow.catering.reconciliation.history.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['cursor_sha256','step_count']);
 when 'eventflow.catering.reconciliation.link.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['index','previous_link_sha256','step_sha256']);
 when 'eventflow.catering.reconciliation.preview.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['schema_version','organization_id','destination_organization_id','source_stream_id','cursor_sha256','history_root_sha256','step_count','latest_publication_revision','latest_allocation_revision','latest_event_id','latest_observation_id','latest_mapping_id','latest_body_sha256','route_id']);
 when 'eventflow.catering.reconciliation.permit.v1' then perform operations_catering_reconciliation_private.exact_v1(p,array['schema_version','permit_id','organization_id','destination_organization_id','source_stream_id','actor_system_user_id','idempotency_key','reason','created_at','expires_at','cursor_sha256','preview_sha256','history_root_sha256','step_count','expected_publication_revision','expected_allocation_revision','expected_event_id','expected_observation_id','expected_mapping_id','route_id','route_revision','key_id']);
 else raise exception 'reconciliation hash domain invalid' using errcode='22023';
 end case;
 return encode(sha256(convert_to(domain||E'\n'||operations_catering_private.canonical_source_json_v1(p),'UTF8')),'hex');
end;$$;
revoke all on function operations_catering_reconciliation_private.hash_v1(text,jsonb) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.resolve_cursor_v1(p_key_id text,p_timestamp text,p_nonce text,p_signature text,p_raw_body text)
 returns operations_catering_reconciliation_private.verified_cursors language plpgsql security definer set search_path='' as $$
declare key operations_catering_reconciliation_private.cursor_verification_keys%rowtype;
 result operations_catering_reconciliation_private.verified_cursors%rowtype;
 proof jsonb;c jsonb;k text;issued timestamptz;expires timestamptz;actual_signature bytea;expected_signature bytea;
 difference integer:=0;i integer;fp text;raw_hash text;message text;
 cursor_keys text[]:=array['schema_version','cursor_id','operations_organization_id','finance_organization_id','source_stream_id','snapshot_id','publication_revision','allocation_event_id','allocation_revision','snapshot_body_sha256'];
begin
 perform set_config('lock_timeout','3s',true);
 if p_key_id is null or p_key_id !~ '^[A-Za-z0-9_-]{4,64}$' or p_timestamp is null or p_timestamp !~ '^[0-9]{10}$'
 or abs(floor(extract(epoch from clock_timestamp()))-p_timestamp::bigint)>120 or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,128}$'
 or p_signature is null or p_signature !~ '^cursor-v1=[0-9a-f]{64}$' or p_raw_body is null or octet_length(p_raw_body)>262144
 then raise exception 'reconciliation cursor signature denied' using errcode='42501';end if;
 select * into key from operations_catering_reconciliation_private.cursor_verification_keys where key_id=p_key_id for share;
 if not found or not key.enabled then raise exception 'reconciliation cursor key denied' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.gates where organization_id=key.organization_id and enabled for share;
 if not found then raise exception 'reconciliation authority disabled' using errcode='42501';end if;
 message:=array_to_string(array['RESPONSE','operations-catering-backlog-cursor-read','operations-catering-reconciliation-cursor-proof.v1',p_key_id,p_timestamp,p_nonce,p_raw_body],E'\n');
 expected_signature:=operations_catering_reconciliation_private.hmac_sha256_v1(convert_to(key.secret,'UTF8'),convert_to(message,'UTF8'));
 actual_signature:=decode(substr(p_signature,11),'hex');
 for i in 0..31 loop difference:=difference | (get_byte(actual_signature,i)#get_byte(expected_signature,i));end loop;
 if difference<>0 then raise exception 'reconciliation cursor signature denied' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.json_guard_v1(p_raw_body::json);proof:=p_raw_body::jsonb;c:=proof->'cursor';
 if jsonb_typeof(proof) is distinct from 'object' or not(proof ?& array['cursor','cursor_sha256','issued_at','expires_at'])
 or proof-array['cursor','cursor_sha256','issued_at','expires_at']<>'{}'::jsonb
 or jsonb_typeof(c) is distinct from 'object' or not(c ?& cursor_keys) or c-cursor_keys<>'{}'::jsonb
 or c->>'schema_version' is distinct from 'operations-catering-reconciliation-cursor.v1'
 then raise exception 'reconciliation cursor shape invalid' using errcode='22023';end if;
 foreach k in array array['cursor_id','operations_organization_id','finance_organization_id','snapshot_id'] loop
 if jsonb_typeof(c->k) is distinct from 'string' or c->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'reconciliation cursor UUID invalid' using errcode='22023';end if;end loop;
 foreach k in array array['publication_revision','allocation_revision'] loop
 if jsonb_typeof(c->k) is distinct from 'number' or (c->>k)::numeric<>trunc((c->>k)::numeric)
 or (c->>k)::numeric not between (case when k='allocation_revision' then 0 else 1 end) and 9007199254740991
 then raise exception 'reconciliation cursor revision invalid' using errcode='22023';end if;end loop;
 if jsonb_typeof(c->'source_stream_id') is distinct from 'string' or c->>'source_stream_id' !~ '^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(c->'snapshot_body_sha256') is distinct from 'string' or c->>'snapshot_body_sha256' !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(proof->'cursor_sha256') is distinct from 'string' or proof->>'cursor_sha256' !~ '^[0-9a-f]{64}$'
 or c->>'operations_organization_id' is distinct from key.organization_id::text or c->>'finance_organization_id' is distinct from key.finance_organization_id::text
 or ((c->>'allocation_revision'='0') is distinct from (c->'allocation_event_id'='null'::jsonb))
 or (c->>'allocation_revision'<>'0' and (jsonb_typeof(c->'allocation_event_id') is distinct from 'string' or c->>'allocation_event_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 then raise exception 'reconciliation cursor scope invalid' using errcode='22023';end if;
 fp:=operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.cursor.v1',c);
 if proof->>'cursor_sha256' is distinct from fp then raise exception 'reconciliation cursor commitment invalid' using errcode='22023';end if;
 issued:=operations_catering_reconciliation_private.stamp_v1(proof->'issued_at');expires:=operations_catering_reconciliation_private.stamp_v1(proof->'expires_at');
 if expires<>issued+interval '60 seconds' or clock_timestamp()<issued or clock_timestamp()>=expires then raise exception 'reconciliation cursor expired/future' using errcode='42501';end if;
 result.cursor_id:=(c->>'cursor_id')::uuid;result.key_id:=p_key_id;
 result.organization_id:=key.organization_id;result.finance_organization_id:=key.finance_organization_id;
 result.source_stream_id:=c->>'source_stream_id';result.finance_snapshot_id:=(c->>'snapshot_id')::uuid;
 result.publication_revision:=(c->>'publication_revision')::bigint;result.allocation_event_id:=(c->>'allocation_event_id')::uuid;
 result.allocation_revision:=(c->>'allocation_revision')::bigint;result.cursor_sha256:=fp;result.proof:=proof;
 result.raw_body:=p_raw_body;result.body_sha256:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 result.response_timestamp:=p_timestamp;result.request_nonce:=p_nonce;result.response_signature:=p_signature;
 result.issued_at:=issued;result.expires_at:=expires;return result;
end;$$;
revoke all on function operations_catering_reconciliation_private.resolve_cursor_v1(text,text,text,text,text) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.cursor_insert_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare expected operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 expected:=operations_catering_reconciliation_private.resolve_cursor_v1(new.key_id,new.response_timestamp,new.request_nonce,new.response_signature,new.raw_body);
 if (to_jsonb(new)-'verified_at') is distinct from (to_jsonb(expected)-'verified_at') then
 raise exception 'verified cursor metadata differs from signed original proof' using errcode='22023';end if;
 new.verified_at:=clock_timestamp();return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.cursor_insert_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_cursor_insert_guard before insert on operations_catering_reconciliation_private.verified_cursors
 for each row execute function operations_catering_reconciliation_private.cursor_insert_guard_v1();
create function operations_catering_reconciliation_private.verify_cursor_v1(p_key_id text,p_timestamp text,p_nonce text,p_signature text,p_raw_body text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare resolved operations_catering_reconciliation_private.verified_cursors%rowtype;
 saved operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 resolved:=operations_catering_reconciliation_private.resolve_cursor_v1(p_key_id,p_timestamp,p_nonce,p_signature,p_raw_body);
 perform pg_advisory_xact_lock(hashtextextended('operations-catering-verified-cursor:'||p_key_id||':'||p_nonce,0));
 if clock_timestamp()>=resolved.expires_at or abs(floor(extract(epoch from clock_timestamp()))-p_timestamp::bigint)>120 then raise exception 'reconciliation cursor expired after lock' using errcode='42501';end if;
 select * into saved from operations_catering_reconciliation_private.verified_cursors where cursor_id=resolved.cursor_id;
 if found then
 if (to_jsonb(saved)-'verified_at') is distinct from (to_jsonb(resolved)-'verified_at') then
 raise exception 'reconciliation immutable cursor proof conflict' using errcode='22023';end if;
 return jsonb_build_object('outcome','replayed','cursor_id',saved.cursor_id,'cursor_sha256',saved.cursor_sha256);
 end if;
 resolved.verified_at:=clock_timestamp();
 insert into operations_catering_reconciliation_private.verified_cursors select (resolved).*;
 return jsonb_build_object('outcome','verified','cursor_id',resolved.cursor_id,'cursor_sha256',resolved.cursor_sha256);
end;$$;
revoke all on function operations_catering_reconciliation_private.verify_cursor_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function operations_catering_reconciliation_private.verify_cursor_v1(text,text,text,text,text) to service_role;
create function public.verify_operations_catering_finance_cursor_v1(p_key_id text,p_timestamp text,p_nonce text,p_signature text,p_raw_body text)
 returns jsonb language sql security invoker set search_path='' as $$
 select operations_catering_reconciliation_private.verify_cursor_v1(p_key_id,p_timestamp,p_nonce,p_signature,p_raw_body);
$$;
revoke all on function public.verify_operations_catering_finance_cursor_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.verify_operations_catering_finance_cursor_v1(text,text,text,text,text) to service_role;

-- Private admission prerequisite ONLY: cache integrity and ordinary delivered
-- eligibility do not themselves authorize a new allocation event or permit.
-- The future authenticated wrapper must lock/recheck live admin, mapping,
-- stream/head, source enrollment, projects/obligation and these exact facts.
-- Fail closed until the separately signed Finance-own original receipt lookup/cache exists.
-- A signed cursor snapshot does not authenticate a locally declared receipt UUID.
create function operations_catering_reconciliation_private.require_verified_original_receipt_v1(p_cursor_id uuid,p_receipt jsonb)
 returns void language plpgsql security definer set search_path='' as $$
begin
 raise exception 'independent original receipt proof unavailable' using errcode='42501';
end;$$;
revoke all on function operations_catering_reconciliation_private.require_verified_original_receipt_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.delivery_eligibility_v1(p_cursor_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;
 resolved operations_catering_reconciliation_private.verified_cursors%rowtype;
 pub public.operations_catering_cost_publications%rowtype;
 head operations_catering_allocation_private.heads%rowtype;
 receipt jsonb;captured jsonb;delivery_id uuid;raw text;body_hash text;recipient uuid;schema_name text;k text;
 keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 if p_cursor_id is null then raise exception 'admission cursor required' using errcode='22023';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found then raise exception 'admission verified cursor missing' using errcode='42501';end if;
 -- This repeats dedicated signature/current key/gate/expiry validation; a saved
 -- verification row or caller GUC is never a fresh permission exemption.
 resolved:=operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 if to_jsonb(c)-'verified_at' is distinct from to_jsonb(resolved)-'verified_at' then raise exception 'admission cached facts drifted' using errcode='22023';end if;
 select p.* into pub from public.operations_catering_cost_streams s join public.operations_catering_cost_publications p
 on p.organization_id=s.organization_id and p.source_stream_id=s.source_stream_id and p.source_revision=s.current_revision
 where s.organization_id=c.organization_id and s.source_stream_id=c.source_stream_id;
 if not found or pub.source_revision<>c.publication_revision then raise exception 'admission Finance cursor not current local publication' using errcode='42501';end if;
 select * into head from operations_catering_allocation_private.heads where organization_id=c.organization_id and source_stream_id=c.source_stream_id;
 if c.allocation_revision=0 then
 if head.organization_id is not null or c.allocation_event_id is not null then raise exception 'admission initial authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered')<>1 then raise exception 'admission unique original v1 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered';
 schema_name:='operations-catering-receipt.v1';
 else
 if head.current_revision is distinct from c.allocation_revision or head.current_event_id is distinct from c.allocation_event_id then raise exception 'admission adopted authority mismatch' using errcode='42501';end if;
 if (select count(*) from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered')<>1 then raise exception 'admission unique original v2 delivery required' using errcode='42501';end if;
 select q.id,q.last_receipt,q.raw_body,q.body_sha256,q.destination_organization_id,q.envelope into delivery_id,receipt,raw,body_hash,recipient,captured
 from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered';
 schema_name:='operations-catering-receipt.v2';
 end if;
 if delivery_id is null or raw is null or captured is distinct from raw::jsonb
 or captured->'snapshot' is distinct from pub.snapshot
 or captured->>'source_observation_id' is distinct from pub.observation_id::text
 or captured->>'source_mapping_id' is distinct from pub.mapping_id::text
 or captured->>'operations_organization_id' is distinct from c.organization_id::text
 or captured->>'source_stream_id' is distinct from c.source_stream_id
 or captured->>'schema_version' is distinct from (case when c.allocation_revision=0 then 'operations-catering-delivery.v1' else 'operations-catering-delivery.v2' end)
 or (c.allocation_revision>0 and captured->'allocation_event'->>'event_id' is distinct from c.allocation_event_id::text)
 or body_hash is distinct from encode(sha256(convert_to(raw,'UTF8')),'hex')
 or recipient is distinct from c.finance_organization_id or jsonb_typeof(receipt) is distinct from 'object'
 or not(receipt ?& keys) or receipt-keys<>'{}'::jsonb
 or receipt->>'schema' is distinct from schema_name or receipt->>'outcome' not in ('accepted','replayed')
 or jsonb_typeof(receipt->'outcome') is distinct from 'string' or receipt->'shadow_only' is distinct from 'true'::jsonb
 or receipt->>'source_organization_id' is distinct from c.organization_id::text or receipt->>'source_stream_id' is distinct from c.source_stream_id
 or receipt->>'destination_organization_id' is distinct from c.finance_organization_id::text
 or receipt->>'request_body_sha256' is distinct from body_hash or receipt->>'snapshot_fingerprint' is distinct from body_hash
 or receipt->>'snapshot_fingerprint' is distinct from c.proof->'cursor'->>'snapshot_body_sha256'
 or receipt->>'snapshot_receipt_id' is distinct from c.finance_snapshot_id::text
 then raise exception 'admission original delivered receipt binding denied' using errcode='42501';end if;
 foreach k in array array['snapshot_receipt_id','receipt_id'] loop
 if jsonb_typeof(receipt->k) is distinct from 'string' or receipt->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'admission receipt identity invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['requested_source_revision','applied_source_revision','current_source_revision'] loop
 if jsonb_typeof(receipt->k) is distinct from 'number' or receipt->k is distinct from to_jsonb(c.publication_revision) then raise exception 'admission receipt current revision invalid' using errcode='42501';end if;
 end loop;
 perform operations_catering_reconciliation_private.require_verified_original_receipt_v1(c.cursor_id,receipt);
 if clock_timestamp()>=c.expires_at then raise exception 'admission cursor expired after eligibility read' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256,'organization_id',c.organization_id,
 'source_stream_id',c.source_stream_id,'publication_revision',c.publication_revision,'allocation_revision',c.allocation_revision,
 'allocation_event_id',c.allocation_event_id,'mapping_id',pub.mapping_id,'observation_id',pub.observation_id,
 'delivery_id',delivery_id,'receipt_id',receipt->'receipt_id','finance_snapshot_id',c.finance_snapshot_id,
 'receipt_schema',schema_name,'body_sha256',body_hash);
end;$$;
revoke all on function operations_catering_reconciliation_private.delivery_eligibility_v1(uuid) from public,anon,authenticated,service_role;

-- Authenticated, one-transaction admission. Finance's signed cursor remains
-- independent remote evidence; the original delivered queue is eligibility only.
create table operations_catering_reconciliation_private.admissions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,source_stream_id text not null,
 actor_system_user_id uuid not null,idempotency_key text not null,command jsonb not null,command_sha256 text not null,
 cursor_id uuid not null references operations_catering_reconciliation_private.verified_cursors(cursor_id),cursor_sha256 text not null,
 base_publication_revision bigint not null,base_allocation_revision bigint not null,base_mapping_id uuid not null,
 base_observation_id uuid not null,delivery_id uuid not null,receipt_id uuid not null,
 previous_finance_mapping_id uuid not null references operations_catering_private.finance_delivery_maps(mapping_id),
 next_finance_mapping_id uuid not null references operations_catering_private.finance_delivery_maps(mapping_id),
 prospective_allocation_revision bigint not null,prospective_publication_revision bigint not null,
 creation_transaction bigint not null,created_at timestamptz not null,consumed_event_id uuid,
 unique(organization_id,idempotency_key),unique(consumed_event_id),
 foreign key(organization_id,consumed_event_id) references operations_catering_allocation_private.events(organization_id,event_id) deferrable initially deferred
);
alter table operations_catering_reconciliation_private.admissions enable row level security;
revoke all on operations_catering_reconciliation_private.admissions from public,anon,authenticated,service_role;
grant select on operations_catering_reconciliation_private.admissions to service_role;
create trigger reconciliation_admissions_no_truncate before truncate on operations_catering_reconciliation_private.admissions for each statement execute function public.operations_personnel_evidence_immutable();


create function operations_catering_reconciliation_private.lock_cursor_route_v1(p_cursor_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;
 selected_route_id uuid;selected_route_revision text;selected_key_id text;endpoint text;recipient uuid;n bigint;begin
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found then raise exception 'admission verified cursor missing' using errcode='42501';end if;
 if c.allocation_revision=0 then
 select count(*) into n from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered';
 if n<>1 then raise exception 'admission exact v1 cursor queue required' using errcode='42501';end if;
 select q.route_id,q.route_revision,q.key_id,q.endpoint_url,q.destination_organization_id into selected_route_id,selected_route_revision,selected_key_id,endpoint,recipient from operations_catering_private.finance_delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.status='delivered';
 perform 1 from operations_catering_private.finance_delivery_gates g where g.organization_id=c.organization_id and g.enabled for share;
 if not found then raise exception 'admission original v1 transport gate revoked' using errcode='42501';end if;
 perform 1 from operations_catering_private.finance_delivery_routes r where r.id=selected_route_id and r.organization_id=c.organization_id and r.destination_organization_id=c.finance_organization_id and r.destination_organization_id=recipient and r.route_revision=selected_route_revision and r.key_id=selected_key_id and r.endpoint_url=endpoint and r.enabled for share;
 else
 select count(*) into n from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered';
 if n<>1 then raise exception 'admission exact v2 cursor queue required' using errcode='42501';end if;
 select q.route_id,q.route_revision,q.key_id,q.endpoint_url,q.destination_organization_id into selected_route_id,selected_route_revision,selected_key_id,endpoint,recipient from operations_catering_allocation_private.delivery_queue q where q.organization_id=c.organization_id and q.source_stream_id=c.source_stream_id and q.source_revision=c.publication_revision and q.allocation_event_id=c.allocation_event_id and q.status='delivered';
 perform 1 from operations_catering_allocation_private.delivery_gates g where g.organization_id=c.organization_id and g.enabled for share;
 if not found then raise exception 'admission original v2 transport gate revoked' using errcode='42501';end if;
 perform 1 from operations_catering_allocation_private.delivery_routes r where r.id=selected_route_id and r.organization_id=c.organization_id and r.destination_organization_id=c.finance_organization_id and r.destination_organization_id=recipient and r.route_revision=selected_route_revision and r.key_id=selected_key_id and r.endpoint_url=endpoint and r.enabled for share;
 end if;
 if not found then raise exception 'admission original delivered route identity revoked' using errcode='42501';end if;
end;$$;
revoke all on function operations_catering_reconciliation_private.lock_cursor_route_v1(uuid) from public,anon,authenticated,service_role;

create function operations_catering_reconciliation_private.resolve_admission_v1(p jsonb,p_cursor_id uuid,p_cursor_sha256 text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();key text;
 v_keys text[]:=array['schema_version','source_stream_id','expected_source_revision','expected_allocation_revision','expected_observation_id','expected_source_fingerprint','from_project_id','from_obligation_id','target_project_id','target_obligation_id','expected_target_obligation_revision','idempotency_key','reason'];
 c operations_catering_reconciliation_private.verified_cursors%rowtype;eligibility jsonb;
 prior public.operations_catering_cost_publications%rowtype;h public.operations_catering_cost_streams%rowtype;
 ah operations_catering_allocation_private.heads%rowtype;oldmap public.operations_catering_project_mappings%rowtype;
 obs public.operations_catering_source_observations%rowtype;target public.operations_project_obligation_heads%rowtype;
 old_finance operations_catering_private.finance_delivery_maps%rowtype;new_finance operations_catering_private.finance_delivery_maps%rowtype;
 existing operations_catering_allocation_private.events%rowtype;
begin
 perform set_config('lock_timeout','3s',true);
 if jsonb_typeof(p) is distinct from 'object' or not(p ?& v_keys) or p-v_keys<>'{}'::jsonb or p->>'schema_version' is distinct from 'operations-catering-reassignment-command.v2'
 then raise exception 'invalid native allocation command shape' using errcode='22023';end if;
 foreach key in array array['expected_observation_id','from_project_id','from_obligation_id','target_project_id','target_obligation_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid native allocation UUID' using errcode='22023';end if;end loop;
 foreach key in array array['expected_source_revision','expected_allocation_revision','expected_target_obligation_revision'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between (case when key='expected_allocation_revision' then 0 else 1 end) and 9007199254740991
 then raise exception 'invalid native allocation revision' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'source_stream_id') is distinct from 'string' or p->>'source_stream_id' !~ '^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'expected_source_fingerprint') is distinct from 'string' or p->>'expected_source_fingerprint' !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p->'idempotency_key') is distinct from 'string' or length(p->>'idempotency_key') not between 12 and 200 or p->>'idempotency_key'<>operations_catering_allocation_private.trim_command_text_v2(p->>'idempotency_key')
 or jsonb_typeof(p->'reason') is distinct from 'string' or length(p->>'reason') not between 3 and 1000 or p->>'reason'<>operations_catering_allocation_private.trim_command_text_v2(p->>'reason')
 or (p->>'from_project_id'=p->>'target_project_id' and p->>'from_obligation_id'=p->>'target_obligation_id')
 then raise exception 'invalid native allocation selector/reason' using errcode='22023';end if;

 if p_cursor_id is null or p_cursor_sha256 is null or p_cursor_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'admission cursor selector invalid' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_admin_v1();
 -- Canonical authority order: live actor/profile/role -> dedicated key ->
 -- reconciliation gate -> admission policy -> original gates/projects/maps.
 -- Configuration writers must use the same order when changing those scopes.
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found or c.cursor_sha256<>p_cursor_sha256 then raise exception 'admission saved signed cursor required' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.resolve_cursor_v1(c.key_id,c.response_timestamp,c.request_nonce,c.response_signature,c.raw_body);
 if c.organization_id<>org or c.source_stream_id<>p->>'source_stream_id' then raise exception 'admission cursor actor scope mismatch' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.admission_policies where organization_id=org and enabled for share;
 if not found then raise exception 'authenticated admission default disabled' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.lock_cursor_route_v1(p_cursor_id);
 perform 1 from operations_catering_allocation_private.gates where organization_id=org and enabled for share;
 if not found then raise exception 'admission original allocation gate disabled' using errcode='42501';end if;
 for key in select distinct value from jsonb_array_elements_text(jsonb_build_array(p->>'from_project_id',p->>'target_project_id')) order by value loop
 perform 1 from public.projects where id=key::uuid and organization_id=org and deleted_at is null for share;
 if not found then raise exception 'admission live projects denied' using errcode='42501';end if;end loop;
 -- Same original command barrier; authenticated wrapper replay is handled before
 -- any fresh admission. No replacement or renewal of a saved command.
 perform pg_advisory_xact_lock(hashtextextended('native-allocation-command:'||org::text||':'||(p->>'idempotency_key'),0));
 select * into existing from operations_catering_allocation_private.events where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then
 if existing.command is distinct from p or existing.actor_system_user_id is distinct from actor then raise exception 'admission command replay conflict' using errcode='23505';end if;
 -- A same-command waiter became historical while waiting on the ORIGINAL
 -- command barrier. Do not insert another admission or restore an older head.
 return jsonb_build_object('historical_event_id',existing.event_id);end if;
 select pub.* into prior from public.operations_catering_cost_streams stream join public.operations_catering_cost_publications pub
 on pub.organization_id=stream.organization_id and pub.source_stream_id=stream.source_stream_id and pub.source_revision=stream.current_revision
 where stream.organization_id=org and stream.source_stream_id=p->>'source_stream_id';
 if not found then raise exception 'admission genuine saved source required' using errcode='42501';end if;
 select * into target from public.operations_project_obligation_heads where organization_id=org and project_id=(p->>'target_project_id')::uuid and obligation_id=(p->>'target_obligation_id')::uuid for share;
 if not found or target.cost_basis<>'time' or target.currency is distinct from prior.snapshot->>'currency' or target.current_revision<>(p->>'expected_target_obligation_revision')::bigint then raise exception 'admission actual current time obligation required' using errcode='42501';end if;
 select * into old_finance from operations_catering_private.finance_delivery_maps where organization_id=org and source_project_id=(p->>'from_project_id')::uuid and source_obligation_id=(p->>'from_obligation_id')::uuid and enabled for share;
 if not found then raise exception 'admission old Finance retirement capability denied' using errcode='42501';end if;
 select * into new_finance from operations_catering_private.finance_delivery_maps where organization_id=org and source_project_id=target.project_id and source_obligation_id=target.obligation_id and enabled for share;
 if not found or new_finance.destination_organization_id<>old_finance.destination_organization_id or c.finance_organization_id<>new_finance.destination_organization_id or old_finance.currency<>target.currency or new_finance.currency<>target.currency then raise exception 'admission same-recipient Finance capability denied' using errcode='42501';end if;
 perform 1 from public.operations_catering_publish_gates where organization_id=org and enabled for share;
 if not found then raise exception 'admission native publisher gate disabled' using errcode='42501';end if;
 perform 1 from public.operations_catering_source_bindings where organization_id=org and worker_id=(prior.snapshot->>'worker_id')::uuid and catering_organization_id=(prior.snapshot->>'source_organization_id')::uuid and catering_person_id=(prior.snapshot->>'source_person_id')::uuid and enabled for share;
 if not found then raise exception 'admission genuine source worker enrollment denied' using errcode='42501';end if;
 -- Original mapping-before-stream/head order is preserved. Historical maps are
 -- never enabled; admission requires the latest actual enabled native mapping.
 select * into oldmap from public.operations_catering_project_mappings where id=prior.mapping_id and organization_id=org and enabled for update;
 if not found then raise exception 'admission current native mapping denied' using errcode='42501';end if;
 select * into h from public.operations_catering_cost_streams where organization_id=org and source_stream_id=p->>'source_stream_id' for update;
 if not found or h.current_revision<>prior.source_revision or h.current_revision<>(p->>'expected_source_revision')::bigint then raise exception 'admission stale current source' using errcode='PT409';end if;
 select * into ah from operations_catering_allocation_private.heads where organization_id=org and source_stream_id=h.source_stream_id for update;
 if coalesce(ah.current_revision,0)<>(p->>'expected_allocation_revision')::bigint then raise exception 'admission stale allocation' using errcode='PT409';end if;
 select * into obs from public.operations_catering_source_observations where organization_id=org and id=prior.observation_id;
 if not found or obs.id::text is distinct from p->>'expected_observation_id' or obs.source_fingerprint is distinct from p->>'expected_source_fingerprint'
 or prior.snapshot->>'project_id' is distinct from p->>'from_project_id' or prior.snapshot->>'obligation_id' is distinct from p->>'from_obligation_id'
 or oldmap.project_id::text is distinct from prior.snapshot->>'project_id' or oldmap.obligation_id::text is distinct from prior.snapshot->>'obligation_id'
 or oldmap.mapping_revision is distinct from prior.snapshot->>'mapping_revision' or oldmap.worker_id is distinct from h.worker_id
 or oldmap.catering_organization_id is distinct from obs.catering_organization_id or oldmap.catering_person_id is distinct from obs.person_id or oldmap.time_entry_id is distinct from obs.time_entry_id
 or oldmap.work_date::text is distinct from prior.snapshot->>'work_date' or oldmap.time_zone is distinct from prior.snapshot->>'time_zone' or oldmap.currency is distinct from prior.snapshot->>'currency'
 then raise exception 'admission exact immutable source mapping mismatch' using errcode='22023';end if;
 if h.current_revision=9007199254740991 or coalesce(ah.current_revision,0)=9007199254740991 then raise exception 'admission revision exhausted' using errcode='22003';end if;
 -- Locks are already held. Re-resolve current local head and exact ordinary
 -- receipt against independent signed Finance cursor, never supplied receipt JSON.
 eligibility:=operations_catering_reconciliation_private.delivery_eligibility_v1(p_cursor_id);
 return eligibility||jsonb_build_object('actor_system_user_id',actor,'idempotency_key',p->>'idempotency_key','command',p,
 'command_sha256',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(p),'UTF8')),'hex'),
 'cursor_sha256',p_cursor_sha256,'previous_finance_mapping_id',old_finance.mapping_id,'next_finance_mapping_id',new_finance.mapping_id,'prospective_allocation_revision',coalesce(ah.current_revision,0)+1,'prospective_publication_revision',h.current_revision+1);
end;$$;
revoke all on function operations_catering_reconciliation_private.resolve_admission_v1(jsonb,uuid,text) from public,anon,authenticated,service_role;
-- Once enrolled, admission enforcement cannot be switched off to drain or bypass
-- a backlog. Rollback disables transport/cursor keys; it does not erase policy.
create table operations_catering_reconciliation_private.admission_policies(organization_id uuid primary key,enabled boolean not null default false);
alter table operations_catering_reconciliation_private.admission_policies enable row level security;
revoke all on operations_catering_reconciliation_private.admission_policies from public,anon,authenticated,service_role;
grant select,insert on operations_catering_reconciliation_private.admission_policies to service_role;
grant update(enabled) on operations_catering_reconciliation_private.admission_policies to service_role;
-- A real shared configuration row serializes policy enrollment versus original
-- allocation and both original transport gate writers, including repeatable-read write conflicts.
-- It contains no permission, actor, source, receipt or cost information.
create table operations_catering_reconciliation_private.policy_configuration_barriers(organization_id uuid primary key,revision bigint not null default 0 check(revision>=0));
alter table operations_catering_reconciliation_private.policy_configuration_barriers enable row level security;
revoke all on operations_catering_reconciliation_private.policy_configuration_barriers from public,anon,authenticated,service_role;
create trigger reconciliation_policy_barrier_no_truncate before truncate on operations_catering_reconciliation_private.policy_configuration_barriers for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_catering_reconciliation_private.policy_barrier_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' or (tg_op='INSERT' and new.revision<>0) or (tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.revision<>old.revision+1)) then raise exception 'policy configuration barrier identity denied' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.policy_barrier_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_policy_barrier_identity before insert or update or delete on operations_catering_reconciliation_private.policy_configuration_barriers for each row execute function operations_catering_reconciliation_private.policy_barrier_guard_v1();
create function operations_catering_reconciliation_private.admission_policy_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into operations_catering_reconciliation_private.policy_configuration_barriers(organization_id) values(coalesce(new.organization_id,old.organization_id)) on conflict(organization_id) do update set revision=operations_catering_reconciliation_private.policy_configuration_barriers.revision+1;
 if tg_op='DELETE' or (tg_op='UPDATE' and (new.organization_id<>old.organization_id or (old.enabled and not new.enabled))) then raise exception 'admission policy identity/disable denied' using errcode='55000';end if;
 -- Enrollment/activation occurs with ORIGINAL allocation and both transports
 -- disabled. The original gate's prior UPDATE drains admitted legacy allocators
 -- before policy enrollment. Shared configuration writes prevent a concurrent
 -- gate re-enable until this transaction commits, even under repeatable read.
 if (tg_op='INSERT' or not old.enabled) and (
 exists(select 1 from operations_catering_allocation_private.gates where organization_id=new.organization_id and enabled)
 or exists(select 1 from operations_catering_private.finance_delivery_gates where organization_id=new.organization_id and enabled)
 or exists(select 1 from operations_catering_allocation_private.delivery_gates where organization_id=new.organization_id and enabled))
 then raise exception 'disable original allocation and both transports before admission enrollment' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.admission_policy_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_admission_policy before insert or update or delete on operations_catering_reconciliation_private.admission_policies for each row execute function operations_catering_reconciliation_private.admission_policy_guard_v1();
create trigger reconciliation_admission_policy_no_truncate before truncate on operations_catering_reconciliation_private.admission_policies for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_catering_reconciliation_private.transport_policy_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into operations_catering_reconciliation_private.policy_configuration_barriers(organization_id) values(new.organization_id) on conflict(organization_id) do update set revision=operations_catering_reconciliation_private.policy_configuration_barriers.revision+1;
 if new.enabled and exists(select 1 from operations_catering_reconciliation_private.admission_policies where organization_id=new.organization_id)
 and not exists(select 1 from operations_catering_reconciliation_private.admission_policies where organization_id=new.organization_id and enabled)
 then raise exception 'enrolled admission enforcement required before transport' using errcode='42501';end if;return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.transport_policy_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_original_allocation_policy before insert or update on operations_catering_allocation_private.gates for each row execute function operations_catering_reconciliation_private.transport_policy_guard_v1();
create trigger reconciliation_v1_transport_policy before insert or update on operations_catering_private.finance_delivery_gates for each row execute function operations_catering_reconciliation_private.transport_policy_guard_v1();
create trigger reconciliation_v2_transport_policy before insert or update on operations_catering_allocation_private.delivery_gates for each row execute function operations_catering_reconciliation_private.transport_policy_guard_v1();

create function operations_catering_reconciliation_private.admission_insert_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare facts jsonb;begin
 if new.consumed_event_id is not null then raise exception 'fresh admission already consumed' using errcode='22023';end if;
 perform 1 from operations_catering_reconciliation_private.admission_policies where organization_id=new.organization_id and enabled;
 if not found then raise exception 'admission policy disabled' using errcode='42501';end if;
 facts:=operations_catering_reconciliation_private.resolve_admission_v1(new.command,new.cursor_id,new.cursor_sha256);
 if new.organization_id::text is distinct from facts->>'organization_id' or new.source_stream_id is distinct from facts->>'source_stream_id'
 or new.actor_system_user_id::text is distinct from facts->>'actor_system_user_id' or new.idempotency_key is distinct from facts->>'idempotency_key'
 or new.command_sha256 is distinct from facts->>'command_sha256' or new.base_publication_revision is distinct from (facts->>'publication_revision')::bigint
 or new.base_allocation_revision is distinct from (facts->>'allocation_revision')::bigint or new.base_mapping_id::text is distinct from facts->>'mapping_id'
 or new.base_observation_id::text is distinct from facts->>'observation_id' or new.delivery_id::text is distinct from facts->>'delivery_id'
 or new.receipt_id::text is distinct from facts->>'receipt_id'
 or new.previous_finance_mapping_id::text is distinct from facts->>'previous_finance_mapping_id' or new.next_finance_mapping_id::text is distinct from facts->>'next_finance_mapping_id'
 or new.prospective_allocation_revision is distinct from (facts->>'prospective_allocation_revision')::bigint
 or new.prospective_publication_revision is distinct from (facts->>'prospective_publication_revision')::bigint
 then raise exception 'admission persisted integrity facts invalid' using errcode='22023';end if;
 new.creation_transaction:=txid_current();new.created_at:=clock_timestamp();return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.admission_insert_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_admission_insert_guard before insert on operations_catering_reconciliation_private.admissions for each row execute function operations_catering_reconciliation_private.admission_insert_guard_v1();
create function operations_catering_reconciliation_private.admission_consume_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op<>'UPDATE' or (to_jsonb(new)-'consumed_event_id') is distinct from (to_jsonb(old)-'consumed_event_id')
 or old.consumed_event_id is not null or new.consumed_event_id is null or old.creation_transaction<>txid_current()
 or old.actor_system_user_id is distinct from auth.uid()
 then raise exception 'admission immutable/one-transaction consume denied' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.admission_consume_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_admission_consume_guard before update or delete on operations_catering_reconciliation_private.admissions for each row execute function operations_catering_reconciliation_private.admission_consume_guard_v1();

create function operations_catering_reconciliation_private.allocation_event_admission_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare a operations_catering_reconciliation_private.admissions%rowtype;c operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 -- No late SHARE on new policy: original direct RPC already holds mapping/stream.
 if not exists(select 1 from operations_catering_reconciliation_private.admission_policies where organization_id=new.organization_id and enabled) then return new;end if;
 select * into a from operations_catering_reconciliation_private.admissions where organization_id=new.organization_id and idempotency_key=new.idempotency_key for update;
 if not found or a.consumed_event_id is not null or a.creation_transaction<>txid_current()
 or a.actor_system_user_id is distinct from auth.uid() or new.actor_system_user_id is distinct from a.actor_system_user_id
 or new.command is distinct from a.command or new.source_stream_id is distinct from a.source_stream_id
 or new.base_publication_revision<>a.base_publication_revision or new.allocation_revision<>a.prospective_allocation_revision
 or new.allocated_publication_revision<>a.prospective_publication_revision or new.previous_mapping_id<>a.base_mapping_id
 or new.source_observation_id<>a.base_observation_id or new.target_project_id::text is distinct from a.command->>'target_project_id'
 or new.target_obligation_id::text is distinct from a.command->>'target_obligation_id'
 or new.target_obligation_revision<>(a.command->>'expected_target_obligation_revision')::bigint
 then raise exception 'fresh allocation exact authenticated admission required' using errcode='42501';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=a.cursor_id;
 if not found or c.cursor_sha256<>a.cursor_sha256 or clock_timestamp()>=c.expires_at then raise exception 'admission expired at event consume' using errcode='42501';end if;
 update operations_catering_reconciliation_private.admissions set consumed_event_id=new.event_id where id=a.id;
 return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.allocation_event_admission_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_allocation_event_admission before insert on operations_catering_allocation_private.events for each row execute function operations_catering_reconciliation_private.allocation_event_admission_guard_v1();

create function operations_catering_reconciliation_private.admission_result_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare a operations_catering_reconciliation_private.admissions%rowtype;e operations_catering_allocation_private.events%rowtype;
 prior public.operations_catering_cost_publications%rowtype;p public.operations_catering_cost_publications%rowtype;m public.operations_catering_project_mappings%rowtype;
 expected jsonb;expected_event jsonb;event_fp text;c operations_catering_reconciliation_private.verified_cursors%rowtype;obs public.operations_catering_source_observations%rowtype;oldmap public.operations_catering_project_mappings%rowtype;begin
 select * into a from operations_catering_reconciliation_private.admissions where id=new.id;
 if not found or a.consumed_event_id is null then raise exception 'admission transaction did not create allocation' using errcode='55000';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=a.cursor_id;
 if not found or clock_timestamp()>=c.expires_at then raise exception 'admission cursor expired before transaction result' using errcode='42501';end if;
 select * into e from operations_catering_allocation_private.events where organization_id=a.organization_id and event_id=a.consumed_event_id;
 if not found or e.command is distinct from a.command or e.actor_system_user_id<>a.actor_system_user_id or e.source_stream_id<>a.source_stream_id
 or e.allocation_revision<>a.prospective_allocation_revision or e.base_publication_revision<>a.base_publication_revision
 or e.allocated_publication_revision<>a.prospective_publication_revision or e.previous_mapping_id<>a.base_mapping_id or e.source_observation_id<>a.base_observation_id
 then raise exception 'admission actual event integrity mismatch' using errcode='55000';end if;
 select * into prior from public.operations_catering_cost_publications where organization_id=a.organization_id and source_stream_id=a.source_stream_id and source_revision=a.base_publication_revision;
 select * into p from public.operations_catering_cost_publications where organization_id=a.organization_id and source_stream_id=a.source_stream_id and source_revision=a.prospective_publication_revision;
 select * into m from public.operations_catering_project_mappings where id=e.next_mapping_id and organization_id=a.organization_id;
 select * into obs from public.operations_catering_source_observations where organization_id=a.organization_id and id=a.base_observation_id;
 select * into oldmap from public.operations_catering_project_mappings where organization_id=a.organization_id and id=a.base_mapping_id;
 if obs.id is null or oldmap.id is null or e.created_at<a.created_at or e.created_at>clock_timestamp() then raise exception 'admission actual event provenance invalid' using errcode='55000';end if;
 expected_event:=jsonb_build_object('schema_version','operations-catering-allocation-authority.v2','event_id',e.event_id,'organization_id',a.organization_id,'source_stream_id',a.source_stream_id,
 'allocation_revision',a.prospective_allocation_revision,'actor_system_user_id',a.actor_system_user_id,'reason',a.command->>'reason','idempotency_key',a.idempotency_key,'created_at',to_jsonb(e.created_at),
 'base_publication_revision',a.base_publication_revision,'allocated_publication_revision',a.prospective_publication_revision,'source_observation_id',obs.id,'source_entry_version',obs.entry_version,
 'raw_entry_sha256',obs.raw_entry_sha256,'raw_review_sha256',obs.raw_review_sha256,'source_cost_fingerprint',operations_catering_allocation_private.cost_fingerprint_v2(prior.snapshot),
 'previous_mapping_id',oldmap.id,'previous_mapping_revision',oldmap.mapping_revision,'next_mapping_id',e.next_mapping_id,'next_mapping_revision','native-allocation-v2:'||e.event_id::text,
 'from_project_id',oldmap.project_id,'from_obligation_id',oldmap.obligation_id,'to_project_id',(a.command->>'target_project_id')::uuid,'to_obligation_id',(a.command->>'target_obligation_id')::uuid,'target_obligation_revision',(a.command->>'expected_target_obligation_revision')::bigint);
 event_fp:=encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(expected_event),'UTF8')),'hex');
 expected_event:=expected_event||jsonb_build_object('fingerprint',event_fp);
 if e.document is distinct from expected_event or e.fingerprint is distinct from event_fp
 or (to_jsonb(m)-array['id','project_id','obligation_id','mapping_revision','enabled']) is distinct from (to_jsonb(oldmap)-array['id','project_id','obligation_id','mapping_revision','enabled'])
 then raise exception 'admission native event/map provenance or cost changed' using errcode='55000';end if;
 expected:=prior.snapshot||jsonb_build_object('project_id',e.target_project_id,'obligation_id',e.target_obligation_id,'mapping_revision',e.document->>'next_mapping_revision','publication_revision',a.prospective_publication_revision,
 'project_review_status',case when prior.snapshot->>'source_status'='rejected' then 'rejected' else 'preliminary' end);
 if prior.organization_id is null or p.organization_id is null or m.id is null or p.snapshot is distinct from expected
 or p.observation_id<>prior.observation_id or p.mapping_id<>e.next_mapping_id or not m.enabled
 or m.project_id<>e.target_project_id or m.obligation_id<>e.target_obligation_id or m.mapping_revision is distinct from e.document->>'next_mapping_revision'
 or exists(select 1 from public.operations_catering_project_mappings where id=a.base_mapping_id and enabled)
 or not exists(select 1 from operations_catering_allocation_private.event_finance_capabilities cap where cap.organization_id=a.organization_id and cap.event_id=e.event_id and cap.destination_organization_id=c.finance_organization_id and cap.previous_finance_mapping_id=a.previous_finance_mapping_id and cap.next_finance_mapping_id=a.next_finance_mapping_id)
 or not exists(select 1 from operations_catering_allocation_private.heads where organization_id=a.organization_id and source_stream_id=a.source_stream_id and current_revision=a.prospective_allocation_revision and current_event_id=e.event_id and mapping_id=e.next_mapping_id)
 or not exists(select 1 from public.operations_catering_cost_streams where organization_id=a.organization_id and source_stream_id=a.source_stream_id and current_revision=a.prospective_publication_revision)
 then raise exception 'admission actual derived map/publication/head mismatch' using errcode='55000';end if;return null;
end;$$;
revoke all on function operations_catering_reconciliation_private.admission_result_guard_v1() from public,anon,authenticated,service_role;
create constraint trigger reconciliation_admission_result after insert or update on operations_catering_reconciliation_private.admissions deferrable initially deferred for each row execute function operations_catering_reconciliation_private.admission_result_guard_v1();
create function operations_catering_reconciliation_private.allocation_head_admission_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from operations_catering_reconciliation_private.admission_policies where organization_id=new.organization_id and enabled) then return new;end if;
 if not exists(select 1 from operations_catering_reconciliation_private.admissions a where a.organization_id=new.organization_id and a.source_stream_id=new.source_stream_id and a.consumed_event_id=new.current_event_id and a.prospective_allocation_revision=new.current_revision and a.creation_transaction=txid_current() and a.actor_system_user_id=auth.uid())
 then raise exception 'fresh allocation head admitted event required' using errcode='42501';end if;return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.allocation_head_admission_guard_v1() from public,anon,authenticated,service_role;
create trigger reconciliation_allocation_head_admission before insert or update on operations_catering_allocation_private.heads for each row execute function operations_catering_reconciliation_private.allocation_head_admission_guard_v1();

create function operations_catering_reconciliation_private.reassign_admitted_v1(p_command jsonb,p_finance_cursor_id uuid,p_finance_cursor_sha256 text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;existing operations_catering_allocation_private.events%rowtype;facts jsonb;result jsonb;a uuid:=gen_random_uuid();begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 -- Preserve saved original command replay: no fresh admission or renewed cursor.
 if jsonb_typeof(p_command)='object' and jsonb_typeof(p_command->'idempotency_key')='string' then
 select * into existing from operations_catering_allocation_private.events where organization_id=org and idempotency_key=p_command->>'idempotency_key';
 if found then
 if existing.command is distinct from p_command or existing.actor_system_user_id is distinct from auth.uid() then raise exception 'admission command replay conflict' using errcode='23505';end if;
 return operations_catering_allocation_private.reassign_v2(p_command);
 end if;end if;
 if not exists(select 1 from operations_catering_reconciliation_private.admission_policies where organization_id=org and enabled) then raise exception 'authenticated admission default disabled' using errcode='42501';end if;
 facts:=operations_catering_reconciliation_private.resolve_admission_v1(p_command,p_finance_cursor_id,p_finance_cursor_sha256);
 if facts ? 'historical_event_id' then return operations_catering_allocation_private.reassign_v2(p_command);end if;
 insert into operations_catering_reconciliation_private.admissions values(a,org,facts->>'source_stream_id',auth.uid(),p_command->>'idempotency_key',p_command,facts->>'command_sha256',p_finance_cursor_id,p_finance_cursor_sha256,
 (facts->>'publication_revision')::bigint,(facts->>'allocation_revision')::bigint,(facts->>'mapping_id')::uuid,(facts->>'observation_id')::uuid,(facts->>'delivery_id')::uuid,(facts->>'receipt_id')::uuid,(facts->>'previous_finance_mapping_id')::uuid,(facts->>'next_finance_mapping_id')::uuid,
 (facts->>'prospective_allocation_revision')::bigint,(facts->>'prospective_publication_revision')::bigint,txid_current(),clock_timestamp(),null);
 result:=operations_catering_allocation_private.reassign_v2(p_command);
 if result->>'outcome' is distinct from 'accepted' or not exists(select 1 from operations_catering_reconciliation_private.admissions where id=a and consumed_event_id=(result->>'event_id')::uuid) then raise exception 'admitted allocation did not complete' using errcode='PT409';end if;
 return result||jsonb_build_object('admission_id',a,'finance_cursor_id',p_finance_cursor_id);
end;$$;
revoke all on function operations_catering_reconciliation_private.reassign_admitted_v1(jsonb,uuid,text) from public,anon,service_role;
grant execute on function operations_catering_reconciliation_private.reassign_admitted_v1(jsonb,uuid,text) to authenticated;
create function public.reassign_operations_catering_project_admitted_v1(p_command jsonb,p_finance_cursor_id uuid,p_finance_cursor_sha256 text) returns jsonb language sql security invoker set search_path='' as $$select operations_catering_reconciliation_private.reassign_admitted_v1(p_command,p_finance_cursor_id,p_finance_cursor_sha256);$$;
revoke all on function public.reassign_operations_catering_project_admitted_v1(jsonb,uuid,text) from public,anon,service_role;
grant execute on function public.reassign_operations_catering_project_admitted_v1(jsonb,uuid,text) to authenticated;
-- New twelve-field permit command grammar only. This parser grants no actor,
-- Finance acceptance, capture, permit or dispatch authority.
create function operations_catering_reconciliation_private.validate_permit_command_v1(p_raw_command text) returns jsonb
 language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb;k text;begin
 if p_raw_command is null or octet_length(p_raw_command)>262144 then raise exception 'reconciliation command size invalid' using errcode='22023';end if;
 perform operations_catering_reconciliation_private.json_guard_v1(p_raw_command::json);
 p:=p_raw_command::jsonb;
 perform operations_catering_reconciliation_private.exact_v1(p,array['schema_version','source_stream_id','expected_publication_revision','expected_allocation_revision','expected_event_id','expected_observation_id','expected_mapping_id','finance_cursor_id','finance_cursor_sha256','preview_sha256','idempotency_key','reason']);
 if p->>'schema_version' is distinct from 'operations-catering-reconciliation-command.v1'
 or jsonb_typeof(p->'source_stream_id') is distinct from 'string' or p->>'source_stream_id' !~ '^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'reconciliation command schema/stream invalid' using errcode='22023';end if;
 foreach k in array array['expected_event_id','expected_observation_id','expected_mapping_id','finance_cursor_id'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reconciliation command UUID invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['expected_publication_revision','expected_allocation_revision'] loop
 if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'reconciliation command revision type invalid' using errcode='22023';end if;
 if (p->>k)::numeric not between 1 and 9007199254740991 or (p->>k)::numeric<>trunc((p->>k)::numeric) then raise exception 'reconciliation command revision invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['finance_cursor_sha256','preview_sha256'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{64}$' then raise exception 'reconciliation command commitment invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['reason','idempotency_key'] loop
 if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'reconciliation command text type invalid' using errcode='22023';end if;
 if length(p->>k) not between (case when k='reason' then 3 else 12 end) and (case when k='reason' then 1000 else 200 end)
 or p->>k is distinct from operations_catering_allocation_private.trim_command_text_v2(p->>k) then raise exception 'reconciliation command text invalid' using errcode='22023';end if;
 end loop;
 return p;
end;$$;
revoke all on function operations_catering_reconciliation_private.validate_permit_command_v1(text) from public,anon,authenticated,service_role;
