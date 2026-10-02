\set ON_ERROR_STOP on
begin;
create temporary table operational_forecast_fixture(data jsonb not null);
insert into operational_forecast_fixture values(:'fixture'::jsonb);
create function pg_temp.forecast_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'Operational EAC assertion failed: %',label;end if;end;$$;
create function pg_temp.forecast_fail_source_link() returns trigger language plpgsql as $$
begin raise exception 'synthetic forecast source link failure' using errcode='22023';end;$$;
do $$
declare f jsonb;input jsonb;output jsonb;result jsonb;first_receipt jsonb;changed_input jsonb;changed_result jsonb;bad_input jsonb;bad_result jsonb;v_raw_input text;changed_raw_input text;
begin
 select data into strict f from operational_forecast_fixture;input:=f->'input';output:=f->'initial';v_raw_input:=f->>'rawInput';
 execute 'set local role service_role';
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{eac_minor}','0'),v_raw_input,0,'synthetic-forecast-wrong-eac');
  raise exception 'wrong EAC accepted';exception when sqlstate '22023' then if sqlerrm<>'forecast_project_totals_mismatch' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{budget_minor}','0'),v_raw_input,0,'synthetic-forecast-invented-budget');
  raise exception 'unknown Booking budget became zero';exception when sqlstate '22023' then if sqlerrm<>'forecast_budget_totals_mismatch' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{input_fingerprint}',to_jsonb(repeat('f',64))),v_raw_input,0,'synthetic-forecast-wrong-hash');
  raise exception 'unbound input hash accepted';exception when sqlstate '22023' then if sqlerrm<>'forecast_input_fingerprint_mismatch' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{issues}','[{}]'),v_raw_input,0,'synthetic-forecast-project-issue-type');
  raise exception 'project issue object accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_issue_type' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{calculated_obligations,0,result,issues}','[{}]'),v_raw_input,0,'synthetic-forecast-inner-issue-type');
  raise exception 'inner issue object accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_issue_type' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(input,jsonb_set(output,'{calculated_obligations,0,result,eac_minor}','1'),v_raw_input,0,'synthetic-forecast-inner-eac-lie');
  raise exception 'false per-obligation EAC accepted';exception when sqlstate '22023' then if sqlerrm<>'forecast_obligation_eac_mismatch' then raise;end if;end;
 begin perform public.publish_operations_project_forecast_v1(f->'missingInput',jsonb_set(f->'missing','{calculated_obligations,0,result,eac_minor}','1'),f->>'missingRawInput',2,'synthetic-forecast-unavailable-inner-eac');
  raise exception 'unavailable obligation has EAC';exception when sqlstate '22023' then if sqlerrm<>'unavailable_obligation_must_withhold_eac' then raise;end if;end;
 bad_input:=jsonb_set(input,'{category_coverage,0,unexpected}','true');
 bad_result:=jsonb_set(output,'{input_fingerprint}',to_jsonb(encode(sha256(convert_to(bad_input::text,'UTF8')),'hex')));
 begin perform public.publish_operations_project_forecast_v1(bad_input,bad_result,bad_input::text,0,'synthetic-forecast-category-extra-key');
  raise exception 'malformed category persisted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_category_coverage' then raise;end if;end;
 bad_input:=jsonb_set(input,'{obligations,0,source_evidence,0,unexpected}','true');
 bad_result:=jsonb_set(output,'{input_fingerprint}',to_jsonb(encode(sha256(convert_to(bad_input::text,'UTF8')),'hex')));
 begin perform public.publish_operations_project_forecast_v1(bad_input,bad_result,bad_input::text,0,'synthetic-forecast-source-extra-key');
  raise exception 'extra source evidence key accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_source_provenance' then raise;end if;end;
 bad_input:=jsonb_set(input,'{booking_budgets,0,source_revision}','"1"');
 bad_result:=jsonb_set(output,'{input_fingerprint}',to_jsonb(encode(sha256(convert_to(bad_input::text,'UTF8')),'hex')));
 begin perform public.publish_operations_project_forecast_v1(bad_input,bad_result,bad_input::text,0,'synthetic-forecast-unavailable-bad-version');
  raise exception 'unavailable budget malformed metadata persisted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_booking_metadata' then raise;end if;end;
 bad_input:=jsonb_set(input,'{booking_budgets,0,source_booking_id}',jsonb_build_array(input#>'{booking_budgets,0,source_booking_id}'));
 bad_result:=jsonb_set(output,'{input_fingerprint}',to_jsonb(encode(sha256(convert_to(bad_input::text,'UTF8')),'hex')));
 begin perform public.publish_operations_project_forecast_v1(bad_input,bad_result,bad_input::text,0,'synthetic-forecast-array-booking-id');
  raise exception 'coerced booking identity accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_forecast_booking_metadata' then raise;end if;end;
 -- Two identical empty-source obligations must not double the same remaining cost.
 bad_input:=jsonb_set(jsonb_set(input,'{obligations,0,input,sources}','[]'),'{obligations,0,source_evidence}','[]');
 bad_input:=jsonb_set(bad_input,'{obligations}',jsonb_build_array(bad_input#>'{obligations,0}',bad_input#>'{obligations,0}'));
 bad_result:=jsonb_set(output,'{input_fingerprint}',to_jsonb(encode(sha256(convert_to(bad_input::text,'UTF8')),'hex')));
 bad_result:=jsonb_set(bad_result,'{calculated_obligations,0,result}',(output#>'{calculated_obligations,0,result}')||
   jsonb_build_object('source_ids','[]'::jsonb,'confirmed_minor',0,'preliminary_minor',0,'known_cost_minor',0,'estimate_remaining_minor',5000,
    'commitment_remaining_minor',5000,'remaining_minor',5000,'eac_minor',5000));
 bad_result:=jsonb_set(bad_result,'{calculated_obligations}',jsonb_build_array(bad_result#>'{calculated_obligations,0}',bad_result#>'{calculated_obligations,0}'))||
   jsonb_build_object('confirmed_minor',0,'preliminary_minor',0,'known_cost_minor',0,'remaining_minor',10000,'eac_minor',10000);
 begin perform public.publish_operations_project_forecast_v1(bad_input,bad_result,bad_input::text,0,'synthetic-forecast-duplicate-empty-obligation');
  raise exception 'duplicate source-empty obligation accepted';exception when sqlstate '22023' then if sqlerrm<>'duplicate_or_invalid_forecast_obligation' then raise;end if;end;
 bad_input:=f->'staleInput';bad_result:=f->'stale';
 result:=public.publish_operations_project_forecast_v1(bad_input,bad_result,f->>'staleRawInput',4,'synthetic-forecast-first-stale');
 execute 'reset role';
 perform pg_temp.forecast_assert(result->>'status'='stale' and (select count(*)=0 from public.operations_project_forecast_streams),'stale first forecast does not create ghost stream');
 execute 'set local role service_role';first_receipt:=public.publish_operations_project_forecast_v1(input,output,v_raw_input,0,'synthetic-forecast-first');execute 'reset role';
 perform pg_temp.forecast_assert(first_receipt->>'status'='accepted' and first_receipt->'shadow_only'='true'::jsonb and first_receipt->>'integration_state'='isolated_contract','service-only isolated receipt');
 perform pg_temp.forecast_assert((select result_snapshot->>'known_cost_minor'='60000' and result_snapshot->>'eac_minor'='60000' and result_snapshot->'budget_minor'='null'::jsonb
  and integration_state='isolated_contract' from public.operations_project_forecast_current),'exact Operations amount and unknown Booking budget preserved');
 perform pg_temp.forecast_assert((select p.raw_input=v_raw_input and p.input_fingerprint=output->>'input_fingerprint' from public.operations_project_forecast_publications p),'exact exponent/fractional raw input fingerprint retained');
 perform pg_temp.forecast_assert((select count(*)=1 from public.operations_project_forecast_source_links) and (select count(*)=1 from public.operations_project_forecast_booking_captures),'immutable consumption and raw Booking capture linked');
 perform pg_temp.forecast_assert((select source_snapshot->>'replaces_estimate_minor'='5000' and source_snapshot->>'consumes_commitment_minor'='5000'
  from public.operations_project_forecast_source_links),'replacement and commitment consumption evidence frozen');
 changed_input:=f->'confirmedInput';changed_result:=f->'confirmed';changed_raw_input:=f->>'confirmedRawInput';
 execute 'create trigger synthetic_forecast_link_failure before insert on public.operations_project_forecast_source_links for each row execute function pg_temp.forecast_fail_source_link()';
 execute 'set local role service_role';
 begin perform public.publish_operations_project_forecast_v1(changed_input,changed_result,changed_raw_input,1,'synthetic-forecast-link-failure');
  raise exception 'failed source link accepted';exception when sqlstate '22023' then if sqlerrm<>'synthetic forecast source link failure' then raise;end if;end;
 execute 'reset role';execute 'drop trigger synthetic_forecast_link_failure on public.operations_project_forecast_source_links';
 perform pg_temp.forecast_assert((select current_revision=1 from public.operations_project_forecast_streams) and
  (select count(*)=1 from public.operations_project_forecast_publications) and (select count(*)=1 from public.operations_project_forecast_source_links) and
  (select count(*)=1 from public.operations_project_forecast_booking_captures),'failed evidence insert rolls back full forecast publication');
 execute 'set local role service_role';
 result:=public.publish_operations_project_forecast_v1(changed_input,changed_result,changed_raw_input,1,'synthetic-forecast-confirmed');execute 'reset role';
 perform pg_temp.forecast_assert(result->>'status'='accepted' and (select result_snapshot->>'confirmed_minor'='60000' and result_snapshot->>'preliminary_minor'='0'
  and result_snapshot->>'eac_minor'='60000' from public.operations_project_forecast_current),'attestation changes breakdown without growing EAC');
 execute 'set local role service_role';result:=public.publish_operations_project_forecast_v1(input,output,v_raw_input,0,'synthetic-forecast-first');execute 'reset role';
 perform pg_temp.forecast_assert(result->>'status'='duplicate' and result->>'body_sha256'=first_receipt->>'body_sha256','historical exact replay returns original immutable forecast');
 execute 'set local role service_role';
 begin perform public.publish_operations_project_forecast_v1(changed_input,changed_result,changed_raw_input,1,'synthetic-forecast-first');
  raise exception 'changed forecast retry accepted';exception when sqlstate '23505' then if sqlerrm<>'forecast_idempotency_conflict' then raise;end if;end;
 result:=public.publish_operations_project_forecast_v1(input,output,v_raw_input,0,'synthetic-forecast-stale-current');execute 'reset role';
 perform pg_temp.forecast_assert(result->>'status'='stale' and result->>'current_revision'='2','stale CAS cannot replace newer forecast');
 execute 'set local role service_role';result:=public.publish_operations_project_forecast_v1(f->'missingInput',f->'missing',f->>'missingRawInput',2,'synthetic-forecast-missing-baseline');execute 'reset role';
 perform pg_temp.forecast_assert(result->>'status'='accepted' and (select result_snapshot->>'confirmed_minor'='60000' and result_snapshot->'remaining_minor'='null'::jsonb
  and result_snapshot->'eac_minor'='null'::jsonb and result_snapshot->>'coverage'='unavailable' from public.operations_project_forecast_current),'unknown remaining costs remain unavailable');
 perform pg_temp.forecast_assert((select count(*)=3 from public.operations_project_forecast_publications) and (select count(*)=3 from public.operations_project_forecast_source_links)
  and (select count(*)=3 from public.operations_project_forecast_booking_captures),'one immutable source and capture set per revision');
 execute 'set local role authenticated';
 begin perform public.publish_operations_project_forecast_v1(input,output,v_raw_input,0,'synthetic-forged-client-forecast');raise exception 'client can publish forecast';exception when insufficient_privilege then null;end;
 begin perform (select raw_body from public.operations_project_forecast_current limit 1);raise exception 'raw isolated projection exposed';exception when insufficient_privilege then null;end;
 execute 'reset role';
 update public.projects set deleted_at=now() where id=(input->>'project_id')::uuid;
 execute 'set local role service_role';
 begin perform public.publish_operations_project_forecast_v1(input,output,v_raw_input,0,'synthetic-forecast-deleted-project');
  raise exception 'deleted project forecast accepted';exception when sqlstate '22023' then if sqlerrm<>'exact_forecast_project_scope_required' then raise;end if;end;
 execute 'reset role';
 begin update public.operations_project_forecast_streams set currency='EUR';raise exception 'forecast stream identity changed';exception when sqlstate '55000' then null;end;
 begin update public.operations_project_forecast_streams set current_revision=0;raise exception 'forecast head rewound';exception when sqlstate '55000' then null;end;
 begin truncate public.operations_project_forecast_streams,public.operations_project_forecast_publications,public.operations_project_forecast_source_links,public.operations_project_forecast_booking_captures;
  raise exception 'forecast stream ledger truncated';exception when sqlstate '55000' then null;end;
 begin update public.operations_project_forecast_publications set raw_body='{}';raise exception 'forecast publication mutable';exception when sqlstate '55000' then null;end;
 begin truncate public.operations_project_forecast_source_links;raise exception 'forecast source proof truncated';exception when sqlstate '55000' then null;end;
end;$$;
rollback;
\echo 'Operations isolated Operational EAC PostgreSQL checks passed'
