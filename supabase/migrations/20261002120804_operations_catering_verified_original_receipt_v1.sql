-- NEW default-off original receipt integrity cache. Admission hard42501 is NOT replaced here.
-- Only genuine separately signed Finance-own receipt bytes can populate this private cache.
create table operations_catering_reconciliation_private.original_receipt_read_gates (
 organization_id uuid primary key,enabled boolean not null default false
);
create table operations_catering_reconciliation_private.original_receipt_verification_keys (
 key_id text primary key check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),organization_id uuid not null,
 finance_organization_id uuid not null,route_id uuid not null,route_revision text not null,
 secret text not null check(octet_length(secret)>=32),enabled boolean not null default false,
 check(length(route_revision) between 1 and 200 and route_revision=operations_catering_allocation_private.trim_command_text_v2(route_revision))
);
create table operations_catering_reconciliation_private.verified_original_receipts (
 id uuid primary key default gen_random_uuid(),cursor_id uuid not null references operations_catering_reconciliation_private.verified_cursors(cursor_id),
 key_id text not null references operations_catering_reconciliation_private.original_receipt_verification_keys(key_id),
 organization_id uuid not null,finance_organization_id uuid not null,source_stream_id text not null,
 cursor_sha256 text not null,receipt_id uuid not null,receipt_schema text not null,receipt jsonb not null,
 request_raw_body text not null,response_raw_body text not null,response_body_sha256 text not null,
 request_body_sha256 text not null,response_timestamp text not null,request_nonce text not null,response_signature text not null,
 proof jsonb not null,issued_at timestamptz not null,expires_at timestamptz not null,verified_at timestamptz not null default clock_timestamp(),
 check(octet_length(request_raw_body)<=262144 and octet_length(response_raw_body)<=262144),unique(key_id,request_nonce)
);
do $$declare t text;begin
 foreach t in array array['original_receipt_read_gates','original_receipt_verification_keys','verified_original_receipts'] loop
 execute format('alter table operations_catering_reconciliation_private.%I enable row level security',t);
 execute format('revoke all on operations_catering_reconciliation_private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger %I before truncate on operations_catering_reconciliation_private.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;
end;$$;
grant select,insert on operations_catering_reconciliation_private.original_receipt_read_gates to service_role;
grant update(enabled) on operations_catering_reconciliation_private.original_receipt_read_gates to service_role;
grant select on operations_catering_reconciliation_private.verified_original_receipts to service_role;
create trigger original_receipt_gate_identity before update or delete on operations_catering_reconciliation_private.original_receipt_read_gates for each row execute function public.operations_catering_mapping_guard();
create trigger original_receipt_key_identity before update or delete on operations_catering_reconciliation_private.original_receipt_verification_keys for each row execute function public.operations_catering_mapping_guard();
create trigger original_receipt_cache_immutable before update or delete on operations_catering_reconciliation_private.verified_original_receipts for each row execute function public.operations_personnel_evidence_immutable();
create function operations_catering_reconciliation_private.resolve_original_receipt_v1(p_cursor_id uuid,p_key_id text,p_timestamp text,p_nonce text,p_request_raw text,p_response_raw text,p_signature text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c operations_catering_reconciliation_private.verified_cursors%rowtype;k operations_catering_reconciliation_private.original_receipt_verification_keys%rowtype;
 req jsonb;p jsonb;r jsonb;issued timestamptz;expiry timestamptz;expected bytea;provided bytea;i integer;difference integer:=0;v text;
 receipt_keys text[]:=array['schema','outcome','source_organization_id','source_stream_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
begin
 if p_timestamp is null or p_timestamp !~ '^[0-9]{10}$' or abs(floor(extract(epoch from clock_timestamp()))-p_timestamp::bigint)>120
 or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,128}$' or p_key_id is null or p_key_id !~ '^[A-Za-z0-9_-]{4,64}$'
 or p_signature is null or p_signature !~ '^original-receipt-response-v1=[0-9a-f]{64}$'
 or p_request_raw is null or p_response_raw is null or octet_length(p_request_raw)>262144 or octet_length(p_response_raw)>262144
 then raise exception 'original receipt response proof invalid' using errcode='22023';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found then raise exception 'original receipt cursor unavailable' using errcode='42501';end if;
 -- ALL key permission scopes precede gates; key provisioning follows this same order.
 perform 1 from operations_catering_reconciliation_private.cursor_verification_keys where key_id=c.key_id and enabled for share;
 if not found then raise exception 'original cursor key disabled' using errcode='42501';end if;
 select * into k from operations_catering_reconciliation_private.original_receipt_verification_keys where key_id=p_key_id for share;
 if not found or not k.enabled or k.organization_id is distinct from c.organization_id or k.finance_organization_id is distinct from c.finance_organization_id
 then raise exception 'original receipt verification key disabled' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.gates where organization_id=c.organization_id and enabled for share;
 if not found then raise exception 'original cursor gate disabled' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.original_receipt_read_gates where organization_id=c.organization_id and enabled for share;
 if not found then raise exception 'original receipt gate disabled' using errcode='42501';end if;
 perform operations_catering_reconciliation_private.resolve_cursor_v1(p_key_id=>c.key_id,p_timestamp=>c.response_timestamp,p_nonce=>c.request_nonce,p_signature=>c.response_signature,p_raw_body=>c.raw_body);
 perform operations_catering_reconciliation_private.json_guard_v1(p_request_raw::json);
 perform operations_catering_reconciliation_private.json_guard_v1(p_response_raw::json);
 req:=p_request_raw::jsonb;p:=p_response_raw::jsonb;
 perform operations_catering_reconciliation_private.exact_v1(req,array['schema_version','operations_organization_id','finance_organization_id','source_stream_id','cursor_id','cursor_sha256']);
 perform operations_catering_reconciliation_private.exact_v1(p,array['schema_version','cursor_id','cursor_sha256','receipt','issued_at','expires_at']);
 if req is distinct from jsonb_build_object('schema_version','operations-catering-original-receipt-request.v1','operations_organization_id',c.organization_id,'finance_organization_id',c.finance_organization_id,'source_stream_id',c.source_stream_id,'cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256)
 or p->>'schema_version' is distinct from 'operations-catering-original-receipt-proof.v1'
 or p->'cursor_id' is distinct from to_jsonb(c.cursor_id) or p->'cursor_sha256' is distinct from to_jsonb(c.cursor_sha256)
 then raise exception 'original receipt cursor context mismatch' using errcode='42501';end if;
 expected:=operations_catering_reconciliation_private.hmac_sha256_v1(convert_to(k.secret,'UTF8'),convert_to('RESPONSE'||chr(10)||'operations-catering-original-receipt-read'||chr(10)||'operations-catering-original-receipt-proof.v1'||chr(10)||p_key_id||chr(10)||p_timestamp||chr(10)||p_nonce||chr(10)||encode(sha256(convert_to(p_request_raw,'UTF8')),'hex')||chr(10)||p_response_raw,'UTF8'));
 provided:=decode(substr(p_signature,length('original-receipt-response-v1=')+1),'hex');
 for i in 0..31 loop difference:=difference|(get_byte(expected,i)#get_byte(provided,i));end loop;
 if difference<>0 then raise exception 'original receipt signature mismatch' using errcode='42501';end if;
 issued:=operations_catering_reconciliation_private.stamp_v1(p->'issued_at');expiry:=operations_catering_reconciliation_private.stamp_v1(p->'expires_at');
 if jsonb_typeof(p->'issued_at') is distinct from 'string' or p->'expires_at' is distinct from c.proof->'expires_at'
 or expiry is distinct from c.expires_at or issued<c.issued_at or issued>clock_timestamp() or issued>=expiry or clock_timestamp()>=expiry
 then raise exception 'original receipt proof expired' using errcode='42501';end if;
 r:=p->'receipt';perform operations_catering_reconciliation_private.exact_v1(r,receipt_keys);
 if r is distinct from jsonb_build_object('schema',case when c.allocation_revision=0 then 'operations-catering-receipt.v1' else 'operations-catering-receipt.v2' end,
 'outcome',r->>'outcome','source_organization_id',c.organization_id,'source_stream_id',c.source_stream_id,
 'requested_source_revision',c.publication_revision,'applied_source_revision',c.publication_revision,'current_source_revision',c.publication_revision,
 'request_body_sha256',c.proof->'cursor'->>'snapshot_body_sha256','snapshot_receipt_id',c.finance_snapshot_id,
 'snapshot_fingerprint',c.proof->'cursor'->>'snapshot_body_sha256','receipt_id',r->>'receipt_id','destination_organization_id',c.finance_organization_id,'shadow_only',true)
 or jsonb_typeof(r->'receipt_id') is distinct from 'string' or r->>'receipt_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(r->'outcome') is distinct from 'string' or r->>'outcome' not in ('accepted','replayed') then raise exception 'original signed receipt integrity invalid' using errcode='42501';end if;
 if clock_timestamp()>=expiry or abs(floor(extract(epoch from clock_timestamp()))-p_timestamp::bigint)>120 then raise exception 'original receipt proof expired after locks' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'key_id',k.key_id,'organization_id',c.organization_id,'finance_organization_id',c.finance_organization_id,'source_stream_id',c.source_stream_id,'cursor_sha256',c.cursor_sha256,'receipt_id',r->>'receipt_id','receipt_schema',r->>'schema','receipt',r,'request_body_sha256',encode(sha256(convert_to(p_request_raw,'UTF8')),'hex'),'response_body_sha256',encode(sha256(convert_to(p_response_raw,'UTF8')),'hex'),'proof',p,'issued_at',p->>'issued_at','expires_at',p->>'expires_at');
end;$$;
revoke all on function operations_catering_reconciliation_private.resolve_original_receipt_v1(uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.original_receipt_insert_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare f jsonb;begin
 f:=operations_catering_reconciliation_private.resolve_original_receipt_v1(new.cursor_id,new.key_id,new.response_timestamp,new.request_nonce,new.request_raw_body,new.response_raw_body,new.response_signature);
 if f is distinct from jsonb_build_object('cursor_id',new.cursor_id,'key_id',new.key_id,'organization_id',new.organization_id,'finance_organization_id',new.finance_organization_id,'source_stream_id',new.source_stream_id,'cursor_sha256',new.cursor_sha256,'receipt_id',new.receipt_id,'receipt_schema',new.receipt_schema,'receipt',new.receipt,'request_body_sha256',new.request_body_sha256,'response_body_sha256',new.response_body_sha256,'proof',new.proof,'issued_at',to_char(new.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expires_at',to_char(new.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
 then raise exception 'original receipt cache metadata forged' using errcode='42501';end if;
 new.verified_at:=clock_timestamp();return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.original_receipt_insert_guard_v1() from public,anon,authenticated,service_role;
create trigger verified_original_receipt_binding before insert on operations_catering_reconciliation_private.verified_original_receipts for each row execute function operations_catering_reconciliation_private.original_receipt_insert_guard_v1();
create function operations_catering_reconciliation_private.verify_original_receipt_v1(p_cursor_id uuid,p_key_id text,p_timestamp text,p_nonce text,p_request_raw text,p_response_raw text,p_signature text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb;old operations_catering_reconciliation_private.verified_original_receipts%rowtype;saved operations_catering_reconciliation_private.verified_original_receipts%rowtype;
begin
 f:=operations_catering_reconciliation_private.resolve_original_receipt_v1(p_cursor_id,p_key_id,p_timestamp,p_nonce,p_request_raw,p_response_raw,p_signature);
 perform pg_advisory_xact_lock(hashtextextended('operations-catering-original-receipt-cache:'||p_key_id||':'||p_nonce,0));
 f:=operations_catering_reconciliation_private.resolve_original_receipt_v1(p_cursor_id,p_key_id,p_timestamp,p_nonce,p_request_raw,p_response_raw,p_signature);
 select * into old from operations_catering_reconciliation_private.verified_original_receipts where key_id=p_key_id and request_nonce=p_nonce;
 if found then
 if old.cursor_id is distinct from p_cursor_id or old.request_raw_body is distinct from p_request_raw or old.response_raw_body is distinct from p_response_raw or old.response_timestamp is distinct from p_timestamp or old.response_signature is distinct from p_signature
 then raise exception 'original receipt nonce rebound' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',old.cursor_id,'receipt_id',old.receipt_id,'response_body_sha256',old.response_body_sha256);
 end if;
 insert into operations_catering_reconciliation_private.verified_original_receipts(cursor_id,key_id,organization_id,finance_organization_id,source_stream_id,cursor_sha256,receipt_id,receipt_schema,receipt,request_raw_body,response_raw_body,response_body_sha256,request_body_sha256,response_timestamp,request_nonce,response_signature,proof,issued_at,expires_at)
 values(p_cursor_id,p_key_id,(f->>'organization_id')::uuid,(f->>'finance_organization_id')::uuid,f->>'source_stream_id',f->>'cursor_sha256',(f->>'receipt_id')::uuid,f->>'receipt_schema',f->'receipt',p_request_raw,p_response_raw,f->>'response_body_sha256',f->>'request_body_sha256',p_timestamp,p_nonce,p_signature,f->'proof',(f->>'issued_at')::timestamptz,(f->>'expires_at')::timestamptz) returning * into saved;
 return jsonb_build_object('cursor_id',saved.cursor_id,'receipt_id',saved.receipt_id,'response_body_sha256',saved.response_body_sha256);
end;$$;
revoke all on function operations_catering_reconciliation_private.verify_original_receipt_v1(uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function operations_catering_reconciliation_private.verify_original_receipt_v1(uuid,text,text,text,text,text,text) to service_role;
create function public.verify_operations_catering_original_receipt_v1(p_cursor_id uuid,p_key_id text,p_timestamp text,p_nonce text,p_request_raw text,p_response_raw text,p_signature text)
 returns jsonb language sql security invoker set search_path='' as $$select operations_catering_reconciliation_private.verify_original_receipt_v1(p_cursor_id,p_key_id,p_timestamp,p_nonce,p_request_raw,p_response_raw,p_signature);$$;
revoke all on function public.verify_operations_catering_original_receipt_v1(uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.verify_operations_catering_original_receipt_v1(uuid,text,text,text,text,text,text) to service_role;

-- Exact server-private transaction selection. No caller list/GUC grants authority.
create table operations_catering_reconciliation_private.original_receipt_scope_holds (
 id uuid primary key default gen_random_uuid(),cursor_id uuid not null references operations_catering_reconciliation_private.verified_cursors(cursor_id),
 cursor_sha256 text not null,organization_id uuid not null,finance_organization_id uuid not null,
 creation_txid xid8 not null,actor_system_user_id uuid,candidate_ids uuid[] not null,candidate_keys text[] not null,
 created_at timestamptz not null default clock_timestamp(),unique(cursor_id,creation_txid),
 check(cardinality(candidate_ids) between 1 and 8 and cardinality(candidate_keys) between 1 and 8)
);
alter table operations_catering_reconciliation_private.original_receipt_scope_holds enable row level security;
revoke all on operations_catering_reconciliation_private.original_receipt_scope_holds from public,anon,authenticated,service_role;
create trigger original_receipt_scope_hold_immutable before update or delete on operations_catering_reconciliation_private.original_receipt_scope_holds for each row execute function public.operations_personnel_evidence_immutable();
create trigger original_receipt_scope_hold_no_truncate before truncate on operations_catering_reconciliation_private.original_receipt_scope_holds for each statement execute function public.operations_personnel_evidence_immutable();
create index verified_original_receipt_cursor_scope on operations_catering_reconciliation_private.verified_original_receipts(cursor_id,expires_at,key_id,id);
create function operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;ids uuid[];keys text[];
begin
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 if not found or clock_timestamp()>=c.expires_at then raise exception 'signed original receipt cursor missing/expired' using errcode='42501';end if;
 select array_agg(r.id order by r.key_id,r.id),array_agg(distinct r.key_id order by r.key_id) into ids,keys
 from operations_catering_reconciliation_private.verified_original_receipts r join operations_catering_reconciliation_private.original_receipt_verification_keys k on k.key_id=r.key_id
 where r.cursor_id=c.cursor_id and r.cursor_sha256=c.cursor_sha256 and r.expires_at=c.expires_at and r.expires_at>clock_timestamp()
 and k.organization_id=c.organization_id and k.finance_organization_id=c.finance_organization_id and k.enabled;
 if ids is null or cardinality(ids) not between 1 and 8 then raise exception 'bounded independent original receipt candidate set unavailable' using errcode='42501';end if;
 return jsonb_build_object('cursor_id',c.cursor_id,'cursor_sha256',c.cursor_sha256,'organization_id',c.organization_id,'finance_organization_id',c.finance_organization_id,'candidate_ids',ids,'candidate_keys',keys);
end;$$;
revoke all on function operations_catering_reconciliation_private.original_receipt_candidates_v1(uuid) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.lock_selected_original_receipt_scopes_v1(p_cursor_id uuid,p_candidate_ids uuid[],p_candidate_keys text[])
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c operations_catering_reconciliation_private.verified_cursors%rowtype;selection jsonb;k text;r operations_catering_reconciliation_private.verified_original_receipts%rowtype;
begin
 selection:=operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id);
 if selection->'candidate_ids' is distinct from to_jsonb(p_candidate_ids) or selection->'candidate_keys' is distinct from to_jsonb(p_candidate_keys)
 then raise exception 'original receipt scope selection changed' using errcode='PT409';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=p_cursor_id;
 perform 1 from operations_catering_reconciliation_private.cursor_verification_keys where key_id=c.key_id and enabled for share;
 if not found then raise exception 'original cursor key disabled' using errcode='42501';end if;
 foreach k in array p_candidate_keys loop
 perform 1 from operations_catering_reconciliation_private.original_receipt_verification_keys where key_id=k and organization_id=c.organization_id and finance_organization_id=c.finance_organization_id and enabled for share;
 if not found then raise exception 'selected original receipt key revoked' using errcode='42501';end if;
 end loop;
 perform 1 from operations_catering_reconciliation_private.gates where organization_id=c.organization_id and enabled for share;
 if not found then raise exception 'original cursor gate disabled' using errcode='42501';end if;
 perform 1 from operations_catering_reconciliation_private.original_receipt_read_gates where organization_id=c.organization_id and enabled for share;
 if not found then raise exception 'original receipt gate disabled' using errcode='42501';end if;
 if selection is distinct from operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id)
 then raise exception 'original receipt scope selection changed after permission locks' using errcode='PT409';end if;
 for r in select * from operations_catering_reconciliation_private.verified_original_receipts where id=any(p_candidate_ids) order by key_id,id loop
 perform operations_catering_reconciliation_private.resolve_original_receipt_v1(r.cursor_id,r.key_id,r.response_timestamp,r.request_nonce,r.request_raw_body,r.response_raw_body,r.response_signature);
 end loop;
 return selection;
end;$$;
revoke all on function operations_catering_reconciliation_private.lock_selected_original_receipt_scopes_v1(uuid,uuid[],text[]) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.original_receipt_scope_hold_guard_v1() returns trigger
 language plpgsql security definer set search_path='' as $$
declare f jsonb;begin
 if new.creation_txid is distinct from pg_current_xact_id() or new.actor_system_user_id is distinct from auth.uid()
 then raise exception 'original receipt scope hold transaction ownership denied' using errcode='42501';end if;
 f:=operations_catering_reconciliation_private.lock_selected_original_receipt_scopes_v1(new.cursor_id,new.candidate_ids,new.candidate_keys);
 if f->>'cursor_sha256' is distinct from new.cursor_sha256 or f->>'organization_id' is distinct from new.organization_id::text or f->>'finance_organization_id' is distinct from new.finance_organization_id::text
 then raise exception 'original receipt scope hold metadata forged' using errcode='42501';end if;
 new.created_at:=clock_timestamp();return new;
end;$$;
revoke all on function operations_catering_reconciliation_private.original_receipt_scope_hold_guard_v1() from public,anon,authenticated,service_role;
create trigger original_receipt_scope_hold_binding before insert on operations_catering_reconciliation_private.original_receipt_scope_holds for each row execute function operations_catering_reconciliation_private.original_receipt_scope_hold_guard_v1();
-- Call this once BEFORE policy/map/stream/head locks. Reuse checks the immutable
-- current-TX hold without ever discovering/locking a new key behind those barriers.
create function operations_catering_reconciliation_private.lock_original_receipt_cursor_scopes_v1(p_cursor_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare hold operations_catering_reconciliation_private.original_receipt_scope_holds%rowtype;f jsonb;ids uuid[];keys text[];
begin
 select * into hold from operations_catering_reconciliation_private.original_receipt_scope_holds where cursor_id=p_cursor_id and creation_txid=pg_current_xact_id();
 f:=operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id);
 if found then
 if hold.actor_system_user_id is distinct from auth.uid() or hold.cursor_sha256 is distinct from f->>'cursor_sha256'
 or to_jsonb(hold.candidate_ids) is distinct from f->'candidate_ids' or to_jsonb(hold.candidate_keys) is distinct from f->'candidate_keys'
 then raise exception 'transaction original receipt selection changed' using errcode='PT409';end if;
 return hold.id;
 end if;
 select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(f->'candidate_ids') with ordinality;
 select array_agg(value order by ordinality) into keys from jsonb_array_elements_text(f->'candidate_keys') with ordinality;
 f:=operations_catering_reconciliation_private.lock_selected_original_receipt_scopes_v1(p_cursor_id,ids,keys);
 insert into operations_catering_reconciliation_private.original_receipt_scope_holds(cursor_id,cursor_sha256,organization_id,finance_organization_id,creation_txid,actor_system_user_id,candidate_ids,candidate_keys)
 values(p_cursor_id,f->>'cursor_sha256',(f->>'organization_id')::uuid,(f->>'finance_organization_id')::uuid,pg_current_xact_id(),auth.uid(),ids,keys) returning * into hold;
 return hold.id;
end;$$;
revoke all on function operations_catering_reconciliation_private.lock_original_receipt_cursor_scopes_v1(uuid) from public,anon,authenticated,service_role;
create function operations_catering_reconciliation_private.require_saved_original_receipt_v1(p_cursor_id uuid,p_local_receipt jsonb,p_scope_hold_id uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare hold operations_catering_reconciliation_private.original_receipt_scope_holds%rowtype;r operations_catering_reconciliation_private.verified_original_receipts%rowtype;f jsonb;good boolean:=false;
begin
 select * into hold from operations_catering_reconciliation_private.original_receipt_scope_holds where id=p_scope_hold_id;
 if not found or hold.cursor_id is distinct from p_cursor_id or hold.creation_txid is distinct from pg_current_xact_id() or hold.actor_system_user_id is distinct from auth.uid()
 then raise exception 'server original receipt permission hold unavailable' using errcode='42501';end if;
 f:=operations_catering_reconciliation_private.original_receipt_candidates_v1(p_cursor_id);
 if f->>'cursor_sha256' is distinct from hold.cursor_sha256 or f->'candidate_ids' is distinct from to_jsonb(hold.candidate_ids) or f->'candidate_keys' is distinct from to_jsonb(hold.candidate_keys)
 then raise exception 'original receipt selection changed before saved comparison' using errcode='PT409';end if;
 -- Fixed captured IDs prevent any phantom receipt/new key being acquired later,
 -- even if a valid concurrent cache INSERT lands after this set comparison.
 for r in select * from operations_catering_reconciliation_private.verified_original_receipts where id=any(hold.candidate_ids) and cursor_id=p_cursor_id and receipt=p_local_receipt order by key_id,id loop
 f:=operations_catering_reconciliation_private.resolve_original_receipt_v1(r.cursor_id,r.key_id,r.response_timestamp,r.request_nonce,r.request_raw_body,r.response_raw_body,r.response_signature);
 if f->'receipt' is distinct from p_local_receipt or f->>'cursor_sha256' is distinct from r.cursor_sha256 or f->>'request_body_sha256' is distinct from r.request_body_sha256 or f->>'response_body_sha256' is distinct from r.response_body_sha256
 then raise exception 'saved original receipt proof integrity denied' using errcode='42501';end if;
 good:=true;exit;
 end loop;
 if not good then raise exception 'saved signed original receipt does not equal local all13' using errcode='42501';end if;
end;$$;
revoke all on function operations_catering_reconciliation_private.require_saved_original_receipt_v1(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
