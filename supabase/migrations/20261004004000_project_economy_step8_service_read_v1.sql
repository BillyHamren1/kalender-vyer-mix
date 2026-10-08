-- Finance -> Operations Step 8 read channel. No key material or enrollment is
-- seeded: every destination/source tuple is default-off until provisioned.
create schema if not exists operations_step8_service_private;
revoke all on schema operations_step8_service_private from public,anon,authenticated,service_role;

-- Self-contained compact UTF-8/C-ordered JSON. The service channel must not
-- depend on the separately installed Operations economy helper.
create function operations_step8_service_private.canonical_json_v1(p_value jsonb)
returns text language plpgsql immutable strict security invoker set search_path='' as $$
declare v_result text;
begin
 case jsonb_typeof(p_value)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||operations_step8_service_private.canonical_json_v1(value),',' order by key collate "C"),'')||'}'
   into v_result from jsonb_each(p_value);
 when 'array' then select '['||coalesce(string_agg(operations_step8_service_private.canonical_json_v1(value),',' order by ord),'')||']'
   into v_result from jsonb_array_elements(p_value) with ordinality as a(value,ord);
 when 'number' then v_result:=case when p_value::numeric=trunc(p_value::numeric) then trunc(p_value::numeric)::text else p_value::text end;
 else v_result:=p_value::text;end case;
 return v_result;
end;$$;
revoke all on function operations_step8_service_private.canonical_json_v1(jsonb)
 from public,anon,authenticated,service_role;

-- Stop before descending beyond the service payload's bounded schema depth;
-- the guard itself never recurses more than p_max_depth + 1 frames.
create function operations_step8_service_private.json_depth_within_v1(
 p_value jsonb,p_depth integer,p_max_depth integer
) returns boolean language plpgsql immutable strict security invoker set search_path='' as $$
declare child jsonb;
begin
 if p_depth<1 or p_max_depth<1 or p_max_depth>32 or p_depth>p_max_depth then return false;end if;
 if jsonb_typeof(p_value)='object' then
  for child in select value from jsonb_each(p_value) loop
   if not operations_step8_service_private.json_depth_within_v1(child,p_depth+1,p_max_depth) then return false;end if;
  end loop;
 elsif jsonb_typeof(p_value)='array' then
  for child in select value from jsonb_array_elements(p_value) loop
   if not operations_step8_service_private.json_depth_within_v1(child,p_depth+1,p_max_depth) then return false;end if;
  end loop;
 end if;
 return true;
end;$$;
revoke all on function operations_step8_service_private.json_depth_within_v1(jsonb,integer,integer)
 from public,anon,authenticated,service_role;

create table operations_step8_service_private.request_keys(
 issuer text not null,audience text not null,key_id text not null,key_version integer not null check(key_version>0),
 secret bytea not null check(octet_length(secret)>=32),not_before timestamptz not null,expires_at timestamptz not null,
 revoked_at timestamptz,primary key(issuer,audience,key_id,key_version),check(expires_at>not_before),
 check(length(issuer) between 1 and 128 and issuer~'^[A-Za-z0-9._:@/-]+$'),
 check(length(audience) between 1 and 128 and audience~'^[A-Za-z0-9._:@/-]+$'),
 check(length(key_id) between 4 and 64 and key_id~'^[A-Za-z0-9_-]+$')
);
create table operations_step8_service_private.response_keys(
 issuer text not null,audience text not null,key_id text not null,key_version integer not null check(key_version>0),
 secret bytea not null check(octet_length(secret)>=32),not_before timestamptz not null,expires_at timestamptz not null,
 revoked_at timestamptz,primary key(issuer,audience,key_id,key_version),check(expires_at>not_before),
 check(length(issuer) between 1 and 128 and issuer~'^[A-Za-z0-9._:@/-]+$'),
 check(length(audience) between 1 and 128 and audience~'^[A-Za-z0-9._:@/-]+$'),
 check(length(key_id) between 4 and 64 and key_id~'^[A-Za-z0-9_-]+$')
);
create table operations_step8_service_private.enrollments(
 issuer text not null,audience text not null,request_key_id text not null,request_key_version integer not null,
 destination_organization_id uuid not null,destination_project_id uuid not null,
 source_organization_id uuid not null,source_project_id uuid not null,
 method text not null,route text not null,protocol text not null,
 response_issuer text not null,response_audience text not null,response_key_id text not null,response_key_version integer not null,
 enabled boolean not null default false,not_before timestamptz not null,expires_at timestamptz not null,revoked_at timestamptz,
 primary key(issuer,audience,request_key_id,request_key_version,destination_organization_id,destination_project_id,
   source_organization_id,source_project_id,method,route,protocol),
 foreign key(issuer,audience,request_key_id,request_key_version)
   references operations_step8_service_private.request_keys(issuer,audience,key_id,key_version),
 foreign key(response_issuer,response_audience,response_key_id,response_key_version)
   references operations_step8_service_private.response_keys(issuer,audience,key_id,key_version),
 check(expires_at>not_before),
 check(length(issuer) between 1 and 128 and length(audience) between 1 and 128),
 check(length(request_key_id) between 4 and 64 and length(response_key_id) between 4 and 64),
 check(method='POST' and route='/functions/v1/project-economy-step8-service-read'
   and protocol='eventflow-project-economy-step8-read.v1'),
 check(response_issuer='eventflow-operations' and response_audience='eventflow-finance-project-economy-step8')
);
create table operations_step8_service_private.receipts(
 request_issuer text not null,request_key_id text not null,nonce text not null,
 request_audience text not null,request_key_version integer not null,request_body_sha256 text not null check(request_body_sha256~'^[0-9a-f]{64}$'),
 raw_request text not null,destination_organization_id uuid not null,destination_project_id uuid not null,
 source_organization_id uuid not null,source_project_id uuid not null,source_set_fingerprint text not null,
 source_count integer not null,response_status integer not null,raw_response text not null,response_headers jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(request_issuer,request_key_id,nonce),
 check(length(request_issuer) between 1 and 128 and length(request_key_id) between 4 and 64),
 check(nonce~'^[A-Za-z0-9_-]{43}$'),check(request_body_sha256~'^[0-9a-f]{64}$'),
 check(source_set_fingerprint~'^[0-9a-f]{64}$'),check(source_count between 1 and 50),
 check(response_status in(200,409)),check(octet_length(raw_request)<=4096),check(octet_length(raw_response)<=307200)
);
revoke all on all tables in schema operations_step8_service_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema operations_step8_service_private from public,anon,authenticated,service_role;

create function operations_step8_service_private.receipts_append_only_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare cleanup_before timestamptz;
begin
 if tg_op='DELETE' and current_setting('operations_step8_service.cleanup',true)='enabled' then
  begin cleanup_before:=current_setting('operations_step8_service.cleanup_before',true)::timestamptz;
  exception when others then cleanup_before:=null;end;
  if cleanup_before is not null and old.created_at<cleanup_before
   and (old.response_headers->>'expiresAt')::bigint<floor(extract(epoch from clock_timestamp()))::bigint then return old;end if;
 end if;
 raise exception 'step8_service_receipt_append_only' using errcode='55000';
end;$$;
create trigger operations_step8_service_receipts_append_only_v1 before update or delete
on operations_step8_service_private.receipts for each row
execute function operations_step8_service_private.receipts_append_only_v1();
create trigger operations_step8_service_receipts_no_truncate_v1 before truncate
on operations_step8_service_private.receipts for each statement
execute function operations_step8_service_private.receipts_append_only_v1();
revoke all on function operations_step8_service_private.receipts_append_only_v1() from public,anon,authenticated,service_role;

create function operations_step8_service_private.cleanup_expired_receipts_v1(p_before timestamptz) returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare deleted_count bigint;
begin
 if p_before is null or p_before>clock_timestamp() then raise exception 'step8_service_cleanup_cutoff_invalid' using errcode='22023';end if;
 perform set_config('operations_step8_service.cleanup','enabled',true);
 perform set_config('operations_step8_service.cleanup_before',p_before::text,true);
 delete from operations_step8_service_private.receipts
 where created_at<p_before and (response_headers->>'expiresAt')::bigint<floor(extract(epoch from clock_timestamp()))::bigint;
 get diagnostics deleted_count=row_count;
 return deleted_count;
end;$$;
revoke all on function operations_step8_service_private.cleanup_expired_receipts_v1(timestamptz)
 from public,anon,authenticated,service_role;

create function public.read_project_economy_step8_service_v1(p_raw_body text,p_headers jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_variable
declare
 b jsonb;expected_raw text;
 dest_org uuid;dest_project uuid;source_org uuid;source_project uuid;source_fp text;source_count integer;
 actor_hash text;auth_checked bigint;issued bigint;expires bigint;request_id text;nonce text;
 method text;route text;protocol text;issuer text;audience text;kid text;key_version integer;body_hash text;signature text;
 request_secret bytea;request_frame text;e operations_step8_service_private.enrollments%rowtype;
 response_secret bytea;r operations_step8_service_private.receipts%rowtype;receipt_found boolean:=false;
 payload jsonb;payload_raw text;payload_hash text;outcome text;status integer;
 nonce_hash text;response_body jsonb;response_raw text;response_hash text;response_signature text;response_headers jsonb;
begin
 -- Preserve and compare raw bytes. Parsing before this comparison must not make
 -- duplicate keys, whitespace, number spellings or key order acceptable.
 if p_raw_body is null or octet_length(p_raw_body)>4096 then
   raise exception 'step8_service_raw_body_invalid' using errcode='22023';
 end if;
 begin b:=p_raw_body::jsonb;exception when others then
   raise exception 'step8_service_raw_body_invalid' using errcode='22023';
 end;
 if jsonb_typeof(b)<>'object' or (select count(*) from jsonb_object_keys(b))<>18
  or not (b ?& array['actorSubjectHash','audience','authCheckedAt','destinationOrganizationId','destinationProjectId',
   'expiresAt','issuedAt','issuer','mappingBasis','nonce','operation','requestId','schemaVersion','shadowOnly',
   'sourceCount','sourceOrganizationId','sourceProjectId','sourceSetFingerprint'])
  or jsonb_typeof(b->'actorSubjectHash')<>'string' or jsonb_typeof(b->'audience')<>'string'
  or jsonb_typeof(b->'destinationOrganizationId')<>'string' or jsonb_typeof(b->'destinationProjectId')<>'string'
  or jsonb_typeof(b->'issuer')<>'string' or jsonb_typeof(b->'mappingBasis')<>'string'
  or jsonb_typeof(b->'nonce')<>'string' or jsonb_typeof(b->'operation')<>'string'
  or jsonb_typeof(b->'requestId')<>'string' or jsonb_typeof(b->'schemaVersion')<>'string'
  or jsonb_typeof(b->'sourceOrganizationId')<>'string' or jsonb_typeof(b->'sourceProjectId')<>'string'
  or jsonb_typeof(b->'sourceSetFingerprint')<>'string'
  or b->>'schemaVersion'<>'eventflow.finance.operations-project-economy-read-request.v1'
  or b->>'issuer'<>'eventflow-finance'
  or b->>'audience'<>'eventflow-operations-project-economy-step8'
  or b->>'operation'<>'read' or b->>'mappingBasis'<>'finance_local_current_component_map'
  or b->'shadowOnly'<>'true'::jsonb
  or jsonb_typeof(b->'authCheckedAt')<>'number' or jsonb_typeof(b->'issuedAt')<>'number'
  or jsonb_typeof(b->'expiresAt')<>'number' or jsonb_typeof(b->'sourceCount')<>'number' then
   raise exception 'step8_service_request_contract_invalid' using errcode='22023';
 end if;
 if p_raw_body!~'"authCheckedAt":[1-9][0-9]*,"destinationOrganizationId"'
  or p_raw_body!~'"expiresAt":[1-9][0-9]*,"issuedAt"'
  or p_raw_body!~'"issuedAt":[1-9][0-9]*,"issuer"'
  or p_raw_body!~'"sourceCount":[1-9][0-9]*,"sourceOrganizationId"' then
   raise exception 'step8_service_request_contract_invalid' using errcode='22023';
 end if;
 begin
   dest_org:=(b->>'destinationOrganizationId')::uuid;dest_project:=(b->>'destinationProjectId')::uuid;
   source_org:=(b->>'sourceOrganizationId')::uuid;source_project:=(b->>'sourceProjectId')::uuid;
   source_count:=(b->>'sourceCount')::integer;auth_checked:=(b->>'authCheckedAt')::bigint;
   issued:=(b->>'issuedAt')::bigint;expires:=(b->>'expiresAt')::bigint;
 exception when others then raise exception 'step8_service_request_contract_invalid' using errcode='22023';end;
 actor_hash:=b->>'actorSubjectHash';source_fp:=b->>'sourceSetFingerprint';request_id:=b->>'requestId';nonce:=b->>'nonce';
 if not (b->>'destinationOrganizationId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not (b->>'destinationProjectId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not (b->>'sourceOrganizationId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not (b->>'sourceProjectId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not (request_id~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not (actor_hash~'^[0-9a-f]{64}$') or not (source_fp~'^[0-9a-f]{64}$')
  or not (nonce~'^[A-Za-z0-9_-]{43}$') or source_count<1 or source_count>50
  or auth_checked<=0 or issued<=0 or expires<=0 or auth_checked>issued or issued-auth_checked>60
  or expires<=issued or expires-issued>60 then raise exception 'step8_service_request_contract_invalid' using errcode='22023';
 end if;
 expected_raw:=format(
   '{"actorSubjectHash":"%s","audience":"eventflow-operations-project-economy-step8","authCheckedAt":%s,"destinationOrganizationId":"%s","destinationProjectId":"%s","expiresAt":%s,"issuedAt":%s,"issuer":"eventflow-finance","mappingBasis":"finance_local_current_component_map","nonce":"%s","operation":"read","requestId":"%s","schemaVersion":"eventflow.finance.operations-project-economy-read-request.v1","shadowOnly":true,"sourceCount":%s,"sourceOrganizationId":"%s","sourceProjectId":"%s","sourceSetFingerprint":"%s"}',
   actor_hash,auth_checked,dest_org::text,dest_project::text,expires,issued,nonce,request_id,source_count,
   source_org::text,source_project::text,source_fp);
 if p_raw_body<>expected_raw then raise exception 'step8_service_noncanonical_or_duplicate_body' using errcode='22023';end if;

 if p_headers is null or jsonb_typeof(p_headers)<>'object' or (select count(*) from jsonb_object_keys(p_headers))<>15
  or not (p_headers ?& array['method','route','protocol','issuer','audience','requestKeyId','requestKeyVersion',
   'requestId','nonce','issuedAt','expiresAt','bodySha256','actorSubjectHash','authCheckedAt','signature'])
  or jsonb_typeof(p_headers->'method')<>'string' or jsonb_typeof(p_headers->'route')<>'string'
  or jsonb_typeof(p_headers->'protocol')<>'string' or jsonb_typeof(p_headers->'issuer')<>'string'
  or jsonb_typeof(p_headers->'audience')<>'string' or jsonb_typeof(p_headers->'requestKeyId')<>'string'
  or jsonb_typeof(p_headers->'requestId')<>'string' or jsonb_typeof(p_headers->'nonce')<>'string'
  or jsonb_typeof(p_headers->'bodySha256')<>'string' or jsonb_typeof(p_headers->'actorSubjectHash')<>'string'
  or jsonb_typeof(p_headers->'requestKeyVersion')<>'number' or jsonb_typeof(p_headers->'issuedAt')<>'number'
  or jsonb_typeof(p_headers->'expiresAt')<>'number' or jsonb_typeof(p_headers->'authCheckedAt')<>'number'
  or p_headers->>'requestKeyVersion'!~'^[1-9][0-9]{0,8}$'
  or p_headers->>'issuedAt'!~'^[1-9][0-9]{0,15}$' or p_headers->>'expiresAt'!~'^[1-9][0-9]{0,15}$'
  or p_headers->>'authCheckedAt'!~'^[1-9][0-9]{0,15}$'
  or (length(p_headers->>'issuedAt')=16 and p_headers->>'issuedAt'>'9007199254740991')
  or (length(p_headers->>'expiresAt')=16 and p_headers->>'expiresAt'>'9007199254740991')
  or (length(p_headers->>'authCheckedAt')=16 and p_headers->>'authCheckedAt'>'9007199254740991') then
   raise exception 'step8_service_headers_invalid' using errcode='22023';
 end if;
 if jsonb_typeof(p_headers->'signature')<>'string' then
  raise exception 'step8_service_request_authentication_failed' using errcode='28000';
 end if;
 method:=p_headers->>'method';route:=p_headers->>'route';protocol:=p_headers->>'protocol';issuer:=p_headers->>'issuer';
 audience:=p_headers->>'audience';kid:=p_headers->>'requestKeyId';body_hash:=p_headers->>'bodySha256';signature:=p_headers->>'signature';
 begin key_version:=(p_headers->>'requestKeyVersion')::integer;exception when others then
   raise exception 'step8_service_headers_invalid' using errcode='22023';end;
 if method is distinct from 'POST' or route is distinct from '/functions/v1/project-economy-step8-service-read'
  or protocol is distinct from 'eventflow-project-economy-step8-read.v1' or issuer is distinct from 'eventflow-finance'
  or audience is distinct from 'eventflow-operations-project-economy-step8'
  or not (kid~'^[A-Za-z0-9_-]{4,64}$') or key_version<=0
  or p_headers->>'requestId'<>request_id or p_headers->>'nonce'<>nonce
  or p_headers->>'issuedAt'<>issued::text or p_headers->>'expiresAt'<>expires::text
  or p_headers->>'actorSubjectHash'<>actor_hash or p_headers->>'authCheckedAt'<>auth_checked::text
  or not (body_hash~'^[0-9a-f]{64}$') or body_hash<>encode(sha256(convert_to(p_raw_body,'UTF8')),'hex')
  or signature is null or signature!~'^hmac-sha256=[0-9a-f]{64}$'
  or issued>floor(extract(epoch from clock_timestamp()))::bigint+5
  or expires<=floor(extract(epoch from clock_timestamp()))::bigint then
   raise exception 'step8_service_request_authentication_failed' using errcode='28000';
 end if;
 select k.secret into request_secret from operations_step8_service_private.request_keys k
 where k.issuer=issuer and k.audience=audience and k.key_id=kid and k.key_version=key_version
  and k.revoked_at is null and k.not_before<=to_timestamp(issued) and k.expires_at>=to_timestamp(expires);
 if request_secret is null then raise exception 'step8_service_request_authentication_failed' using errcode='28000';end if;
 request_frame:=concat_ws(E'\n','hmac-sha256',protocol,method,route,issuer,audience,kid,key_version::text,
  request_id,nonce,issued::text,expires::text,body_hash,actor_hash,auth_checked::text);
 if substring(signature from 13) is distinct from encode(public.hmac(convert_to(request_frame,'UTF8'),request_secret,'sha256'),'hex') then
   raise exception 'step8_service_request_authentication_failed' using errcode='28000';
 end if;

 select x.* into e from operations_step8_service_private.enrollments x
 where x.issuer=issuer and x.audience=audience and x.request_key_id=kid and x.request_key_version=key_version
  and x.destination_organization_id=dest_org and x.destination_project_id=dest_project
  and x.source_organization_id=source_org and x.source_project_id=source_project
  and x.method=method and x.route=route and x.protocol=protocol and x.enabled=true and x.revoked_at is null
  and x.not_before<=to_timestamp(issued) and x.expires_at>=to_timestamp(expires);
 if not found then raise exception 'step8_service_tuple_not_enrolled' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(E'\n','eventflow-step8-service-receipt.v1',issuer,kid,nonce),0));
 -- Re-read and row-lock every revocable fact after serialization. The locks are
 -- held through replay/sign/receipt, so revoke and key rotation cannot race it.
 select k.secret into request_secret from operations_step8_service_private.request_keys k
 where k.issuer=issuer and k.audience=audience and k.key_id=kid and k.key_version=key_version
  and k.secret=request_secret and k.revoked_at is null
  and k.not_before<=clock_timestamp() and k.expires_at>=to_timestamp(expires)
 for share;
 if not found then raise exception 'step8_service_request_authentication_failed' using errcode='28000';end if;
 select x.* into e from operations_step8_service_private.enrollments x
 where x.issuer=issuer and x.audience=audience and x.request_key_id=kid and x.request_key_version=key_version
  and x.destination_organization_id=dest_org and x.destination_project_id=dest_project
  and x.source_organization_id=source_org and x.source_project_id=source_project
  and x.method=method and x.route=route and x.protocol=protocol and x.enabled=true and x.revoked_at is null
  and x.not_before<=clock_timestamp() and x.expires_at>=to_timestamp(expires)
 for share;
 if not found then raise exception 'step8_service_tuple_not_enrolled' using errcode='42501';end if;
 select k.secret into response_secret from operations_step8_service_private.response_keys k
 where k.issuer=e.response_issuer and k.audience=e.response_audience and k.key_id=e.response_key_id
  and k.key_version=e.response_key_version and k.revoked_at is null
  and k.not_before<=clock_timestamp() and k.expires_at>=to_timestamp(expires)
 for share;
 if not found or e.response_issuer<>'eventflow-operations'
  or e.response_audience<>'eventflow-finance-project-economy-step8'
  or response_secret=request_secret then raise exception 'step8_service_tuple_not_enrolled' using errcode='42501';end if;

 select x.* into r from operations_step8_service_private.receipts x
 where x.request_issuer=issuer and x.request_key_id=kid and x.nonce=nonce;
 receipt_found:=found;
 if receipt_found and r.request_audience=audience and r.request_key_version=key_version and r.request_body_sha256=body_hash
  and r.raw_request=p_raw_body and r.destination_organization_id=dest_org and r.destination_project_id=dest_project
  and r.source_organization_id=source_org and r.source_project_id=source_project
  and r.source_set_fingerprint=source_fp and r.source_count=source_count then
   return jsonb_build_object('status',r.response_status,'rawBody',r.raw_response,'responseHeaders',r.response_headers);
 elsif receipt_found then
  raise exception 'step8_service_nonce_collision' using errcode='23505';
 else
   begin
    payload:=operations_economy_private.project_economy_step8_shadow_payload_v1(source_org,source_project);
    if payload is null or jsonb_typeof(payload)<>'object'
     or (select count(*) from jsonb_object_keys(payload))<>13
     or not (payload ?& array['authority','authoritativeTotals','coverage','exceptions','financeRecalculated',
      'generatedAt','invoices','organizationId','personnel','projectId','replacesLegacyTotals','schema','shadowOnly'])
     or jsonb_typeof(payload->'schema')<>'string'
     or jsonb_typeof(payload->'organizationId')<>'string' or jsonb_typeof(payload->'projectId')<>'string'
     or jsonb_typeof(payload->'authority')<>'string'
     or payload->>'schema'<>'operations-project-economy-step8-shadow.v1'
     or payload->>'organizationId'<>source_org::text or payload->>'projectId'<>source_project::text
     or payload->>'authority'<>'operations_received_evidence'
     or jsonb_typeof(payload->'generatedAt')<>'string'
     or length(payload->>'generatedAt') not between 1 and 64
     or payload->'generatedAt' is distinct from to_jsonb(now())
     or jsonb_typeof(payload->'personnel')<>'array' or jsonb_typeof(payload->'invoices')<>'array'
     or jsonb_typeof(payload->'exceptions')<>'array' or jsonb_typeof(payload->'coverage')<>'object'
     or (select count(*) from jsonb_object_keys(payload->'coverage'))<>2
     or not (payload->'coverage' ?& array['personnel','invoices'])
     or payload->'authoritativeTotals'<>'false'::jsonb or payload->'financeRecalculated'<>'false'::jsonb
     or payload->'replacesLegacyTotals'<>'false'::jsonb or payload->'shadowOnly'<>'true'::jsonb then
      raise exception 'step8_service_projector_payload_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(payload->'personnel')>500 or jsonb_array_length(payload->'invoices')>500
     or jsonb_array_length(payload->'exceptions')>2500
     or coalesce(payload->'coverage'->>'personnel','') not in('complete','incomplete','unavailable')
     or coalesce(payload->'coverage'->>'invoices','') not in('complete','incomplete','unavailable')
     or payload->'coverage'->>'personnel' is distinct from (case
       when jsonb_array_length(payload->'personnel')=0 then 'unavailable'
       when exists(select 1 from jsonb_array_elements(payload->'personnel') coverage_row
        where coverage_row->>'coverage'<>'complete') then 'incomplete' else 'complete' end)
     or payload->'coverage'->>'invoices' is distinct from (case
       when jsonb_array_length(payload->'invoices')=0 then 'unavailable'
       when exists(select 1 from jsonb_array_elements(payload->'invoices') coverage_row
        where jsonb_array_length(coverage_row->'exceptions')>0) then 'incomplete' else 'complete' end)
     or exists(select 1 from jsonb_array_elements(payload->'personnel') x where jsonb_typeof(x)<>'object')
     or exists(select 1 from jsonb_array_elements(payload->'invoices') x where jsonb_typeof(x)<>'object')
     or exists(select 1 from jsonb_array_elements(payload->'exceptions') x where jsonb_typeof(x)<>'object')
     or not operations_step8_service_private.json_depth_within_v1(payload,1,8)
     or octet_length(payload::text)>262144 then
      raise exception 'step8_service_projector_payload_invalid' using errcode='22023';
    end if;
    -- The projector output is canonicalized only after every nested key has been
    -- reduced to the explicit ASCII schema and every nested value has the
    -- expected scalar/array shape. This also bounds recursive canonicalization.
    if exists(
      select 1 from jsonb_array_elements(payload->'personnel') personnel_row(row_value)
      where (select count(*) from jsonb_object_keys(personnel_row.row_value))<>14
       or not (personnel_row.row_value ?& array['organizationId','projectId','sourceBookingId','sourceTimeStreamKey',
        'reportId','lineId','revision','timeSnapshotVersion','workDate','minutes','amountMinor','currency','status','coverage'])
       or exists(select 1 from jsonb_each(personnel_row.row_value) field where jsonb_typeof(field.value) in('object','array'))
    ) or exists(
      select 1 from jsonb_array_elements(payload->'invoices') invoice_row(row_value)
      where (select count(*) from jsonb_object_keys(invoice_row.row_value))<>26
       or not (invoice_row.row_value ?& array['organizationId','projectId','sourceOrganizationId','invoiceId','allocationId',
        'revision','sourceProtocol','sourceEconomicRevision','sourceEconomicFingerprint','sourceObservationId',
        'publicationFingerprint','documentFingerprint','kind','amountMinor','currency','status','approvalState',
        'accountingState','settlementState','sourceChanged','creditRelationCoverage','creditRelationshipFingerprint',
        'sourceAnchor','creditedSourceAnchor','unallocatedMinor','exceptions'])
       or jsonb_typeof(invoice_row.row_value->'exceptions')<>'array'
       or exists(select 1 from jsonb_each(invoice_row.row_value) field
        where field.key<>'exceptions' and jsonb_typeof(field.value) in('object','array'))
       or exists(select 1 from jsonb_array_elements(invoice_row.row_value->'exceptions') exception_value
        where jsonb_typeof(exception_value)<>'string')
    ) or exists(
      select 1 from jsonb_array_elements(payload->'exceptions') exception_row(row_value)
      where (select count(*) from jsonb_object_keys(exception_row.row_value))<>4
       or not (exception_row.row_value ?& array['category','identity','code','amountMinor'])
       or exists(select 1 from jsonb_each(exception_row.row_value) field where jsonb_typeof(field.value) in('object','array'))
    ) then
      raise exception 'step8_service_projector_payload_invalid' using errcode='22023';
    end if;
    if exists(
      select 1 from jsonb_array_elements(payload->'personnel') personnel_row(row_value)
      where jsonb_typeof(personnel_row.row_value->'organizationId')<>'string'
       or personnel_row.row_value->>'organizationId'<>source_org::text
       or jsonb_typeof(personnel_row.row_value->'projectId')<>'string'
       or personnel_row.row_value->>'projectId'<>source_project::text
       or (personnel_row.row_value->'sourceBookingId'<>'null'::jsonb and
        (jsonb_typeof(personnel_row.row_value->'sourceBookingId')<>'string' or
         personnel_row.row_value->>'sourceBookingId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
       or jsonb_typeof(personnel_row.row_value->'sourceTimeStreamKey')<>'string'
       or personnel_row.row_value->>'sourceTimeStreamKey'!~'^[0-9a-f]{64}$'
       or jsonb_typeof(personnel_row.row_value->'reportId')<>'string'
       or personnel_row.row_value->>'reportId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(personnel_row.row_value->'lineId')<>'string'
       or length(personnel_row.row_value->>'lineId') not between 1 and 256
       or btrim(personnel_row.row_value->>'lineId')<>personnel_row.row_value->>'lineId'
       or jsonb_typeof(personnel_row.row_value->'revision')<>'number'
       or personnel_row.row_value->>'revision'!~'^[1-9][0-9]{0,15}$'
       or (length(personnel_row.row_value->>'revision')=16 and personnel_row.row_value->>'revision'>'9007199254740991')
       or jsonb_typeof(personnel_row.row_value->'timeSnapshotVersion')<>'number'
       or personnel_row.row_value->>'timeSnapshotVersion'!~'^[1-9][0-9]{0,15}$'
       or (length(personnel_row.row_value->>'timeSnapshotVersion')=16 and personnel_row.row_value->>'timeSnapshotVersion'>'9007199254740991')
       or jsonb_typeof(personnel_row.row_value->'workDate')<>'string'
       or not (case
        when left(personnel_row.row_value->>'workDate',4)='0000' then false
        when personnel_row.row_value->>'workDate'~'^\d{4}-(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$' then true
        when personnel_row.row_value->>'workDate'~'^\d{4}-(04|06|09|11)-(0[1-9]|[12][0-9]|30)$' then true
        when personnel_row.row_value->>'workDate'~'^\d{4}-02-(0[1-9]|1[0-9]|2[0-8])$' then true
        when personnel_row.row_value->>'workDate'~'^\d{4}-02-29$' then
         ((substring(personnel_row.row_value->>'workDate' from 1 for 4))::integer%400=0 or
          ((substring(personnel_row.row_value->>'workDate' from 1 for 4))::integer%4=0 and
           (substring(personnel_row.row_value->>'workDate' from 1 for 4))::integer%100<>0))
        else false end)
       or jsonb_typeof(personnel_row.row_value->'minutes')<>'number'
       or personnel_row.row_value->>'minutes'!~'^(0|[1-9][0-9]{0,15})$'
       or (length(personnel_row.row_value->>'minutes')=16 and personnel_row.row_value->>'minutes'>'9007199254740991')
       or (personnel_row.row_value->'amountMinor'<>'null'::jsonb and
        not (case when jsonb_typeof(personnel_row.row_value->'amountMinor')='number' then
         (personnel_row.row_value->>'amountMinor')::numeric=trunc((personnel_row.row_value->>'amountMinor')::numeric)
         and (personnel_row.row_value->>'amountMinor')::numeric between 0 and 9007199254740991 else false end))
       or jsonb_typeof(personnel_row.row_value->'currency')<>'string'
       or personnel_row.row_value->>'currency'!~'^[A-Z]{3}$'
       or jsonb_typeof(personnel_row.row_value->'status')<>'string'
       or coalesce(personnel_row.row_value->>'status','') not in('preliminary','confirmed','rejected')
       or jsonb_typeof(personnel_row.row_value->'coverage')<>'string'
       or coalesce(personnel_row.row_value->>'coverage','') not in('complete','missing_rate')
       or (personnel_row.row_value->>'coverage'='missing_rate' and personnel_row.row_value->'amountMinor'<>'null'::jsonb)
       or (personnel_row.row_value->>'coverage'='complete' and personnel_row.row_value->'amountMinor'='null'::jsonb)
    ) or exists(
      select 1 from jsonb_array_elements(payload->'invoices') invoice_row(row_value)
      where jsonb_typeof(invoice_row.row_value->'organizationId')<>'string'
       or invoice_row.row_value->>'organizationId'<>source_org::text
       or jsonb_typeof(invoice_row.row_value->'projectId')<>'string'
       or invoice_row.row_value->>'projectId'<>source_project::text
       or jsonb_typeof(invoice_row.row_value->'sourceOrganizationId')<>'string'
       or invoice_row.row_value->>'sourceOrganizationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(invoice_row.row_value->'invoiceId')<>'string'
       or invoice_row.row_value->>'invoiceId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(invoice_row.row_value->'allocationId')<>'string'
       or invoice_row.row_value->>'allocationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(invoice_row.row_value->'sourceObservationId')<>'string'
       or invoice_row.row_value->>'sourceObservationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (invoice_row.row_value->>'sourceProtocol'='v2' and (
        invoice_row.row_value->>'sourceOrganizationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or invoice_row.row_value->>'invoiceId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or invoice_row.row_value->>'allocationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or invoice_row.row_value->>'sourceObservationId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
       or jsonb_typeof(invoice_row.row_value->'revision')<>'number'
       or invoice_row.row_value->>'revision'!~'^[1-9][0-9]{0,15}$'
       or (length(invoice_row.row_value->>'revision')=16 and invoice_row.row_value->>'revision'>'9007199254740991')
       or jsonb_typeof(invoice_row.row_value->'sourceEconomicRevision')<>'number'
       or invoice_row.row_value->>'sourceEconomicRevision'!~'^[1-9][0-9]{0,15}$'
       or (length(invoice_row.row_value->>'sourceEconomicRevision')=16 and invoice_row.row_value->>'sourceEconomicRevision'>'9007199254740991')
       or jsonb_typeof(invoice_row.row_value->'sourceProtocol')<>'string'
       or coalesce(invoice_row.row_value->>'sourceProtocol','') not in('v1','v2')
       or jsonb_typeof(invoice_row.row_value->'sourceEconomicFingerprint')<>'string'
       or invoice_row.row_value->>'sourceEconomicFingerprint'!~'^[0-9a-f]{64}$'
       or jsonb_typeof(invoice_row.row_value->'publicationFingerprint')<>'string'
       or invoice_row.row_value->>'publicationFingerprint'!~'^[0-9a-f]{64}$'
       or jsonb_typeof(invoice_row.row_value->'documentFingerprint')<>'string'
       or invoice_row.row_value->>'documentFingerprint'!~'^[0-9a-f]{64}$'
       or jsonb_typeof(invoice_row.row_value->'kind')<>'string'
       or coalesce(invoice_row.row_value->>'kind','') not in('invoice','credit')
       or not (case when jsonb_typeof(invoice_row.row_value->'amountMinor')='number' then
        (invoice_row.row_value->>'amountMinor')::numeric=trunc((invoice_row.row_value->>'amountMinor')::numeric)
        and abs((invoice_row.row_value->>'amountMinor')::numeric)<=9007199254740991
        and ((invoice_row.row_value->>'kind'='invoice' and (invoice_row.row_value->>'amountMinor')::numeric>0)
         or (invoice_row.row_value->>'kind'='credit' and (invoice_row.row_value->>'amountMinor')::numeric<0)) else false end)
       or jsonb_typeof(invoice_row.row_value->'unallocatedMinor')<>'number'
       or invoice_row.row_value->>'unallocatedMinor'!~'^-?(0|[1-9][0-9]{0,15})$'
       or (length(ltrim(invoice_row.row_value->>'unallocatedMinor','-'))=16 and ltrim(invoice_row.row_value->>'unallocatedMinor','-')>'9007199254740991')
       or jsonb_typeof(invoice_row.row_value->'currency')<>'string'
       or invoice_row.row_value->>'currency'!~'^[A-Z]{3}$'
       or jsonb_typeof(invoice_row.row_value->'status')<>'string'
       or coalesce(invoice_row.row_value->>'status','') not in('preliminary','confirmed','rejected')
       or jsonb_typeof(invoice_row.row_value->'approvalState')<>'string'
       or coalesce(invoice_row.row_value->>'approvalState','') not in('pending','not_pending')
       or jsonb_typeof(invoice_row.row_value->'accountingState')<>'string'
       or coalesce(invoice_row.row_value->>'accountingState','') not in('draft','booked','cancelled')
       or jsonb_typeof(invoice_row.row_value->'settlementState')<>'string'
       or coalesce(invoice_row.row_value->>'settlementState','') not in('unpaid','part_paid','paid','inconsistent')
       or jsonb_typeof(invoice_row.row_value->'sourceChanged')<>'boolean'
       or jsonb_typeof(invoice_row.row_value->'creditRelationCoverage')<>'string'
       or coalesce(invoice_row.row_value->>'creditRelationCoverage','') not in('not_applicable','unresolved','linked')
       or (invoice_row.row_value->'creditRelationshipFingerprint'<>'null'::jsonb and
        (jsonb_typeof(invoice_row.row_value->'creditRelationshipFingerprint')<>'string' or
         invoice_row.row_value->>'creditRelationshipFingerprint'!~'^[0-9a-f]{64}$'))
       or (invoice_row.row_value->'sourceAnchor'<>'null'::jsonb and
        (jsonb_typeof(invoice_row.row_value->'sourceAnchor')<>'string' or invoice_row.row_value->>'sourceAnchor'!~'^[0-9a-f]{64}$'))
       or (invoice_row.row_value->'creditedSourceAnchor'<>'null'::jsonb and
        (jsonb_typeof(invoice_row.row_value->'creditedSourceAnchor')<>'string' or
         invoice_row.row_value->>'creditedSourceAnchor'!~'^[0-9a-f]{64}$'))
       or (invoice_row.row_value->>'kind'='invoice' and
        (invoice_row.row_value->>'creditRelationCoverage'<>'not_applicable'
         or invoice_row.row_value->'creditRelationshipFingerprint'<>'null'::jsonb
         or invoice_row.row_value->'creditedSourceAnchor'<>'null'::jsonb))
       or (invoice_row.row_value->>'kind'='credit' and invoice_row.row_value->>'creditRelationCoverage'='not_applicable')
       or (invoice_row.row_value->>'status'='confirmed' and invoice_row.row_value->'sourceChanged'='true'::jsonb)
       or (invoice_row.row_value->>'sourceProtocol'='v1' and
        (invoice_row.row_value->'sourceAnchor'<>'null'::jsonb
         or invoice_row.row_value->'creditedSourceAnchor'<>'null'::jsonb
         or invoice_row.row_value->'creditRelationshipFingerprint'<>'null'::jsonb
         or invoice_row.row_value->>'creditRelationCoverage'='linked'
         or invoice_row.row_value->>'sourceEconomicRevision'<>invoice_row.row_value->>'revision'
         or invoice_row.row_value->>'sourceEconomicFingerprint'<>invoice_row.row_value->>'publicationFingerprint'))
       or (invoice_row.row_value->>'sourceProtocol'='v2' and invoice_row.row_value->'sourceAnchor'='null'::jsonb)
       or (invoice_row.row_value->>'sourceProtocol'='v2' and invoice_row.row_value->>'sourceAnchor' is distinct from
        encode(sha256(convert_to(array_to_string(array['finance-invoice-allocation-source-anchor-v1',
         lower(invoice_row.row_value->>'sourceOrganizationId'),lower(invoice_row.row_value->>'invoiceId'),
         lower(invoice_row.row_value->>'allocationId'),lower(invoice_row.row_value->>'documentFingerprint'),
         upper(invoice_row.row_value->>'currency')],chr(10)),'UTF8')),'hex'))
       or (invoice_row.row_value->>'sourceProtocol'='v2'
        and invoice_row.row_value->'creditedSourceAnchor'<>'null'::jsonb
        and invoice_row.row_value->>'sourceAnchor'=invoice_row.row_value->>'creditedSourceAnchor')
       or (invoice_row.row_value->>'creditRelationCoverage'='linked' and
        (invoice_row.row_value->'creditRelationshipFingerprint'='null'::jsonb
         or invoice_row.row_value->'sourceAnchor'='null'::jsonb
         or invoice_row.row_value->'creditedSourceAnchor'='null'::jsonb
         or invoice_row.row_value->>'sourceAnchor'=invoice_row.row_value->>'creditedSourceAnchor'))
       or jsonb_array_length(invoice_row.row_value->'exceptions')>4
       or jsonb_array_length(invoice_row.row_value->'exceptions')<>(select count(distinct code)
        from jsonb_array_elements_text(invoice_row.row_value->'exceptions') exception_value(code))
       or ((invoice_row.row_value->'sourceChanged'='true'::jsonb) is distinct from
        (invoice_row.row_value->'exceptions' ? 'source_changed_after_import'))
       or ((invoice_row.row_value->>'kind'='credit' and invoice_row.row_value->>'creditRelationCoverage'<>'linked') is distinct from
        (invoice_row.row_value->'exceptions' ? 'credit_relation_unresolved'))
       or ((invoice_row.row_value->>'unallocatedMinor'<>'0') is distinct from
        (invoice_row.row_value->'exceptions' ? 'unallocated_amount'))
       or ((invoice_row.row_value->>'status'='rejected') is distinct from
        (invoice_row.row_value->'exceptions' ? 'rejected_document'))
       or exists(select 1 from jsonb_array_elements_text(invoice_row.row_value->'exceptions') exception_value(code)
        where code not in('source_changed_after_import','credit_relation_unresolved','unallocated_amount','rejected_document'))
    ) or exists(
      select 1 from jsonb_array_elements(payload->'exceptions') exception_row(row_value)
      where jsonb_typeof(exception_row.row_value->'category')<>'string'
       or coalesce(exception_row.row_value->>'category','') not in('personnel','invoice')
       or jsonb_typeof(exception_row.row_value->'identity')<>'string'
       or length(exception_row.row_value->>'identity') not between 1 and 1024
       or jsonb_typeof(exception_row.row_value->'code')<>'string'
       or coalesce(exception_row.row_value->>'code','') not in('missing_rate','source_changed_after_import',
        'credit_relation_unresolved','unallocated_amount','rejected_document')
       or (exception_row.row_value->'amountMinor'<>'null'::jsonb and
        (jsonb_typeof(exception_row.row_value->'amountMinor')<>'number'
         or exception_row.row_value->>'amountMinor'!~'^-?(0|[1-9][0-9]{0,15})$'
         or (length(ltrim(exception_row.row_value->>'amountMinor','-'))=16 and
          ltrim(exception_row.row_value->>'amountMinor','-')>'9007199254740991')))
       or (exception_row.row_value->>'category'='personnel' and
        (exception_row.row_value->>'code'<>'missing_rate' or exception_row.row_value->'amountMinor'<>'null'::jsonb))
       or (exception_row.row_value->>'category'='invoice' and
        (exception_row.row_value->>'code'='missing_rate'
         or (exception_row.row_value->>'code'='unallocated_amount' and exception_row.row_value->'amountMinor'='null'::jsonb)
         or (exception_row.row_value->>'code'<>'unallocated_amount' and exception_row.row_value->'amountMinor'<>'null'::jsonb)))
    ) then
      raise exception 'step8_service_projector_payload_invalid' using errcode='22023';
    end if;
    if jsonb_array_length(payload->'personnel')<>(select count(distinct row(
       personnel_row->>'sourceTimeStreamKey',personnel_row->>'lineId')) from jsonb_array_elements(payload->'personnel') personnel_row)
     or exists(select 1 from jsonb_array_elements(payload->'personnel') personnel_sibling
       group by personnel_sibling->>'sourceTimeStreamKey'
       having count(distinct jsonb_build_array(personnel_sibling->'reportId',personnel_sibling->'revision',
        personnel_sibling->'timeSnapshotVersion',personnel_sibling->'workDate'))<>1)
     or jsonb_array_length(payload->'invoices')<>(select count(distinct row(
       lower(invoice_row->>'sourceOrganizationId'),lower(invoice_row->>'invoiceId'),lower(invoice_row->>'allocationId')))
       from jsonb_array_elements(payload->'invoices') invoice_row)
     or exists(select 1 from jsonb_array_elements(payload->'invoices') sibling
       group by lower(sibling->>'sourceOrganizationId'),lower(sibling->>'invoiceId')
       having count(distinct jsonb_build_array(sibling->'sourceOrganizationId',sibling->'invoiceId',
        sibling->'revision',sibling->'sourceProtocol',
        sibling->'sourceEconomicRevision',sibling->'sourceEconomicFingerprint',sibling->'sourceObservationId',
        sibling->'publicationFingerprint',sibling->'documentFingerprint',sibling->'kind',sibling->'currency',
        sibling->'status',sibling->'approvalState',sibling->'accountingState',sibling->'settlementState',sibling->'sourceChanged',
        sibling->'creditRelationCoverage',sibling->'creditRelationshipFingerprint',sibling->'unallocatedMinor'))<>1)
     or exists(select 1 from (select ord,work_date,stream_key,line_id,
        lag(work_date) over(order by ord) previous_work_date,lag(stream_key) over(order by ord) previous_stream_key,
        lag(line_id) over(order by ord) previous_line_id
       from jsonb_array_elements(payload->'personnel') with ordinality personnel_order(row_value,ord)
       cross join lateral (values(personnel_order.row_value->>'workDate',personnel_order.row_value->>'sourceTimeStreamKey',
        personnel_order.row_value->>'lineId')) key_values(work_date,stream_key,line_id)) ordered
       where row(ordered.previous_work_date,ordered.previous_stream_key,ordered.previous_line_id)>
        row(ordered.work_date,ordered.stream_key,ordered.line_id))
     or exists(select 1 from (select ord,invoice_id,allocation_id,
        lag(invoice_id) over(order by ord) previous_invoice_id,
        lag(allocation_id) over(order by ord) previous_allocation_id
       from jsonb_array_elements(payload->'invoices') with ordinality invoice_order(row_value,ord)
       cross join lateral (values(invoice_order.row_value->>'invoiceId',invoice_order.row_value->>'allocationId'))
        key_values(invoice_id,allocation_id)) ordered
       where row(ordered.previous_invoice_id,ordered.previous_allocation_id)>
        row(ordered.invoice_id,ordered.allocation_id))
     or exists(select 1 from (select ord,category,identity,
        lag(category) over(order by ord) previous_category,lag(identity) over(order by ord) previous_identity
       from jsonb_array_elements(payload->'exceptions') with ordinality exception_order(row_value,ord)
       cross join lateral (values(exception_order.row_value->>'category',exception_order.row_value->>'identity'))
        key_values(category,identity)) ordered
       where row(ordered.previous_category,ordered.previous_identity)>row(ordered.category,ordered.identity))
     or exists(select 1 from jsonb_array_elements(payload->'invoices') invoice_order
       where exists(select 1 from (select ord,rank,
          lag(rank) over(order by ord) previous_rank
         from jsonb_array_elements_text(invoice_order->'exceptions') with ordinality exception_code(code,ord)
         cross join lateral (values(case exception_code.code when 'source_changed_after_import' then 1
          when 'credit_relation_unresolved' then 2 when 'unallocated_amount' then 3
          when 'rejected_document' then 4 else 5 end)) ranks(rank)) ordered
         where ordered.previous_rank>ordered.rank))
     or exists(with expected(category,identity,code,amount_minor) as (
       select 'personnel',(personnel_row->>'sourceTimeStreamKey')||':'||(personnel_row->>'lineId'),
        'missing_rate','null'::jsonb from jsonb_array_elements(payload->'personnel') personnel_row
       where personnel_row->>'coverage'='missing_rate' and personnel_row->>'status'<>'rejected'
       union all
       select 'invoice',(invoice_row->>'invoiceId')||':'||(invoice_row->>'allocationId'),exception_code,
        case when exception_code='unallocated_amount' then invoice_row->'unallocatedMinor' else 'null'::jsonb end
       from jsonb_array_elements(payload->'invoices') invoice_row
       cross join lateral jsonb_array_elements_text(invoice_row->'exceptions') exception_value(exception_code)
      ),actual(category,identity,code,amount_minor) as (
       select exception_row->>'category',exception_row->>'identity',exception_row->>'code',exception_row->'amountMinor'
       from jsonb_array_elements(payload->'exceptions') exception_row
      ),expected_counts as (
       select category,identity,code,amount_minor,count(*) row_count from expected group by category,identity,code,amount_minor
      ),actual_counts as (
       select category,identity,code,amount_minor,count(*) row_count from actual group by category,identity,code,amount_minor
      ) select 1 from expected_counts expected_row full join actual_counts actual_row
       on actual_row.category=expected_row.category and actual_row.identity=expected_row.identity
       and actual_row.code=expected_row.code and actual_row.amount_minor is not distinct from expected_row.amount_minor
      where actual_row.row_count is distinct from expected_row.row_count)
    then
      raise exception 'step8_service_projector_payload_invalid' using errcode='22023';
    end if;
    outcome:='available';status:=200;
   exception when sqlstate '54000' or sqlstate '22023' or sqlstate '42501' then
    payload:=null;outcome:='unavailable';status:=409;
   end;
 end if;

 if payload is null then payload_raw:='null';payload_hash:=null;
 else payload_raw:=operations_step8_service_private.canonical_json_v1(payload);
  if octet_length(payload_raw)>262144 then raise exception 'step8_service_payload_size_limit' using errcode='54000';end if;
  payload_hash:=encode(sha256(convert_to(payload_raw,'UTF8')),'hex');
 end if;
 nonce_hash:=encode(sha256(convert_to(nonce,'UTF8')),'hex');
 response_body:=jsonb_build_object(
  'audience','eventflow-finance-project-economy-step8','destinationOrganizationId',dest_org,'destinationProjectId',dest_project,
  'expiresAt',expires,'issuedAt',issued,'issuer','eventflow-operations','nonce',nonce,'outcome',outcome,
  'payload',payload,'payloadSha256',payload_hash,'requestBodySha256',body_hash,'requestId',request_id,
  'requestNonceSha256',nonce_hash,'schemaVersion','eventflow.operations.project-economy-read-response.v1','shadowOnly',true,
  'sourceOrganizationId',source_org,'sourceProjectId',source_project,'sourceSetFingerprint',source_fp);
 if jsonb_typeof(response_body)<>'object' or (select count(*) from jsonb_object_keys(response_body))<>18
  or not (response_body ?& array['audience','destinationOrganizationId','destinationProjectId','expiresAt','issuedAt',
   'issuer','nonce','outcome','payload','payloadSha256','requestBodySha256','requestId','requestNonceSha256',
   'schemaVersion','shadowOnly','sourceOrganizationId','sourceProjectId','sourceSetFingerprint'])
  or response_body->>'schemaVersion'<>'eventflow.operations.project-economy-read-response.v1'
  or not operations_step8_service_private.json_depth_within_v1(response_body,1,9)
  or octet_length(response_body::text)>307200 then
   raise exception 'step8_service_response_contract_invalid' using errcode='22023';
 end if;
 response_raw:=operations_step8_service_private.canonical_json_v1(response_body);
 if octet_length(response_raw)>307200 then raise exception 'step8_service_response_size_limit' using errcode='54000';end if;
 response_hash:=encode(sha256(convert_to(response_raw,'UTF8')),'hex');
 response_headers:=jsonb_build_object('protocol',protocol,'issuer','eventflow-operations',
  'audience','eventflow-finance-project-economy-step8','responseKeyId',e.response_key_id,
  'responseKeyVersion',e.response_key_version,'requestId',request_id,'nonce',nonce,'issuedAt',issued,'expiresAt',expires,
  'bodySha256',response_hash,'requestBodySha256',body_hash,'requestNonceSha256',nonce_hash,'signature','');
 response_signature:=encode(public.hmac(convert_to(concat_ws(E'\n','hmac-sha256',protocol,'eventflow-operations',
  'eventflow-finance-project-economy-step8',e.response_key_id,e.response_key_version::text,request_id,nonce,
  issued::text,expires::text,response_hash,body_hash,nonce_hash),'UTF8'),response_secret,'sha256'),'hex');
 response_headers:=jsonb_set(response_headers,'{signature}',to_jsonb(response_signature));
 if not receipt_found then
  insert into operations_step8_service_private.receipts(request_issuer,request_key_id,nonce,request_audience,
   request_key_version,request_body_sha256,raw_request,destination_organization_id,destination_project_id,
   source_organization_id,source_project_id,source_set_fingerprint,source_count,response_status,raw_response,response_headers)
  values(issuer,kid,nonce,audience,key_version,body_hash,p_raw_body,dest_org,dest_project,source_org,source_project,
   source_fp,source_count,status,response_raw,response_headers);
 end if;
 return jsonb_build_object('status',status,'rawBody',response_raw,'responseHeaders',response_headers);
end;$$;

revoke all on function public.read_project_economy_step8_service_v1(text,jsonb) from public,authenticated,service_role;
grant execute on function public.read_project_economy_step8_service_v1(text,jsonb) to anon;
comment on function public.read_project_economy_step8_service_v1(text,jsonb) is
 'Read-only HMAC channel authentication. Finance server assertions actorSubjectHash/authCheckedAt are bound into the signed canonical body; no browser claim authorizes this RPC.';
