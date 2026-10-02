-- Private signed cursor cache/parity and authenticated admission denial controls only.
-- No positive admission, native HTTP, source-provider or human authority proof.
-- Runner must supply exact proof emitted by actual committed isolated Finance read RPC;
-- no accepted snapshots/receipts/cursors are inserted as seed data.
begin;
do $$declare p jsonb:=current_setting('test.finance_actual_cursor_proof')::jsonb;begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true' then raise exception 'isolated flag required' using errcode='42501';end if;
 insert into operations_catering_reconciliation_private.gates values((p->'cursor'->>'operations_organization_id')::uuid,false);
 insert into operations_catering_reconciliation_private.cursor_verification_keys values('isolated-cursor-key',
 (p->'cursor'->>'operations_organization_id')::uuid,(p->'cursor'->>'finance_organization_id')::uuid,
 '96000000-0000-4000-8000-000000000050','isolated-cursor-route',current_setting('test.synthetic_cursor_hmac_key'),true);
end;$$;
-- Flat commitment parity controls only: runner resolves real disposable
-- Finance RPC batch objects, then compares Finance SQL/Operations SQL/Node UTF8.
-- These vectors are not an administrator permit or a remote acceptance proof.
do $$declare v jsonb;c jsonb:=current_setting('test.reconciliation_hash_controls')::jsonb;bad jsonb;begin
 if jsonb_typeof(c) is distinct from 'array' or jsonb_array_length(c)<>9 then raise exception 'all eight domains plus Unicode control required';end if;
 for v in select value from jsonb_array_elements(c) loop
 if operations_catering_reconciliation_private.hash_v1(v->>'domain',v->'input') is distinct from v->>'expected_sha256' then raise exception 'cross-engine hash control mismatch';end if;
 end loop;
 bad:=jsonb_set(c->0->'input','{publication_revision}','9007199254740992');
 begin perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.cursor.v1',bad);
 raise exception 'unsafe new-domain integer accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(c->0->'input','{publication_revision}','1.5');
 begin perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.cursor.v1',bad);
 raise exception 'fractional new-domain integer accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(c->0->'input','{source_stream_id}','[]');
 begin perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.cursor.v1',bad);
 raise exception 'nested new-domain scalar accepted';exception when invalid_parameter_value then null;end;
 bad:=(c->0->'input')||'{"unknown":null}';
 begin perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.cursor.v1',bad);
 raise exception 'unknown new-domain key accepted';exception when invalid_parameter_value then null;end;
end;$$;
-- Synthetic key oracle for adversarial byte controls only, never public application authority.
create function pg_temp.sign_cursor_control(raw text,stamp text,nonce text) returns text language sql security definer set search_path='' as $$
 select 'cursor-v1='||encode(operations_catering_reconciliation_private.hmac_sha256_v1(convert_to(current_setting('test.synthetic_cursor_hmac_key'),'UTF8'),
 convert_to(array_to_string(array['RESPONSE','operations-catering-backlog-cursor-read','operations-catering-reconciliation-cursor-proof.v1','isolated-cursor-key',stamp,nonce,raw],E'\n'),'UTF8')),'hex');
$$;
grant execute on function pg_temp.sign_cursor_control(text,text,text) to service_role;
set local role service_role;
do $$declare raw text:=current_setting('test.finance_actual_cursor_proof');signature text:=current_setting('test.finance_actual_cursor_response_signature');
 stamp text:=current_setting('test.finance_cursor_response_timestamp');nonce text:='cursor_adopted_v2_read01';r jsonb;changed jsonb;bad_raw text;control integer;begin
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,signature,raw);
 raise exception 'default-off cursor cache accepted';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.gates set enabled=true;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,'cursor-v1='||repeat('0',64),raw);
 raise exception 'invented signature accepted';exception when insufficient_privilege then null;end;
 if exists(select 1 from operations_catering_reconciliation_private.verified_cursors) then raise exception 'denied signature saved proof';end if;
 changed:=raw::jsonb;changed:=jsonb_set(changed,'{cursor,operations_organization_id}','"96000000-0000-4000-8000-000000000099"');
 bad_raw:=changed::text;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,pg_temp.sign_cursor_control(bad_raw,stamp,nonce),bad_raw);
 raise exception 'foreign organization accepted';exception when invalid_parameter_value then null;end;
 bad_raw:=replace(raw,'"allocation_revision":1','"allocation_revision":-0');
 -- Input may be compact or spaced; enforce an actual mutation before this negative.
 if bad_raw=raw then bad_raw:=replace(raw,'"allocation_revision": 1','"allocation_revision": -0');end if;
 if bad_raw=raw then raise exception 'negative-zero control did not mutate source';end if;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,pg_temp.sign_cursor_control(bad_raw,stamp,nonce),bad_raw);
 raise exception 'noncanonical cursor number accepted';exception when invalid_parameter_value then null;end;
 -- Direct SQL boundary controls: each body is signed correctly by the isolated
 -- oracle, so failure must come from structural/calendar/lifetime validation.
 bad_raw:=regexp_replace(raw,'^\s*\{','{"issued_at":"2000-01-01T00:00:00.000000Z",');
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,pg_temp.sign_cursor_control(bad_raw,stamp,nonce),bad_raw);
 raise exception 'duplicate cursor proof key accepted';exception when invalid_parameter_value then null;end;
 changed:=jsonb_set(raw::jsonb,'{issued_at}','"2026-02-30T00:00:00.000000Z"');bad_raw:=changed::text;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,pg_temp.sign_cursor_control(bad_raw,stamp,nonce),bad_raw);
 raise exception 'invalid calendar cursor accepted';exception when invalid_parameter_value then null;end;
 for control in 1..3 loop
 changed:=raw::jsonb;
 if control=1 then
 changed:=jsonb_set(changed,'{expires_at}',to_jsonb(to_char(((changed->>'issued_at')::timestamptz+interval '61 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 elsif control=2 then
 changed:=jsonb_set(changed,'{issued_at}',to_jsonb(to_char((clock_timestamp()+interval '1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 changed:=jsonb_set(changed,'{expires_at}',to_jsonb(to_char(((changed->>'issued_at')::timestamptz+interval '60 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 else
 changed:=jsonb_set(changed,'{issued_at}',to_jsonb(to_char((clock_timestamp()-interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 changed:=jsonb_set(changed,'{expires_at}',to_jsonb(to_char(((changed->>'issued_at')::timestamptz+interval '60 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 end if;
 bad_raw:=changed::text;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,pg_temp.sign_cursor_control(bad_raw,stamp,nonce),bad_raw);
 raise exception 'invalid cursor lifetime accepted';exception when insufficient_privilege then null;end;
 end loop;
 if exists(select 1 from operations_catering_reconciliation_private.verified_cursors) then raise exception 'invalid cursor controls persisted';end if;
 r:=public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,signature,raw);
 if r->>'outcome' is distinct from 'verified' or r->'cursor_id' is distinct from raw::jsonb->'cursor'->'cursor_id'
 or not exists(select 1 from operations_catering_reconciliation_private.verified_cursors v
 where v.cursor_id=(r->>'cursor_id')::uuid and v.raw_body=raw and v.body_sha256=encode(sha256(convert_to(raw,'UTF8')),'hex'))
 then raise exception 'actual response bytes not persisted';end if;
 r:=public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,nonce,signature,raw);
 if r->>'outcome' is distinct from 'replayed' or (select count(*) from operations_catering_reconciliation_private.verified_cursors)<>1
 then raise exception 'saved response replay duplicated';end if;
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',stamp,'different_request_nonce1',signature,raw);
 raise exception 'signature nonce rebinding accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from operations_catering_reconciliation_private.cursor_verification_keys;
 raise exception 'dedicated secret readable by service';exception when insufficient_privilege then null;end;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.cursor_verification_keys','SELECT')
 or has_table_privilege('service_role','operations_catering_reconciliation_private.cursor_verification_keys','INSERT')
 or has_table_privilege('service_role','operations_catering_reconciliation_private.verified_cursors','INSERT')
 or has_function_privilege('service_role','operations_catering_reconciliation_private.hmac_sha256_v1(bytea,bytea)','EXECUTE')
 then raise exception 'private proof/secret authority privileges broadened';end if;
end;$$;
reset role;
-- Revocation must deny even previously cached exact-body replay. This is
-- current permission, separate from the immutable historical cached proof.
update operations_catering_reconciliation_private.cursor_verification_keys set enabled=false;
set local role service_role;
do $$begin
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',current_setting('test.finance_cursor_response_timestamp'),'cursor_adopted_v2_read01',current_setting('test.finance_actual_cursor_response_signature'),current_setting('test.finance_actual_cursor_proof'));
 raise exception 'revoked key cached replay accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
update operations_catering_reconciliation_private.cursor_verification_keys set enabled=true;
set local role service_role;
update operations_catering_reconciliation_private.gates set enabled=false;
do $$begin
 begin perform public.verify_operations_catering_finance_cursor_v1('isolated-cursor-key',current_setting('test.finance_cursor_response_timestamp'),'cursor_adopted_v2_read01',current_setting('test.finance_actual_cursor_response_signature'),current_setting('test.finance_actual_cursor_proof'));
 raise exception 'revoked gate cached replay accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from operations_catering_reconciliation_private.verified_cursors)<>1 then raise exception 'revocation changed saved history';end if;
end;$$;
update operations_catering_reconciliation_private.gates set enabled=true;
reset role;
do $$declare candidate operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 select * into strict candidate from operations_catering_reconciliation_private.verified_cursors;
 -- Actual remote signed proof alone is insufficient: this isolated cache
 -- fixture intentionally has no local source publication/delivered queue.
 begin perform operations_catering_reconciliation_private.delivery_eligibility_v1(candidate.cursor_id);
 raise exception 'remote proof alone authorized local delivery eligibility';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','operations_catering_reconciliation_private.delivery_eligibility_v1(uuid)','EXECUTE')
 or has_function_privilege('service_role','operations_catering_reconciliation_private.delivery_eligibility_v1(uuid)','EXECUTE')
 then raise exception 'private admission prerequisite exposed';end if;
 candidate.cursor_id:='96000000-0000-4000-8000-000000000055';
 perform set_config('test.caller_verified','true',true);
 begin insert into operations_catering_reconciliation_private.verified_cursors select (candidate).*;
 raise exception 'ordinary owner metadata drift bypassed signed cursor guard';exception when invalid_parameter_value then null;end;
 candidate.response_signature:='cursor-v1='||repeat('0',64);
 begin insert into operations_catering_reconciliation_private.verified_cursors select (candidate).*;
 raise exception 'ordinary owner unsigned cursor bypassed guard';exception when insufficient_privilege then null;end;
 if (select count(*) from operations_catering_reconciliation_private.verified_cursors)<>1 then raise exception 'owner denial appended cursor';end if;
end;$$;
do $$begin
 if encode(operations_catering_reconciliation_private.hmac_sha256_v1(decode(repeat('0b',20),'hex'),convert_to('Hi There','UTF8')),'hex')
 is distinct from 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
 then raise exception 'standard HMAC vector mismatch';end if;
 if encode(operations_catering_reconciliation_private.hmac_sha256_v1(decode(repeat('aa',131),'hex'),convert_to('Test Using Larger Than Block-Size Key - Hash Key First','UTF8')),'hex')
 is distinct from '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'
 then raise exception 'long-key HMAC vector mismatch';end if;
end;$$;
-- Authenticated admission boundary negatives. These identities are isolated SQL
-- role fixtures, not real authenticated human/HTTP evidence. No local delivered
-- queue, receipt, source observation, publication or admission is fabricated.
do $$declare org uuid:=(current_setting('test.finance_actual_cursor_proof')::jsonb->'cursor'->>'operations_organization_id')::uuid;begin
 insert into auth.users values('96000000-0000-4000-8000-000000000090'),('96000000-0000-4000-8000-000000000091'),('96000000-0000-4000-8000-000000000092');
 insert into public.profiles(user_id,organization_id) values('96000000-0000-4000-8000-000000000090',org),('96000000-0000-4000-8000-000000000091',org),('96000000-0000-4000-8000-000000000092','96000000-0000-4000-8000-000000000099');
 insert into public.user_roles(user_id,organization_id,role) values('96000000-0000-4000-8000-000000000090',org,'admin'),('96000000-0000-4000-8000-000000000091',org,'projekt'),('96000000-0000-4000-8000-000000000092','96000000-0000-4000-8000-000000000099','admin');
 insert into operations_catering_reconciliation_private.admission_policies values(org,false);
end;$$;
set local role authenticated;
do $$declare proof jsonb:=current_setting('test.finance_actual_cursor_proof')::jsonb;begin
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.reassign_operations_catering_project_admitted_v1('{}', (proof->'cursor'->>'cursor_id')::uuid,proof->>'cursor_sha256');
 raise exception 'null authenticated actor admitted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000091',true);
 begin perform public.reassign_operations_catering_project_admitted_v1('{}', (proof->'cursor'->>'cursor_id')::uuid,proof->>'cursor_sha256');
 raise exception 'project role admitted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000090',true);
 begin perform public.reassign_operations_catering_project_admitted_v1('{}', (proof->'cursor'->>'cursor_id')::uuid,proof->>'cursor_sha256');
 raise exception 'default-off policy admitted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local role service_role;
do $$declare org uuid:=(current_setting('test.finance_actual_cursor_proof')::jsonb->'cursor'->>'operations_organization_id')::uuid;begin
 begin insert into operations_catering_allocation_private.delivery_gates values(org,true);
 raise exception 'v2 transport enabled with enrolled disabled admission policy';exception when insufficient_privilege then null;end;
 begin insert into operations_catering_private.finance_delivery_gates values(org,true);
 raise exception 'v1 transport enabled with enrolled disabled admission policy';exception when insufficient_privilege then null;end;
end;$$;
reset role;
update operations_catering_reconciliation_private.admission_policies set enabled=true;
set local role authenticated;
do $$declare proof jsonb:=current_setting('test.finance_actual_cursor_proof')::jsonb;begin
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000090',true);
 begin perform public.reassign_operations_catering_project_admitted_v1('{}', (proof->'cursor'->>'cursor_id')::uuid,proof->>'cursor_sha256');
 raise exception 'malformed original command admitted';exception when invalid_parameter_value then null;end;
 begin insert into operations_catering_reconciliation_private.admissions(id) values(gen_random_uuid());
 raise exception 'client directly created admission';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','operations_catering_reconciliation_private.admissions','INSERT') or has_table_privilege('service_role','operations_catering_reconciliation_private.admissions','INSERT')
 or has_function_privilege('service_role','public.reassign_operations_catering_project_admitted_v1(jsonb,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','operations_catering_reconciliation_private.resolve_admission_v1(jsonb,uuid,text)','EXECUTE') then raise exception 'admission private privilege bypass';end if;
end;$$;
reset role;
delete from public.user_roles where user_id='96000000-0000-4000-8000-000000000090';
set local role authenticated;
do $$declare proof jsonb:=current_setting('test.finance_actual_cursor_proof')::jsonb;begin
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000090',true);
 begin perform public.reassign_operations_catering_project_admitted_v1('{}', (proof->'cursor'->>'cursor_id')::uuid,proof->>'cursor_sha256');
 raise exception 'revoked live admin admitted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
do $$begin
 begin update operations_catering_reconciliation_private.admission_policies set enabled=false;
 raise exception 'active policy disabled to bypass backlog';exception when object_not_in_prerequisite_state then null;end;
 if exists(select 1 from operations_catering_reconciliation_private.admissions) then raise exception 'denied admission changed history';end if;
end;$$;
-- Ordinary schema-owner direct DML negatives under active guards, without
-- administrator impersonation or manufactured verified proof-cache/source rows.
do $$declare c operations_catering_reconciliation_private.verified_cursors%rowtype;begin
 select * into strict c from operations_catering_reconciliation_private.verified_cursors;
 perform set_config('request.jwt.claim.sub','',true);
 begin insert into operations_catering_reconciliation_private.admissions(id,organization_id) values(gen_random_uuid(),c.organization_id);
 raise exception 'owner malformed admission bypassed authority';exception when invalid_parameter_value then null;end;
 begin insert into operations_catering_allocation_private.events values(
 '96000000-0000-4000-8000-000000000093',c.organization_id,c.source_stream_id,2,'96000000-0000-4000-8000-000000000090',c.publication_revision,c.publication_revision+1,
 '96000000-0000-4000-8000-000000000094','96000000-0000-4000-8000-000000000095','96000000-0000-4000-8000-000000000096',
 '96000000-0000-4000-8000-000000000097','96000000-0000-4000-8000-000000000098',1,'owner-missing-admission','{}','{}',repeat('0',64),clock_timestamp());
 raise exception 'owner fresh event bypassed missing admission';exception when insufficient_privilege then null;end;
 begin insert into operations_catering_allocation_private.heads values(c.organization_id,c.source_stream_id,2,'96000000-0000-4000-8000-000000000093','96000000-0000-4000-8000-000000000096');
 raise exception 'owner fresh head bypassed missing admission';exception when insufficient_privilege then null;end;
 if exists(select 1 from operations_catering_reconciliation_private.admissions) or exists(select 1 from operations_catering_allocation_private.events where organization_id=c.organization_id) or exists(select 1 from operations_catering_allocation_private.heads where organization_id=c.organization_id) then raise exception 'denied direct DML appended economic authority';end if;
end;$$;
-- Enrollment must first drain legacy allocation and transport gates. These
-- rows are configuration-only controls; no source/cost/receipt seed is added.
do $$declare org uuid:='96000000-0000-4000-8000-000000000080';begin
 insert into operations_catering_allocation_private.gates values(org,true);
 begin insert into operations_catering_reconciliation_private.admission_policies values(org,false);
 raise exception 'policy enrolled over active original allocation';exception when insufficient_privilege then null;end;
 begin insert into operations_catering_reconciliation_private.admission_policies values(org,true);
 raise exception 'policy activated over undrained original allocation';exception when insufficient_privilege then null;end;
 update operations_catering_allocation_private.gates set enabled=false where organization_id=org;
 insert into operations_catering_reconciliation_private.admission_policies values(org,false);
 begin update operations_catering_allocation_private.gates set enabled=true where organization_id=org;
 raise exception 'original allocation enabled with enrolled disabled policy';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.admission_policies set enabled=true where organization_id=org;
 update operations_catering_allocation_private.gates set enabled=true where organization_id=org;
 if not exists(select 1 from operations_catering_reconciliation_private.policy_configuration_barriers where organization_id=org and revision>=4) then raise exception 'gate/policy writes omitted shared real barrier';end if;
 begin update operations_catering_reconciliation_private.policy_configuration_barriers set revision=0 where organization_id=org;
 raise exception 'owner configuration barrier reset accepted';exception when object_not_in_prerequisite_state then null;end;
 begin delete from operations_catering_reconciliation_private.policy_configuration_barriers where organization_id=org;
 raise exception 'owner configuration barrier deletion accepted';exception when object_not_in_prerequisite_state then null;end;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.policy_configuration_barriers','INSERT')
 or has_table_privilege('authenticated','operations_catering_reconciliation_private.policy_configuration_barriers','UPDATE') then raise exception 'private config serialization row exposed';end if;
end;$$;
-- Twelve-field permit grammar controls only; syntactic acceptance does not
-- create a permit/capture or confer source/receipt/admin authority.
do $$declare proof jsonb:=current_setting('test.finance_actual_cursor_proof')::jsonb;
 permit jsonb:=current_setting('test.reconciliation_hash_controls')::jsonb->7->'input';p jsonb;bad jsonb;raw text;begin
 p:=jsonb_build_object('schema_version','operations-catering-reconciliation-command.v1','source_stream_id',permit->>'source_stream_id',
 'expected_publication_revision',permit->'expected_publication_revision','expected_allocation_revision',permit->'expected_allocation_revision',
 'expected_event_id',permit->'expected_event_id','expected_observation_id',permit->'expected_observation_id','expected_mapping_id',permit->'expected_mapping_id',
 'finance_cursor_id',proof->'cursor'->'cursor_id','finance_cursor_sha256',proof->'cursor_sha256','preview_sha256',permit->'preview_sha256',
 'idempotency_key','parser-contract-control','reason','Flytta kostnad 😀');
 if operations_catering_reconciliation_private.validate_permit_command_v1(p::text) is distinct from p then raise exception 'exact twelve command grammar changed';end if;
 bad:=jsonb_set(p,'{expected_allocation_revision}','0');
 begin perform operations_catering_reconciliation_private.validate_permit_command_v1(bad::text);raise exception 'unallocated backlog command accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(p,'{finance_cursor_id}',jsonb_build_array(p->'finance_cursor_id'));
 begin perform operations_catering_reconciliation_private.validate_permit_command_v1(bad::text);raise exception 'array UUID command accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(p,'{reason}',to_jsonb(U&'\00A0'||(p->>'reason')));
 begin perform operations_catering_reconciliation_private.validate_permit_command_v1(bad::text);raise exception 'Unicode trim command accepted';exception when invalid_parameter_value then null;end;
 bad:=p||'{"actor_system_user_id":"96000000-0000-4000-8000-000000000090"}';
 begin perform operations_catering_reconciliation_private.validate_permit_command_v1(bad::text);raise exception 'caller actor command accepted';exception when invalid_parameter_value then null;end;
 raw:='{"reason":"changed",'||substr(p::text,2);
 begin perform operations_catering_reconciliation_private.validate_permit_command_v1(raw);raise exception 'duplicate command accepted';exception when invalid_parameter_value then null;end;
 if has_function_privilege('authenticated','operations_catering_reconciliation_private.validate_permit_command_v1(text)','EXECUTE') then raise exception 'private grammar exposed';end if;
end;$$;
-- No cursor-only evidence can grant receipt authority before the independent lookup/cache.
do $$begin
 begin
 perform operations_catering_reconciliation_private.require_verified_original_receipt_v1(gen_random_uuid(),'{}'::jsonb);
 raise exception 'cursor-only original receipt eligibility escaped';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('service_role','operations_catering_reconciliation_private.require_verified_original_receipt_v1(uuid,jsonb)','EXECUTE')
 then raise exception 'private receipt hard gate exposed';end if;
end;$$;
rollback;
