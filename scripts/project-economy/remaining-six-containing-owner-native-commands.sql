\set ON_ERROR_STOP on
-- NEW disposable hired containing-owner policy/compose commands. No product SQL.
begin;
do $$begin
 if current_database()<>'operations_hired_authority_runtime'
 or current_setting('test.remaining_six_owner_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or (select count(*) from public.operations_hired_native_fixture)<>1
 or exists(select 1 from public.operations_obligation_source_policy_heads)
 or exists(select 1 from public.operations_project_scope_heads)
 then raise exception 'remaining_six_owner_commands_fixture_required' using errcode='42501';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true)\g /dev/null
do $$declare baseline public.operations_project_obligation_baselines%rowtype;binding public.operations_project_obligation_invoice_bindings%rowtype;
 p jsonb;r jsonb;preview jsonb;saved jsonb;scope uuid:='00000000-0000-4000-8000-000000006001';begin
 select * into strict baseline from public.operations_project_obligation_baselines
 where organization_id='11111111-1111-4111-8111-111111111111' and project_id='55555555-5555-4555-8555-555555555555'
 and obligation_id='abababab-abab-4aba-8aba-abababababab' and revision=1;
 select * into strict binding from public.operations_project_obligation_invoice_bindings where baseline_event_id=baseline.event_id;
 p:=jsonb_build_object('schema_version','operations-obligation-source-policy.v1','project_id',baseline.project_id,'obligation_id',baseline.obligation_id,
 'baseline_event_id',baseline.event_id,'binding_event_id',binding.event_id,'expected_policy_revision',0,
 'replaces_estimate_minor',case when baseline.estimate_minor is null then null else 0 end,
 'consumes_commitment_minor',case when baseline.committed_minor is null then null else 0 end,
 'idempotency_key','remaining-six-owner-policy','reason','Explicit isolated owner-chain metadata, unchanged source money');
 execute 'set local role authenticated';r:=public.append_operations_obligation_source_policy_v1(p);
 if r->>'outcome' is distinct from 'accepted' or r->'eac_minor' is distinct from 'null'::jsonb then raise exception 'remaining_six_policy_owner_chain_required';end if;
 if public.append_operations_obligation_source_policy_v1(p)->>'outcome' is distinct from 'replayed' then raise exception 'remaining_six_policy_owner_replay_required';end if;
 preview:=public.preview_operations_project_scope_v1('project',baseline.project_id);
 r:=public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id',scope,
 'root_kind','project','root_id',baseline.project_id,'expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint',
 'idempotency_key','remaining-six-owner-scope','reason','Explicit isolated current project scope'));
 if r->>'outcome' is distinct from 'accepted' then raise exception 'remaining_six_scope_enrollment_required';end if;
 p:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope,'expected_scope_revision',1,
 'expected_membership_fingerprint',preview->>'membership_fingerprint','expected_composition_revision',0,'currency',baseline.currency,
 'baseline_event_ids',jsonb_build_array(baseline.event_id),'idempotency_key','remaining-six-owner-compose','reason','Actual owner recursion preserves saved manual evidence');
 r:=public.compose_operations_scope_obligations_v1(p);
 if r->>'outcome' is distinct from 'accepted' or r->'eac_minor' is distinct from 'null'::jsonb then raise exception 'remaining_six_compose_owner_chain_required';end if;
 if public.compose_operations_scope_obligations_v1(p)->>'outcome' is distinct from 'replayed' then raise exception 'remaining_six_compose_owner_replay_required';end if;
 execute 'reset role';
 select document into strict saved from public.operations_scope_obligation_compositions where snapshot_id=(r->>'snapshot_id')::uuid;
 if saved->'known_estimate_minor' is distinct from coalesce(to_jsonb(baseline.estimate_minor),'null'::jsonb)
 or saved->'known_commitment_minor' is distinct from coalesce(to_jsonb(baseline.committed_minor),'null'::jsonb)
 or saved->>'currency' is distinct from baseline.currency
 or saved->>'coverage' is distinct from 'unavailable'
 or saved->'eac_minor' is distinct from 'null'::jsonb or saved->'budget_minor' is distinct from 'null'::jsonb
 or jsonb_array_length(saved->'baseline_events') is distinct from 1
 or saved#>>'{baseline_events,0,baseline_event_id}' is distinct from baseline.event_id::text
 or saved#>'{baseline_events,0,estimate_minor}' is distinct from coalesce(to_jsonb(baseline.estimate_minor),'null'::jsonb)
 or saved#>'{baseline_events,0,committed_minor}' is distinct from coalesce(to_jsonb(baseline.committed_minor),'null'::jsonb)
 or jsonb_array_length(saved->'source_inventory') is distinct from 1
 or saved#>>'{source_inventory,0,binding_event_id}' is distinct from binding.event_id::text
 or saved#>'{source_inventory,0,observed_amount_minor}' is distinct from to_jsonb(binding.amount_minor)
 or saved#>>'{source_inventory,0,source_raw_body_sha256}' is distinct from binding.source_raw_body_sha256
 then raise exception 'remaining_six_compose_copied_immutable_money_required';end if;
end$$;
commit;
select 'remaining-six-owner PASS actual_policy_compose_nested_owner_commands' as result;
