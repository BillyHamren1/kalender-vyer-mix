-- Negative private controls only. No delivered receipt/permit outcome seed.
do $$begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true' then raise exception 'isolated fixture required' using errcode='42501';end if;
end;$$;
begin;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$declare before_count bigint;denied boolean;begin
 select count(*) into before_count from operations_catering_reconciliation_private.inventory_scope_holds;
 denied:=false;
 begin perform operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1('ffffffff-ffff-ffff-ffff-fffffffffff1','ffffffff-ffff-ffff-ffff-fffffffffff2');
 exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'unauthenticated current hold accepted';end if;
 denied:=false;
 begin perform operations_catering_reconciliation_private.inventory_held_v1('unavailable-native-stream','ffffffff-ffff-ffff-ffff-fffffffffff1',repeat('a',64),'ffffffff-ffff-ffff-ffff-fffffffffff2');
 exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'unauthenticated held inventory accepted';end if;
 if before_count<>(select count(*) from operations_catering_reconciliation_private.inventory_scope_holds) then raise exception 'denied request created inventory hold';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_catering_reconciliation_private' and p.proname in ('require_current_admission_receipt_scope_v1','inventory_held_v1') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))) then raise exception 'held inventory helper exposed';end if;
 begin perform operations_catering_reconciliation_private.require_verified_original_receipt_v1('ffffffff-ffff-ffff-ffff-fffffffffff1','{}');raise exception 'old authority stub activated';exception when sqlstate '42501' then null;end;
end;$$;
select 'held_historical_inventory_private_denials_pass' as proof;
rollback;
