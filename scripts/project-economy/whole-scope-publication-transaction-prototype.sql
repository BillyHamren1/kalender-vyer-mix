-- TEST ONLY. Load frozen whole-scope-projection-sql-prototype.sql in the SAME
-- trusted disposable psql session first. Never install this as a product RPC.
do $$begin
 if current_database() !~ '^eventflow_scope_publication_[a-z0-9_]+$'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_publication_native.gates') is null
 or to_regprocedure('pg_temp.prototype_scope(jsonb)') is null
 then raise exception 'trusted_native_publication_session_required' using errcode='22023';end if;
end;$$;
create function pg_temp.publish_scope_native(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 org uuid;actor uuid:=auth.uid();scope_id uuid;key text;expected bigint;head bigint:=0;
 prior operations_scope_publication_native.publications%rowtype;
 gate operations_scope_publication_native.gates%rowtype;
 captured jsonb;projection jsonb;request jsonb;member jsonb;document jsonb;receipt jsonb;project uuid;selection uuid;hint_selection uuid;locked_projects uuid[];captured_projects uuid[];
 new_publication_id uuid;revision bigint;evidence_fp text;publication_fp text;message text;
begin
 if current_database() !~ '^eventflow_scope_publication_[a-z0-9_]+$'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' then raise exception 'trusted_native_publication_session_required' using errcode='42501';end if;
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9
 or not(p ?& array['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_publication_revision','idempotency_key','reason'])
 or jsonb_typeof(p->'schema_version') is distinct from 'string' or p->>'schema_version' is distinct from 'operations-scope-publication-native.v1'
 then raise exception 'exact_native_publication_command_required' using errcode='22023';end if;
 if jsonb_typeof(p->'economic_scope_id') is distinct from 'string' or p->>'economic_scope_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'invalid_native_publication_identity' using errcode='22023';end if;
 foreach key in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric)
 or (p->>key)::numeric not between (case when key='expected_publication_revision' then 0 else 1 end) and (case when key='expected_publication_revision' then 9007199254740990 else 9007199254740991 end)
 then raise exception 'invalid_native_publication_revision' using errcode='22023';end if;end loop;
 foreach key in array array['expected_membership_fingerprint','expected_composition_fingerprint'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{64}$' then raise exception 'invalid_native_publication_fingerprint' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3
 then raise exception 'invalid_native_publication_audit' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_admin_v1();scope_id:=(p->>'economic_scope_id')::uuid;
 select * into gate from operations_scope_publication_native.gates where organization_id=org and economic_scope_id=scope_id and enabled for share;
 if not found then raise exception 'native_publication_gate_disabled' using errcode='42501';end if;
 -- Immutable expected composition is a discovery hint, never currentness.
 -- Baseline writers acquire live project SHARE before obligation-org. Match
 -- that order so a queued project UPDATE cannot form a three-session cycle.
 select c.snapshot_id into hint_selection from public.operations_scope_obligation_compositions c
 where c.organization_id=org and c.economic_scope_id=scope_id
 and c.composition_revision=(p->>'expected_composition_revision')::bigint and c.fingerprint=p->>'expected_composition_fingerprint';
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 if (select count(*) from public.operations_scope_obligation_baseline_captures where composition_snapshot_id=hint_selection)>1000
 then raise exception 'scope_invoice_member_limit' using errcode='22023';end if;
 select coalesce(array_agg(project_id order by project_id),array[]::uuid[]) into locked_projects from
 (select distinct b.project_id from public.operations_scope_obligation_baseline_captures c
 join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id
 where c.composition_snapshot_id=hint_selection and b.organization_id=org) q;
 foreach project in array locked_projects loop
 if operations_economy_private.authorize_obligation_admin_v1(project) is distinct from org
 then raise exception 'native_publication_member_denied' using errcode='42501';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 perform pg_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0));
 select * into prior from operations_scope_publication_native.publications where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then
 if prior.command<>p or prior.actor_id<>actor then raise exception 'native_publication_idempotency_conflict' using errcode='23505';end if;
 select r.document into strict receipt from operations_scope_publication_native.receipts r where r.publication_id=prior.publication_id;
 return receipt||jsonb_build_object('outcome','replayed','historical_only',true);
 end if;
 expected:=(p->>'expected_publication_revision')::bigint;
 select publication_revision into head from operations_scope_publication_native.heads where organization_id=org and economic_scope_id=scope_id;
 head:=coalesce(head,0);
 if head<>expected then raise exception 'native_publication_revision_changed' using errcode='PT409';end if;
 -- Test-only bounded observation point: all hinted project SHARE locks and
 -- both organization barriers are already held; no calculator/save has run.
 if gate.pause_after_barriers then perform pg_sleep(4);end if;
 -- Recheck the CURRENT head and exact project set under both barriers.
 -- Never acquire a newly discovered project permission lock at this stage.
 select c.snapshot_id into selection from public.operations_scope_obligation_composition_heads h
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where h.organization_id=org and h.economic_scope_id=scope_id and c.composition_revision=(p->>'expected_composition_revision')::bigint and c.fingerprint=p->>'expected_composition_fingerprint';
 if not found or selection is distinct from hint_selection then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 select coalesce(array_agg(project_id order by project_id),array[]::uuid[]) into captured_projects from
 (select distinct b.project_id from public.operations_scope_obligation_baseline_captures c
 join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id
 where c.composition_snapshot_id=selection and b.organization_id=org) q;
 if captured_projects is distinct from locked_projects then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id',org,'economic_scope_id',scope_id,
 'expected_scope_revision',p->'expected_scope_revision','expected_membership_fingerprint',p->'expected_membership_fingerprint',
 'expected_composition_revision',p->'expected_composition_revision','expected_composition_fingerprint',p->'expected_composition_fingerprint');
 begin captured:=operations_economy_private.read_scope_invoice_kernel_v1(request);
 exception when sqlstate '22023' then get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required')
 then raise exception 'native_publication_source_changed' using errcode='PT409';end if;raise;end;
 if captured->>'organization_id' is distinct from org::text or captured->>'economic_scope_id' is distinct from scope_id::text
 or captured->'scope_revision' is distinct from p->'expected_scope_revision' or captured->>'membership_fingerprint' is distinct from p->>'expected_membership_fingerprint'
 or captured->'composition_revision' is distinct from p->'expected_composition_revision' or captured->>'composition_fingerprint' is distinct from p->>'expected_composition_fingerprint'
 then raise exception 'native_publication_source_proof_mismatch' using errcode='22023';end if;
 select coalesce(array_agg(project_id order by project_id),array[]::uuid[]) into captured_projects from
 (select distinct (value->>'project_id')::uuid project_id from jsonb_array_elements(captured->'members')) q;
 if captured_projects is distinct from locked_projects then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 -- Reentrant checks only on already owned permission rows. No late discovery.
 foreach project in array locked_projects loop
 if operations_economy_private.authorize_obligation_admin_v1(project) is distinct from org
 then raise exception 'native_publication_member_denied' using errcode='42501';end if;end loop;
 -- Trusted reader result only. Calculator/adapter do NOT accept caller JSON.
 projection:=pg_temp.prototype_scope(captured);
 if projection->>'source_coverage' is distinct from 'unavailable' or projection->>'membership_currentness' is distinct from 'as_of_graph'
 or projection->>'source_currentness' is distinct from 'saved_receiver_heads_only' or projection->'credit_eligible' is distinct from 'false'::jsonb
 or projection->'eac_minor' is distinct from 'null'::jsonb or projection->'remaining_minor' is distinct from 'null'::jsonb
 or projection->'budget_minor' is distinct from 'null'::jsonb or projection->'margin_minor' is distinct from 'null'::jsonb
 or projection->'as_of' is distinct from captured->'as_of'
 then raise exception 'native_publication_unknown_coverage_changed' using errcode='22023';end if;
 -- All source barriers were acquired before ANY publication-head row lock.
 perform 1 from operations_scope_publication_native.heads where organization_id=org and economic_scope_id=scope_id for update;
 new_publication_id:=gen_random_uuid();revision:=expected+1;
 evidence_fp:=encode(sha256(convert_to('operations-scope-publication-native-evidence-v1'||E'\n'||operations_economy_private.canonical_json_v1(captured-'as_of'),'UTF8')),'hex');
 document:=jsonb_build_object('schema_version','operations-scope-publication-native-saved.v1','publication_id',new_publication_id,'organization_id',org,'economic_scope_id',scope_id,
 'publication_revision',revision,'actor_id',actor,'command',p,'calculation_version','operations-invoice-kernel-native-prototype.v1','capture',captured,'projection',projection,
 'evidence_fingerprint',evidence_fp,'observed_at',captured->'as_of','delivery_state','blocked_missing_authoritative_destination','shadow_only',true);
 if octet_length(document::text)>1048576 then raise exception 'native_publication_saved_size_limit' using errcode='54000';end if;
 publication_fp:=encode(sha256(convert_to('operations-scope-publication-native-publication-v1'||E'\n'||operations_economy_private.canonical_json_v1(document),'UTF8')),'hex');
 receipt:=jsonb_build_object('schema_version','operations-scope-publication-native-receipt.v1','outcome','accepted','publication_id',new_publication_id,'publication_revision',revision,
 'publication_fingerprint',publication_fp,'evidence_fingerprint',evidence_fp,'historical_only',false,'delivery_state','blocked_missing_authoritative_destination');
 insert into operations_scope_publication_native.publications values(new_publication_id,org,scope_id,revision,actor,p->>'idempotency_key',p,captured,projection,evidence_fp,publication_fp,document,(captured->>'as_of')::timestamptz);
 if gate.fault_after_publication then raise exception 'native_publication_injected_after_insert' using errcode='22023';end if;
 insert into operations_scope_publication_native.receipts values(new_publication_id,receipt);
 insert into operations_scope_publication_native.blocked_controls values(new_publication_id,'blocked_missing_authoritative_destination',null,null);
 if expected=0 then insert into operations_scope_publication_native.heads values(org,scope_id,revision,new_publication_id);
 else update operations_scope_publication_native.heads set publication_revision=revision,publication_id=new_publication_id where organization_id=org and economic_scope_id=scope_id;
 end if;
 return receipt;
end;$$;
revoke all on function pg_temp.publish_scope_native(jsonb) from public,anon,authenticated,service_role;
grant execute on function pg_temp.publish_scope_native(jsonb) to authenticated;
