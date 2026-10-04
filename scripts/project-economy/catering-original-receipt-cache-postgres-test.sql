-- Isolated signed SQL-cache rehearsal. Genuine Finance-own original13 read is required input.
-- No Ops delivery ACK/source/receipt is invented; admission hard42501 remains closed.
begin;
do $$declare x jsonb;c jsonb;p jsonb;f jsonb;answer jsonb;v_count bigint;scope_hold uuid;forged_hold operations_catering_reconciliation_private.original_receipt_scope_holds%rowtype;raw_bad text;sig_bad text;nonce_bad text;forged operations_catering_reconciliation_private.verified_original_receipts%rowtype;
begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true' then raise exception 'isolated original receipt cache fixture required';end if;
 x:=current_setting('test.original_receipt_actual_control')::jsonb;c:=x->'cursor_proof'->'cursor';p:=x->'receipt_proof';
 insert into operations_catering_reconciliation_private.gates(organization_id,enabled) values((c->>'operations_organization_id')::uuid,true);
 insert into operations_catering_reconciliation_private.cursor_verification_keys(key_id,organization_id,finance_organization_id,route_id,route_revision,secret,enabled)
 values(x->>'cursor_key_id',(c->>'operations_organization_id')::uuid,(c->>'finance_organization_id')::uuid,gen_random_uuid(),'isolated-cursor-read-v1',x->>'cursor_secret',true);
 perform public.verify_operations_catering_finance_cursor_v1(p_key_id=>x->>'cursor_key_id',p_timestamp=>x->>'cursor_timestamp',p_nonce=>x->>'cursor_nonce',p_signature=>x->>'cursor_signature',p_raw_body=>x->>'cursor_raw');
 insert into operations_catering_reconciliation_private.original_receipt_read_gates(organization_id) values((c->>'operations_organization_id')::uuid);
 insert into operations_catering_reconciliation_private.original_receipt_verification_keys(key_id,organization_id,finance_organization_id,route_id,route_revision,secret)
 values(x->>'receipt_key_id',(c->>'operations_organization_id')::uuid,(c->>'finance_organization_id')::uuid,gen_random_uuid(),'isolated-original-receipt-read-v1',x->>'receipt_secret');
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw',x->>'receipt_signature');raise exception 'defaultoff receipt cache allowed';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.original_receipt_read_gates set enabled=true;
 update operations_catering_reconciliation_private.original_receipt_verification_keys set enabled=true;
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw','original-receipt-response-v1='||repeat('0',64));raise exception 'wrong signature allowed';exception when insufficient_privilege then null;end;
 if exists(select 1 from operations_catering_reconciliation_private.verified_original_receipts) then raise exception 'denied cache row survived';end if;
 answer:=public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw',x->>'receipt_signature');
 if answer->>'receipt_id' is distinct from p->'receipt'->>'receipt_id' then raise exception 'actual original receipt identity lost';end if;
 if not exists(select 1 from operations_catering_reconciliation_private.verified_original_receipts where cursor_id=(c->>'cursor_id')::uuid and receipt=p->'receipt' and response_raw_body=x->>'receipt_raw' and request_raw_body=x->>'request_raw') then raise exception 'actual signed cache bytes lost';end if;
 if public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw',x->>'receipt_signature') is distinct from answer then raise exception 'exact cache replay changed';end if;
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',(x->>'request_raw')||' ',x->>'receipt_raw',x->>'receipt_signature');raise exception 'request bytes rebound';exception when insufficient_privilege then null;end;
 -- PRIVATE integrity comparison: these values are actual Finance saved rows,
 -- not an Operations ordinary ACK and not allocation admission evidence.
 scope_hold:=operations_catering_reconciliation_private.lock_original_receipt_cursor_scopes_v1((c->>'cursor_id')::uuid);
 perform operations_catering_reconciliation_private.require_saved_original_receipt_v1((c->>'cursor_id')::uuid,p->'receipt',scope_hold);
 begin perform operations_catering_reconciliation_private.require_saved_original_receipt_v1((c->>'cursor_id')::uuid,jsonb_set(p->'receipt','{receipt_id}',to_jsonb(gen_random_uuid())),scope_hold);raise exception 'different original receipt UUID trusted';exception when insufficient_privilege then null;end;
 begin perform operations_catering_reconciliation_private.require_saved_original_receipt_v1((c->>'cursor_id')::uuid,p->'receipt',gen_random_uuid());raise exception 'caller invented permission hold accepted';exception when insufficient_privilege then null;end;
 select * into forged_hold from operations_catering_reconciliation_private.original_receipt_scope_holds where id=scope_hold;
 forged_hold.id:=gen_random_uuid();forged_hold.candidate_ids:=array_append(forged_hold.candidate_ids,gen_random_uuid());
 begin insert into operations_catering_reconciliation_private.original_receipt_scope_holds select (forged_hold).*;raise exception 'owner scope selection spoof accepted';exception when sqlstate 'PT409' then null;end;
 -- Single-session PHANTOM-set control (not native concurrency): a new synthetic
 -- peer key/cache packet may not change the server-held selection behind barriers.
 begin
 insert into operations_catering_reconciliation_private.original_receipt_verification_keys(key_id,organization_id,finance_organization_id,route_id,route_revision,secret,enabled)
 values('counterfactual_receipt_key02',(c->>'operations_organization_id')::uuid,(c->>'finance_organization_id')::uuid,gen_random_uuid(),'counterfactual-receipt-key02',x->>'receipt_secret',true);
 nonce_bad:='counterfactual_receipt_nonce02';raw_bad:=x->>'receipt_raw';
 sig_bad:='original-receipt-response-v1='||encode(operations_catering_reconciliation_private.hmac_sha256_v1(convert_to(x->>'receipt_secret','UTF8'),convert_to('RESPONSE'||chr(10)||'operations-catering-original-receipt-read'||chr(10)||'operations-catering-original-receipt-proof.v1'||chr(10)||'counterfactual_receipt_key02'||chr(10)||(x->>'receipt_timestamp')||chr(10)||nonce_bad||chr(10)||encode(sha256(convert_to(x->>'request_raw','UTF8')),'hex')||chr(10)||raw_bad,'UTF8')),'hex');
 perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,'counterfactual_receipt_key02',x->>'receipt_timestamp',nonce_bad,x->>'request_raw',raw_bad,sig_bad);
 begin perform operations_catering_reconciliation_private.require_saved_original_receipt_v1((c->>'cursor_id')::uuid,p->'receipt',scope_hold);raise exception 'late new-key receipt selection accepted';exception when sqlstate 'PT409' then null;end;
 begin perform operations_catering_reconciliation_private.lock_original_receipt_cursor_scopes_v1((c->>'cursor_id')::uuid);raise exception 'existing transaction hold silently refreshed';exception when sqlstate 'PT409' then null;end;
 raise exception 'counterfactual cache control rollback' using errcode='ZP001';
 exception when sqlstate 'ZP001' then null;end;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.original_receipt_scope_holds','INSERT') then raise exception 'private permission holds exposed';end if;
 -- Counterfactual signature oracle controls use synthetic owner-only fixture secrets.
 -- They prove schema rejection, never remote receipt acceptance.
 nonce_bad:='counterfactual_null_outcome01';
 raw_bad:=jsonb_set(p,'{receipt,outcome}','null'::jsonb)::text;
 sig_bad:='original-receipt-response-v1='||encode(operations_catering_reconciliation_private.hmac_sha256_v1(convert_to(x->>'receipt_secret','UTF8'),convert_to('RESPONSE'||chr(10)||'operations-catering-original-receipt-read'||chr(10)||'operations-catering-original-receipt-proof.v1'||chr(10)||(x->>'receipt_key_id')||chr(10)||(x->>'receipt_timestamp')||chr(10)||nonce_bad||chr(10)||encode(sha256(convert_to(x->>'request_raw','UTF8')),'hex')||chr(10)||raw_bad,'UTF8')),'hex');
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',nonce_bad,x->>'request_raw',raw_bad,sig_bad);raise exception 'signed null receipt outcome allowed';exception when insufficient_privilege then null;end;
 select * into forged from operations_catering_reconciliation_private.verified_original_receipts;
 forged.id:=gen_random_uuid();forged.organization_id:=gen_random_uuid();
 perform set_config('test.original_receipt_verified','true',true);
 begin insert into operations_catering_reconciliation_private.verified_original_receipts select (forged).*;raise exception 'owner metadata/GUC forgery accepted';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.original_receipt_read_gates set enabled=false;
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw',x->>'receipt_signature');raise exception 'revoked receipt gate replay accepted';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.original_receipt_read_gates set enabled=true;
 -- Actual signed cache does not yet open original receipt admission authority.
 begin perform operations_catering_reconciliation_private.require_verified_original_receipt_v1((c->>'cursor_id')::uuid,p->'receipt');raise exception 'hard admission gate opened early';exception when insufficient_privilege then null;end;
 update operations_catering_reconciliation_private.original_receipt_verification_keys set enabled=false;
 begin perform public.verify_operations_catering_original_receipt_v1((c->>'cursor_id')::uuid,x->>'receipt_key_id',x->>'receipt_timestamp',x->>'receipt_nonce',x->>'request_raw',x->>'receipt_raw',x->>'receipt_signature');raise exception 'revoked key replay accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from operations_catering_reconciliation_private.verified_original_receipts)<>1 then raise exception 'cache history changed';end if;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.original_receipt_verification_keys','SELECT')
 or has_table_privilege('service_role','operations_catering_reconciliation_private.verified_original_receipts','INSERT')
 or has_function_privilege('authenticated','public.verify_operations_catering_original_receipt_v1(uuid,text,text,text,text,text,text)','EXECUTE') then raise exception 'original receipt cache privilege leak';end if;
end;$$;
rollback;
