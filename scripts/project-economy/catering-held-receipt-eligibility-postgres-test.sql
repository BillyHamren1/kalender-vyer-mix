-- Negative private-authority controls only; no local delivered13 is fabricated.
do $$begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true' then raise exception 'isolated fixture required' using errcode='42501';end if;
end;$$;
begin;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$declare before_count bigint;denied boolean;name text;begin
 select count(*) into before_count from operations_catering_reconciliation_private.original_receipt_scope_holds;
 foreach name in array array['collect_admission_receipt_scopes_v1','delivery_eligibility_held_v1','historical_delivery_eligibility_held_v1'] loop
 denied:=false;
 begin
 if name='collect_admission_receipt_scopes_v1' then
 perform operations_catering_reconciliation_private.collect_admission_receipt_scopes_v1('ffffffff-ffff-ffff-ffff-fffffffffff1');
 elsif name='delivery_eligibility_held_v1' then
 perform operations_catering_reconciliation_private.delivery_eligibility_held_v1('ffffffff-ffff-ffff-ffff-fffffffffff1','ffffffff-ffff-ffff-ffff-fffffffffff2');
 else
 perform operations_catering_reconciliation_private.historical_delivery_eligibility_held_v1('ffffffff-ffff-ffff-ffff-fffffffffff1','ffffffff-ffff-ffff-ffff-fffffffffff2');
 end if;
 exception when sqlstate '42501' then denied:=true;
 end;
 if not denied then raise exception 'unauthenticated owner helper accepted';end if;
 end loop;
 if before_count<>(select count(*) from operations_catering_reconciliation_private.original_receipt_scope_holds) then raise exception 'denied admin request created permission hold';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_catering_reconciliation_private'
 and p.proname in ('collect_admission_receipt_scopes_v1','require_admission_receipt_scope_v1','delivery_eligibility_held_v1','historical_delivery_eligibility_held_v1')
 and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')))
 then raise exception 'held eligibility helper exposed';end if;
 begin perform operations_catering_reconciliation_private.require_verified_original_receipt_v1('ffffffff-ffff-ffff-ffff-fffffffffff1','{}');
 raise exception 'old receipt authority stub activated';exception when sqlstate '42501' then null;end;
end;$$;
select 'held_eligibility_unauthenticated_private_denials_pass' as proof;
rollback;
