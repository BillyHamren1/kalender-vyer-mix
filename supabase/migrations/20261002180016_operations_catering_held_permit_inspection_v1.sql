-- NEW owner-private RC-only candidate inspection, never a persisted/deliverable permit.
-- Existing collector must have run under a separately bounded caller in this TX.
-- Existing hard42501 resolver, INSERT guards, grants and public paths stay unchanged.
-- No new tables, signing, permit/capture/admission writers or domain mutations.
create function operations_catering_reconciliation_private.inspect_held_permit_candidate_v1(p_raw_command text,p_receipt_scope_hold_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare p_permit_id uuid;p_created_at timestamptz;deadline timestamptz:=clock_timestamp()+interval '12 seconds';command jsonb;inventory jsonb;preview jsonb;permit jsonb;outer_body jsonb;raw text;org uuid;actor uuid:=auth.uid();c operations_catering_reconciliation_private.verified_cursors%rowtype;
begin
 if current_setting('transaction_isolation') is distinct from 'read committed' then raise exception 'inspection requires read committed' using errcode='22023';end if;
 perform set_config('lock_timeout','3s',true);
 command:=operations_catering_reconciliation_private.validate_permit_command_v1(p_raw_command);
 org:=operations_economy_private.authorize_scope_admin_v1();
 perform operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1((command->>'finance_cursor_id')::uuid,p_receipt_scope_hold_id);
 inventory:=operations_catering_reconciliation_private.inventory_held_v1(command->>'source_stream_id',(command->>'finance_cursor_id')::uuid,command->>'finance_cursor_sha256',p_receipt_scope_hold_id);
 preview:=inventory->'preview';
 if preview->'organization_id' is distinct from to_jsonb(org) or inventory->'actor_system_user_id' is distinct from to_jsonb(actor)
 or command->'expected_publication_revision' is distinct from preview->'latest_publication_revision'
 or command->'expected_allocation_revision' is distinct from preview->'latest_allocation_revision'
 or command->'expected_event_id' is distinct from preview->'latest_event_id'
 or command->'expected_observation_id' is distinct from preview->'latest_observation_id'
 or command->'expected_mapping_id' is distinct from preview->'latest_mapping_id'
 or command->'preview_sha256' is distinct from inventory->'preview_sha256'
 then raise exception 'reconciliation command latest preview CAS failed' using errcode='PT409';end if;
 select * into c from operations_catering_reconciliation_private.verified_cursors where cursor_id=(command->>'finance_cursor_id')::uuid;
 if not found or c.organization_id<>org or clock_timestamp()>=c.expires_at then raise exception 'permit own cursor expired' using errcode='42501';end if;
 p_permit_id:=gen_random_uuid();p_created_at:=clock_timestamp();
 if p_permit_id is null or p_created_at is null or p_created_at<transaction_timestamp() or p_created_at>clock_timestamp()
 then raise exception 'server permit identity/time invalid' using errcode='42501';end if;
 permit:=jsonb_build_object('schema_version','operations-catering-reconciliation-permit.v1','permit_id',p_permit_id,'organization_id',org,'destination_organization_id',c.finance_organization_id,
 'source_stream_id',c.source_stream_id,'actor_system_user_id',actor,'idempotency_key',command->>'idempotency_key','reason',command->>'reason',
 'created_at',to_char(p_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expires_at',to_char((p_created_at+interval '300 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'cursor_sha256',c.cursor_sha256,'preview_sha256',inventory->>'preview_sha256','history_root_sha256',preview->>'history_root_sha256','step_count',preview->'step_count',
 'expected_publication_revision',preview->'latest_publication_revision','expected_allocation_revision',preview->'latest_allocation_revision','expected_event_id',preview->'latest_event_id',
 'expected_observation_id',preview->'latest_observation_id','expected_mapping_id',preview->'latest_mapping_id','route_id',inventory->'route_id','route_revision',inventory->'route_revision','key_id',inventory->'key_id');
 perform operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.permit.v1',permit);
 outer_body:=jsonb_build_object('schema_version','operations-catering-reconciliation-delivery.v1','cursor_proof',c.proof,'preview',preview,'permit',permit,'permit_sha256',operations_catering_reconciliation_private.hash_v1('eventflow.catering.reconciliation.permit.v1',permit),'history_root_sha256',preview->>'history_root_sha256','steps',inventory->'steps');
 raw:=outer_body::text;
 if clock_timestamp()>=deadline or octet_length(raw)>262144 or jsonb_array_length(inventory->'steps') not between 1 and 8 or clock_timestamp()>=c.expires_at
 then raise exception 'permit complete bounded body expired/oversize' using errcode='42501';end if;
 return inventory||jsonb_build_object('command',command,'cursor_id',c.cursor_id,'permit',permit,'raw_body',raw,'body_sha256',encode(sha256(convert_to(raw,'UTF8')),'hex'));
end;$$;
revoke all on function operations_catering_reconciliation_private.inspect_held_permit_candidate_v1(text,uuid) from public,anon,authenticated,service_role;
