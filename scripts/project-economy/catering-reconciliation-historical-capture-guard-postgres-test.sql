-- Isolated owner-negative controls only. No publication, observation, Finance
-- receipt, permit or delivered queue is fabricated as a positive fixture.
-- Run after actual base14 + owned101049/112625/120804 in fresh disposable DB.
do $$begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true'
 then raise exception 'isolated fixture flag required' using errcode='42501';end if;
end;$$;

begin;
do $$declare denied boolean:=false;t text;begin
 -- Even the owner cannot materialize historical provenance without a real
 -- live permit. The BEFORE guard must reject before ordinary FK resolution.
 begin
 insert into operations_catering_reconciliation_private.historical_captures(
 permit_id,index,organization_id,source_stream_id,source_revision,source_outbox_id,allocation_event_id,
 provenance,source_queue_id,route_id,route_revision,key_id,endpoint_url,envelope,raw_body,body_sha256,descriptor,step_sha256)
 values('ffffffff-ffff-ffff-ffff-fffffffffff1',1,'ffffffff-ffff-ffff-ffff-fffffffffff2','hostile_unenrolled_stream',1,
 'ffffffff-ffff-ffff-ffff-fffffffffff3','ffffffff-ffff-ffff-ffff-fffffffffff4','server_derived',null,
 'ffffffff-ffff-ffff-ffff-fffffffffff5','hostile_revision','hostile_key','https://localhost/functions/v1/operations-catering-allocation-cost-receive',
 '{}'::jsonb,'{}',encode(sha256(convert_to('{}','UTF8')),'hex'),'{}'::jsonb,repeat('0',64));
 exception when sqlstate '42501' then denied:=true;
 end;
 if not denied or exists(select 1 from operations_catering_reconciliation_private.historical_captures where permit_id='ffffffff-ffff-ffff-ffff-fffffffffff1')
 then raise exception 'owner invented capture was not rejected';end if;
 denied:=false;
 begin
 insert into operations_catering_reconciliation_private.inventory_scope_holds(cursor_id,organization_id,source_stream_id,upper_revision,reconciliation_route_id,creation_txid,actor_system_user_id,selection)
 values('ffffffff-ffff-ffff-ffff-fffffffffff1','ffffffff-ffff-ffff-ffff-fffffffffff2','hostile_unenrolled_stream',2,
 'ffffffff-ffff-ffff-ffff-fffffffffff5',pg_current_xact_id(),'ffffffff-ffff-ffff-ffff-fffffffffff6','[]');
 exception when sqlstate '42501' then denied:=true;
 end;
 if not denied then raise exception 'owner fabricated historical scope hold accepted';end if;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.inventory_scope_holds','INSERT')
 or has_table_privilege('authenticated','operations_catering_reconciliation_private.inventory_scope_holds','SELECT')
 then raise exception 'historical scope hold authority exposed';end if;
 foreach t in array array['capture_insert_guard_v1','complete_capture_guard_v1','resolve_permit_v1','hold_inventory_selection_v1','inventory_selection_v1','inventory_scope_hold_guard_v1'] loop
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_catering_reconciliation_private' and p.proname=t and
 (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')))
 then raise exception 'private capture guard is exposed';end if;
 end loop;
 if (select count(*) from pg_trigger tr join pg_class c on c.oid=tr.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='operations_catering_reconciliation_private'
 and tr.tgname in ('reconciliation_permit_complete_captures','reconciliation_capture_complete_set') and tr.tgdeferrable and tr.tginitdeferred and tr.tgenabled='O')<>2
 then raise exception 'deferred complete capture guards missing';end if;
 if has_table_privilege('service_role','operations_catering_reconciliation_private.historical_captures','INSERT')
 or has_table_privilege('service_role','operations_catering_reconciliation_private.permits','INSERT')
 then raise exception 'service can invent captures/permits';end if;
end;$$;
select 'historical_capture_owner_denial_and_private_deferred_guards_pass' as proof;
rollback;
