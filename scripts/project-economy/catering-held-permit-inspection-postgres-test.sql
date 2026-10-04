-- Denial/privilege proof only. No Operations delivered receipt is fabricated.
begin;
do $$declare role_name text;denied boolean:=false;command jsonb;id text:='00000000-0000-4000-8000-000000000001';begin
 if current_setting('test.project_economy_isolated',true) is distinct from 'true' then raise exception 'isolated test required';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(role_name,'operations_catering_reconciliation_private.inspect_held_permit_candidate_v1(text,uuid)','EXECUTE') then raise exception 'private inspection unexpectedly executable';end if;
 end loop;
 begin perform operations_catering_reconciliation_private.inspect_held_permit_candidate_v1('{}',gen_random_uuid());
 exception when sqlstate '22023' then denied:=true;end;
 if not denied then raise exception 'invalid command permitted';end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 command:=jsonb_build_object('schema_version','operations-catering-reconciliation-command.v1','source_stream_id','catering:'||id||':'||id,
 'expected_publication_revision',3,'expected_allocation_revision',2,'expected_event_id',id,'expected_observation_id',id,'expected_mapping_id',id,
 'finance_cursor_id',id,'finance_cursor_sha256',repeat('a',64),'preview_sha256',repeat('b',64),'idempotency_key','inspection-only-key','reason','private inspection denial');
 denied:=false;
 begin perform operations_catering_reconciliation_private.inspect_held_permit_candidate_v1(command::text,gen_random_uuid());
 exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'owner without real actor permitted';end if;
end;$$;
rollback;
begin isolation level repeatable read;
do $$declare denied boolean:=false;begin
 begin perform operations_catering_reconciliation_private.inspect_held_permit_candidate_v1('{}',gen_random_uuid());
 exception when sqlstate '22023' then denied:=true;end;
 if not denied then raise exception 'unsupported isolation permitted';end if;
end;$$;
rollback;
begin isolation level serializable;
do $$declare denied boolean:=false;begin
 begin perform operations_catering_reconciliation_private.inspect_held_permit_candidate_v1('{}',gen_random_uuid());
 exception when sqlstate '22023' then denied:=true;end;
 if not denied then raise exception 'unsupported isolation permitted';end if;
end;$$;
rollback;
