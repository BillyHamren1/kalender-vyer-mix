-- Finance -> Operations Step 8 read channel. No key material or enrollment is
-- seeded: every destination/source tuple is default-off until provisioned.
create schema if not exists operations_step8_service_private;
revoke all on schema operations_step8_service_private from public,anon,authenticated,service_role;

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
  or b->>'schemaVersion'<>'eventflow.finance.operations-project-economy-read-request.v1'
  or b->>'issuer'<>'eventflow-finance'
  or b->>'audience'<>'eventflow-operations-project-economy-step8'
  or b->>'operation'<>'read' or b->>'mappingBasis'<>'finance_local_current_component_map'
  or b->'shadowOnly'<>'true'::jsonb
  or jsonb_typeof(b->'authCheckedAt')<>'number' or jsonb_typeof(b->'issuedAt')<>'number'
  or jsonb_typeof(b->'expiresAt')<>'number' or jsonb_typeof(b->'sourceCount')<>'number' then
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
   'requestId','nonce','issuedAt','expiresAt','bodySha256','actorSubjectHash','authCheckedAt','signature']) then
   raise exception 'step8_service_headers_invalid' using errcode='22023';
 end if;
 method:=p_headers->>'method';route:=p_headers->>'route';protocol:=p_headers->>'protocol';issuer:=p_headers->>'issuer';
 audience:=p_headers->>'audience';kid:=p_headers->>'requestKeyId';body_hash:=p_headers->>'bodySha256';signature:=p_headers->>'signature';
 begin key_version:=(p_headers->>'requestKeyVersion')::integer;exception when others then
   raise exception 'step8_service_headers_invalid' using errcode='22023';end;
 if method<>'POST' or route<>'/functions/v1/project-economy-step8-service-read'
  or protocol<>'eventflow-project-economy-step8-read.v1' or issuer<>'eventflow-finance'
  or audience<>'eventflow-operations-project-economy-step8'
  or not (kid~'^[A-Za-z0-9_-]{4,64}$') or key_version<=0
  or p_headers->>'requestId'<>request_id or p_headers->>'nonce'<>nonce
  or p_headers->>'issuedAt'<>issued::text or p_headers->>'expiresAt'<>expires::text
  or p_headers->>'actorSubjectHash'<>actor_hash or p_headers->>'authCheckedAt'<>auth_checked::text
  or not (body_hash~'^[0-9a-f]{64}$') or body_hash<>encode(sha256(convert_to(p_raw_body,'UTF8')),'hex')
  or not (signature~'^hmac-sha256=[0-9a-f]{64}$')
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
 if substring(signature from 13)<>encode(public.hmac(convert_to(request_frame,'UTF8'),request_secret,'sha256'),'hex') then
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
    outcome:='available';status:=200;
   exception when sqlstate '54000' or sqlstate '22023' or sqlstate '42501' then
    payload:=null;outcome:='unavailable';status:=409;
   end;
 end if;

 if payload is null then payload_raw:='null';payload_hash:=null;
 else payload_raw:=operations_economy_private.canonical_json_v1(payload);
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
 response_raw:=operations_economy_private.canonical_json_v1(response_body);
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
