-- NEW default-disabled snapshot-only successor. No source export, nonce, outbox or Finance admission.
-- The same physical publication head advances; destination_raw_body remains constrained NULL.
-- Complete SQL/procedure definitions cover prosqlbody; aggregate direct dependencies are inspected without pg_get_functiondef.
-- The callee itself is an identity, not an allowed extra caller. Dynamic invocation remains outside this finite audit.
do $$begin
 if exists(select 1 from (values
 ('operations_economy_private.authorize_scope_read_nowait_v1()','e97c7bf8921d5ac7a0a300748b37c9b237063f8f54955c37e2f22508b3f53ae7'),
 ('operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid)','3613bb7322ebba908ce9fe5fae5eeb52b20635daaefddd81add46374a1075542'),
 ('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','31dde17f6d50209ad0df5b10e269ffd043fcc30e34422fb0ebf9c5c5730e1504'),
 ('operations_whole_scope_publication_private.publish_v1(jsonb)','c2a3b228885ebb4a9185a53561e82d42f6d9209aa877f08918e02d0bde1689a4'),
 ('operations_whole_scope_export_grant_private.write_v1(jsonb)','fa9cffeb3dfafc70fefceba4655efb499992e97cb8e7822c89be9de47ca4c2cc'),
 ('public.publish_operations_whole_scope_product_v1(jsonb)','6d7bfe10e055af891d5fb1fd6539c631f94860b3e38e8e004cea2987e5929233'),
 ('public.write_operations_whole_scope_product_export_grant_v1(jsonb)','8cf33852cccc94d3a2d5df6e704803afd941d49cd7de86e50bc6e1734fa077d8')
 ) expected(signature,body_sha256) join pg_proc p on p.oid=expected.signature::regprocedure where encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from expected.body_sha256)
 then raise exception 'installed_granted_predecessor_bodies_required' using errcode='55000';end if;
 if exists(select 1 from pg_proc p where (case when p.prokind='a' then p.prosrc else pg_get_functiondef(p.oid) end ~* '\mread_scope_invoice_kernel_compatible_v1\M' or exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass and d.refobjid='operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure and d.refobjsubid=0)) and p.oid<>all(array[
 'operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure::oid]))
 or exists(select 1 from pg_proc p where p.oid=any(array[
 'operations_economy_private.authorize_scope_read_nowait_v1()'::regprocedure::oid,
 'operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid)'::regprocedure::oid,
 'operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure::oid]) and
 (p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]))
 or has_function_privilege('anon','operations_economy_private.authorize_scope_read_nowait_v1()','EXECUTE')
 or has_function_privilege('authenticated','operations_economy_private.authorize_scope_read_nowait_v1()','EXECUTE')
 or has_function_privilege('service_role','operations_economy_private.authorize_scope_read_nowait_v1()','EXECUTE')
 or has_function_privilege('anon','operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid)','EXECUTE')
 or has_function_privilege('authenticated','operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid)','EXECUTE')
 or has_function_privilege('service_role','operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid)','EXECUTE')
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 or not has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 or exists(select 1 from pg_proc p where p.oid=any(array[
 'public.publish_operations_whole_scope_product_v1(jsonb)'::regprocedure::oid,
 'public.write_operations_whole_scope_product_export_grant_v1(jsonb)'::regprocedure::oid]) and
 (p.proowner<>(select oid from pg_roles where rolname=current_user) or p.prosecdef or p.proconfig is distinct from array['search_path=""','default_transaction_isolation=repeatable read']::text[]))
 or not has_function_privilege('authenticated','operations_whole_scope_publication_private.publish_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_whole_scope_publication_private.publish_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','operations_whole_scope_publication_private.publish_v1(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','operations_whole_scope_export_grant_private.write_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_whole_scope_export_grant_private.write_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','operations_whole_scope_export_grant_private.write_v1(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.publish_operations_whole_scope_product_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','public.publish_operations_whole_scope_product_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.publish_operations_whole_scope_product_v1(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.write_operations_whole_scope_product_export_grant_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','public.write_operations_whole_scope_product_export_grant_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.write_operations_whole_scope_product_export_grant_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_whole_scope_publication_private.publish_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','operations_whole_scope_export_grant_private.write_v1(jsonb)','EXECUTE')
 then raise exception 'installed_granted_publication_predecessor_required' using errcode='55000';end if;
 if not exists(select 1 from pg_constraint where conrelid='operations_whole_scope_publication_private.publications'::regclass and conname='publications_export_grant_check' and contype='c' and pg_get_constraintdef(oid)='CHECK ((export_grant IS NULL))')
 or not exists(select 1 from pg_constraint where conrelid='operations_whole_scope_publication_private.publications'::regclass and conname='publications_destination_raw_body_check' and contype='c' and pg_get_constraintdef(oid)='CHECK ((destination_raw_body IS NULL))')
 or exists(select 1 from operations_whole_scope_publication_private.publications where export_grant is not null or destination_raw_body is not null or document->>'schema_version' is distinct from 'operations-whole-scope-product-publication.v1')
 then raise exception 'installed_null_publication_history_required' using errcode='55000';end if;
end;$$;

create table operations_whole_scope_publication_private.granted_gates(
 organization_id uuid not null,economic_scope_id uuid not null,enabled boolean not null default false,
 primary key(organization_id,economic_scope_id),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_publication_private.grant_bindings(
 publication_id uuid primary key references operations_whole_scope_publication_private.publications(publication_id),
 organization_id uuid not null,economic_scope_id uuid not null,grant_event_id uuid not null,
 foreign key(organization_id,economic_scope_id,grant_event_id) references operations_whole_scope_export_grant_private.events(organization_id,economic_scope_id,event_id)
);
alter table operations_whole_scope_publication_private.granted_gates enable row level security;
alter table operations_whole_scope_publication_private.grant_bindings enable row level security;
revoke all on operations_whole_scope_publication_private.granted_gates,operations_whole_scope_publication_private.grant_bindings from public,anon,authenticated,service_role;
grant select,insert on operations_whole_scope_publication_private.granted_gates to service_role;
grant update(enabled) on operations_whole_scope_publication_private.granted_gates to service_role;
create trigger granted_gate_identity before update or delete on operations_whole_scope_publication_private.granted_gates for each row execute function operations_whole_scope_publication_private.guard_gate_v1();
create trigger granted_gate_no_truncate before truncate on operations_whole_scope_publication_private.granted_gates for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_publication_private.command_granted_v2(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$declare k text;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>10 or not(p ?& array['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_publication_revision','expected_grant_revision','idempotency_key','reason'])
 or p->>'schema_version' is distinct from 'operations-whole-scope-granted-product-publication-command.v2' then raise exception 'exact_granted_publication_command_required' using errcode='22023';end if;
 if jsonb_typeof(p->'economic_scope_id') is distinct from 'string' or p->>'economic_scope_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_granted_publication_identity' using errcode='22023';end if;
 foreach k in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision','expected_grant_revision'] loop
 if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric) or (p->>k)::numeric not between (case when k='expected_publication_revision' then 0 else 1 end) and (case when k='expected_publication_revision' then 9007199254740990 else 9007199254740991 end) then raise exception 'invalid_granted_publication_revision' using errcode='22023';end if;end loop;
 foreach k in array array['expected_membership_fingerprint','expected_composition_fingerprint'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{64}$' then raise exception 'invalid_granted_publication_fingerprint' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3 then raise exception 'invalid_granted_publication_audit' using errcode='22023';end if;
 p:=p||jsonb_build_object('economic_scope_id',lower(p->>'economic_scope_id'));
 foreach k in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision','expected_grant_revision'] loop p:=jsonb_set(p,array[k],to_jsonb((p->>k)::bigint));end loop;
 if octet_length(operations_economy_private.canonical_json_v1(p))>16384 then raise exception 'granted_publication_command_limit' using errcode='22023';end if;
 return p;
end;$$;
revoke all on function operations_whole_scope_publication_private.command_granted_v2(jsonb) from public,anon,authenticated,service_role;

-- No JWT switching: the actual saved issuer is checked explicitly under current rows.
create function operations_whole_scope_publication_private.authorize_issuer_granted_v2(p_actor uuid,p_org uuid) returns void
language plpgsql set search_path='' as $$declare actual_org uuid;begin
 perform 1 from auth.users where id=p_actor for share nowait;
 if not found then raise exception 'current_grant_issuer_required' using errcode='42501';end if;
 begin select organization_id into strict actual_org from public.profiles where user_id=p_actor for share nowait;
 exception when no_data_found or too_many_rows then raise exception 'current_grant_issuer_required' using errcode='42501';end;
 if actual_org is distinct from p_org then raise exception 'current_grant_issuer_required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=p_actor and organization_id=p_org and role='admin' for share nowait;
 if not found then raise exception 'current_grant_issuer_required' using errcode='42501';end if;
end;$$;
revoke all on function operations_whole_scope_publication_private.authorize_issuer_granted_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function operations_whole_scope_publication_private.receipt_granted_v2(p_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$declare p operations_whole_scope_publication_private.publications%rowtype;begin
 select * into p from operations_whole_scope_publication_private.publications where publication_id=p_id;
 if not found or p.document->>'schema_version' is distinct from 'operations-whole-scope-granted-product-publication.v2' then raise exception 'saved_granted_publication_required' using errcode='55000';end if;
 return jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication-receipt.v2','outcome','accepted','publication_id',p.publication_id,'publication_revision',p.publication_revision,'source_publication_fingerprint',p.source_publication_fingerprint,'source_evidence_fingerprint',p.source_evidence_fingerprint,'grant_event_id',p.export_grant->'event_id','grant_revision',p.export_grant->'revision','grant_fingerprint',p.export_grant->'fingerprint','historical_only',false,'delivery_state','blocked_missing_protected_source_export','shadow_only',true);
end;$$;
revoke all on function operations_whole_scope_publication_private.receipt_granted_v2(uuid) from public,anon,authenticated,service_role;

create function operations_whole_scope_publication_private.binding_guard_granted_v2() returns trigger
language plpgsql set search_path='' as $$declare p operations_whole_scope_publication_private.publications%rowtype;e operations_whole_scope_export_grant_private.events%rowtype;g jsonb;begin
 if tg_op<>'INSERT' then raise exception 'immutable_granted_publication_binding' using errcode='55000';end if;
 select * into p from operations_whole_scope_publication_private.publications where publication_id=new.publication_id and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id;
 if not found or p.document->>'schema_version' is distinct from 'operations-whole-scope-granted-product-publication.v2' then raise exception 'saved_granted_binding_publication_required' using errcode='55000';end if;
 select * into e from operations_whole_scope_export_grant_private.events where event_id=new.grant_event_id and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id;
 if not found then raise exception 'saved_granted_binding_event_required' using errcode='55000';end if;
 g:=jsonb_build_object('event_id',e.event_id,'revision',e.revision,'fingerprint',e.fingerprint,'destination_organization_id',e.destination_organization_id,'destination_scope_id',e.destination_scope_id,'destination_mapping_id',e.document->'destination_mapping_id','destination_mapping_revision',e.document->'destination_mapping_revision');
 if p.export_grant is distinct from g or p.document->'export_grant' is distinct from g or not exists(select 1 from operations_whole_scope_export_grant_private.owners o where o.organization_id=e.organization_id and o.economic_scope_id=e.economic_scope_id and o.destination_organization_id=e.destination_organization_id and o.destination_scope_id=e.destination_scope_id) then raise exception 'saved_matching_granted_binding_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.binding_guard_granted_v2() from public,anon,authenticated,service_role;
create trigger granted_binding_guard before insert or update or delete on operations_whole_scope_publication_private.grant_bindings for each row execute function operations_whole_scope_publication_private.binding_guard_granted_v2();
create trigger granted_binding_no_truncate before truncate on operations_whole_scope_publication_private.grant_bindings for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_publication_private.complete_granted_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if new.document->>'schema_version'='operations-whole-scope-granted-product-publication.v2' then
 if not exists(select 1 from operations_whole_scope_publication_private.grant_bindings b where b.publication_id=new.publication_id and b.organization_id=new.organization_id and b.economic_scope_id=new.economic_scope_id and b.grant_event_id=(new.export_grant->>'event_id')::uuid)
 or not exists(select 1 from operations_whole_scope_publication_private.receipts r where r.publication_id=new.publication_id and r.document=operations_whole_scope_publication_private.receipt_granted_v2(new.publication_id)) then raise exception 'complete_saved_granted_publication_required' using errcode='55000';end if;
 elsif exists(select 1 from operations_whole_scope_publication_private.grant_bindings b where b.publication_id=new.publication_id) then raise exception 'legacy_publication_binding_forbidden' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.complete_granted_v2() from public,anon,authenticated,service_role;
create constraint trigger granted_publication_complete after insert on operations_whole_scope_publication_private.publications deferrable initially deferred for each row execute function operations_whole_scope_publication_private.complete_granted_v2();

create function operations_whole_scope_publication_private.receipt_guard_granted_v2() returns trigger
language plpgsql set search_path='' as $$declare p operations_whole_scope_publication_private.publications%rowtype;begin
 select * into p from operations_whole_scope_publication_private.publications where publication_id=new.publication_id;
 if not found then raise exception 'saved_receipt_publication_required' using errcode='55000';end if;
 if p.document->>'schema_version'='operations-whole-scope-granted-product-publication.v2' and
 (new.document is distinct from operations_whole_scope_publication_private.receipt_granted_v2(new.publication_id) or not exists(select 1 from operations_whole_scope_publication_private.grant_bindings where publication_id=new.publication_id)) then raise exception 'saved_matching_granted_receipt_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.receipt_guard_granted_v2() from public,anon,authenticated,service_role;
create trigger granted_receipt_guard before insert on operations_whole_scope_publication_private.receipts for each row execute function operations_whole_scope_publication_private.receipt_guard_granted_v2();

-- Narrow schema variant only; the separate NULL destination body constraint is never dropped.
alter table operations_whole_scope_publication_private.publications drop constraint publications_export_grant_check;
alter table operations_whole_scope_publication_private.publications add constraint publications_export_grant_versioned_check check(
 (document->>'schema_version'='operations-whole-scope-product-publication.v1' and export_grant is null)
 or (document->>'schema_version'='operations-whole-scope-granted-product-publication.v2' and export_grant is not null and jsonb_typeof(export_grant)='object'));

create function operations_whole_scope_publication_private.publication_guard_granted_v2() returns trigger
language plpgsql set search_path='' as $$declare
 q jsonb;m public.operations_project_scope_snapshots%rowtype;c public.operations_scope_obligation_compositions%rowtype;
 e operations_whole_scope_export_grant_private.events%rowtype;g jsonb;expected jsonb;manifest jsonb;actual_receipt jsonb;project uuid;
begin
 if new.document->>'schema_version'='operations-whole-scope-product-publication.v1' then
 if new.export_grant is not null then raise exception 'legacy_null_grant_required' using errcode='55000';end if;return new;end if;
 if new.document->>'schema_version' is distinct from 'operations-whole-scope-granted-product-publication.v2' then raise exception 'known_product_publication_schema_required' using errcode='55000';end if;
 if current_setting('transaction_isolation') not in ('repeatable read','serializable') then raise exception 'coherent_granted_publication_transaction_required' using errcode='55000';end if;
 q:=operations_whole_scope_publication_private.command_granted_v2(new.command);
 if q is distinct from new.command or new.idempotency_key is distinct from q->>'idempotency_key' or new.economic_scope_id is distinct from (q->>'economic_scope_id')::uuid or new.publication_revision<>(q->>'expected_publication_revision')::bigint+1 then raise exception 'saved_normalized_granted_command_required' using errcode='55000';end if;
 if auth.uid() is distinct from new.actor_id or operations_economy_private.authorize_scope_read_nowait_v1() is distinct from new.organization_id then raise exception 'actual_granted_publication_actor_required' using errcode='42501';end if;
 select * into m from public.operations_project_scope_snapshots where snapshot_id=(new.document->>'scope_snapshot_id')::uuid and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id;
 if not found then raise exception 'saved_granted_scope_required' using errcode='55000';end if;
 select * into c from public.operations_scope_obligation_compositions where snapshot_id=(new.document->>'composition_snapshot_id')::uuid and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and scope_snapshot_id=m.snapshot_id;
 if not found then raise exception 'saved_granted_composition_required' using errcode='55000';end if;
 if m.scope_revision<>(q->>'expected_scope_revision')::bigint or m.membership_fingerprint is distinct from q->>'expected_membership_fingerprint' or c.composition_revision<>(q->>'expected_composition_revision')::bigint or c.fingerprint is distinct from q->>'expected_composition_fingerprint' then raise exception 'saved_granted_selectors_required' using errcode='55000';end if;
 select ge.* into e from operations_whole_scope_export_grant_private.heads h join operations_whole_scope_export_grant_private.events ge on ge.event_id=h.event_id and ge.organization_id=h.organization_id and ge.economic_scope_id=h.economic_scope_id and ge.revision=h.revision and ge.fingerprint=h.fingerprint where h.organization_id=new.organization_id and h.economic_scope_id=new.economic_scope_id for share of h nowait;
 if not found or e.revision<>(q->>'expected_grant_revision')::bigint or e.command->'enabled' is distinct from 'true'::jsonb then raise exception 'current_enabled_saved_grant_required' using errcode='55000';end if;
 if row(e.scope_snapshot_id,e.composition_snapshot_id) is distinct from row(m.snapshot_id,c.snapshot_id) or e.document->'full_membership' is distinct from m.membership then raise exception 'current_matching_granted_membership_required' using errcode='55000';end if;
 perform operations_whole_scope_publication_private.authorize_issuer_granted_v2(e.actor_id,new.organization_id);
 foreach project in array (select coalesce(array_agg(id order by id),'{}'::uuid[]) from (select value::uuid id from jsonb_array_elements_text(m.membership->'source_project_ids') union select b.project_id from public.operations_scope_obligation_baseline_captures x join public.operations_project_obligation_baselines b on b.event_id=x.baseline_event_id where x.composition_snapshot_id=c.snapshot_id and b.organization_id=new.organization_id) ids) loop
 perform 1 from public.projects where id=project and organization_id=new.organization_id and deleted_at is null for share nowait;
 if not found then raise exception 'granted_full_member_permission_denied' using errcode='42501';end if;end loop;
 perform operations_economy_private.lock_scope_read_root_nowait_v1(new.organization_id,m.membership->>'root_kind',(m.membership->>'root_id')::uuid);
 perform 1 from public.operations_project_scope_heads where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and current_revision=m.scope_revision for share nowait;
 if not found then raise exception 'current_granted_scope_required' using errcode='55000';end if;
 perform 1 from public.operations_scope_obligation_composition_heads where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and current_revision=c.composition_revision for share nowait;
 if not found then raise exception 'current_granted_composition_required' using errcode='55000';end if;
 perform 1 from operations_whole_scope_publication_private.granted_gates where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and enabled for share nowait;
 if not found then raise exception 'granted_publication_gate_disabled' using errcode='42501';end if;
 perform 1 from operations_whole_scope_publication_private.gates where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and enabled for share nowait;
 if not found then raise exception 'product_publication_gate_disabled' using errcode='42501';end if;
 perform 1 from operations_whole_scope_export_grant_private.gates where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and enabled for share nowait;
 if not found then raise exception 'grant_write_gate_disabled' using errcode='42501';end if;
 perform 1 from operations_whole_scope_export_grant_private.partners where partner_version=e.partner_version and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and destination_organization_id=e.destination_organization_id and destination_scope_id=e.destination_scope_id and purpose='operations-whole-scope-product-source-read' and enabled for share nowait;
 if not found then raise exception 'enabled_granted_partner_required' using errcode='42501';end if;
 select document into actual_receipt from operations_whole_scope_export_grant_private.receipts where event_id=e.event_id;
 if not found or actual_receipt is distinct from jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',e.event_id,'economic_scope_id',e.economic_scope_id,'revision',e.revision,'fingerprint',e.fingerprint,'command_fingerprint',e.command_fingerprint,'enabled',true,'historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true) then raise exception 'saved_current_granted_receipt_required' using errcode='55000';end if;
 g:=jsonb_build_object('event_id',e.event_id,'revision',e.revision,'fingerprint',e.fingerprint,'destination_organization_id',e.destination_organization_id,'destination_scope_id',e.destination_scope_id,'destination_mapping_id',e.document->'destination_mapping_id','destination_mapping_revision',e.document->'destination_mapping_revision');
 if new.export_grant is distinct from g or not exists(select 1 from operations_whole_scope_export_grant_private.owners where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and destination_organization_id=e.destination_organization_id and destination_scope_id=e.destination_scope_id) then raise exception 'saved_matching_granted_owner_required' using errcode='55000';end if;
 if new.capture->>'organization_id' is distinct from new.organization_id::text or new.capture->>'economic_scope_id' is distinct from new.economic_scope_id::text or new.capture->>'scope_snapshot_id' is distinct from m.snapshot_id::text or new.capture->>'composition_snapshot_id' is distinct from c.snapshot_id::text
 or new.projection is distinct from operations_whole_scope_publication_private.calculate_scope_v1(new.capture) or new.observed_at is distinct from (new.capture->>'as_of')::timestamptz then raise exception 'saved_granted_capture_projection_required' using errcode='55000';end if;
 select coalesce(jsonb_agg(value-'source_organization_id'-'invoice_id' order by ord),'[]'::jsonb) into manifest from jsonb_array_elements(new.capture->'source_inventory') with ordinality x(value,ord);
 if new.source_manifest is distinct from manifest or new.source_evidence_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',new.capture)),'UTF8')),'hex') then raise exception 'saved_granted_source_evidence_required' using errcode='55000';end if;
 expected:=jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication.v2','publication_id',new.publication_id,'organization_id',new.organization_id,'economic_scope_id',new.economic_scope_id,'publication_revision',new.publication_revision,'actor_id',new.actor_id,'command',q,'calculation_version','operations-whole-scope-invoice-capture-sql.v1','full_membership',m.membership,'scope_snapshot_id',m.snapshot_id,'scope_revision',m.scope_revision,'membership_fingerprint',m.membership_fingerprint,'composition_snapshot_id',c.snapshot_id,'composition_revision',c.composition_revision,'composition_fingerprint',c.fingerprint,'capture',new.capture,'projection',new.projection,'source_manifest',manifest,'source_evidence_fingerprint',new.source_evidence_fingerprint,'observed_at',new.capture->'as_of','export_grant',g,'shadow_only',true);
 if new.document is distinct from expected or new.source_publication_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-granted-product-publication-v2',expected)),'UTF8')),'hex') or octet_length(operations_economy_private.canonical_json_v1(expected))>4194304 or new.destination_raw_body is not null then raise exception 'saved_matching_granted_document_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.publication_guard_granted_v2() from public,anon,authenticated,service_role;
create trigger granted_publication_guard before insert on operations_whole_scope_publication_private.publications for each row execute function operations_whole_scope_publication_private.publication_guard_granted_v2();

create function operations_whole_scope_publication_private.publish_granted_v2(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 q jsonb;org uuid;actor uuid:=auth.uid();scope_id uuid;project uuid;projects uuid[];rechecked uuid[];captured_projects uuid[];
 prior operations_whole_scope_publication_private.publications%rowtype;prior_found boolean;
 selected_event operations_whole_scope_export_grant_private.events%rowtype;current_event operations_whole_scope_export_grant_private.events%rowtype;
 hinted_grant operations_whole_scope_export_grant_private.heads%rowtype;locked_grant operations_whole_scope_export_grant_private.heads%rowtype;
 publication_head operations_whole_scope_publication_private.heads%rowtype;head_found boolean;
 current_publication operations_whole_scope_publication_private.publications%rowtype;
 partner operations_whole_scope_export_grant_private.partners%rowtype;owner operations_whole_scope_export_grant_private.owners%rowtype;
 membership public.operations_project_scope_snapshots%rowtype;composition public.operations_scope_obligation_compositions%rowtype;
 request jsonb;captured jsonb;projection jsonb;manifest jsonb;grant_json jsonb;document jsonb;receipt jsonb;grant_receipt jsonb;
 new_id uuid;revision bigint;evidence_fp text;publication_fp text;message text;
begin
 if current_setting('transaction_isolation') not in ('repeatable read','serializable') then raise exception 'coherent_granted_publication_transaction_required' using errcode='55000';end if;
 q:=operations_whole_scope_publication_private.command_granted_v2(p_command);
 org:=operations_economy_private.authorize_scope_read_nowait_v1();scope_id:=(q->>'economic_scope_id')::uuid;
 perform 1 from operations_whole_scope_publication_private.granted_gates where organization_id=org and economic_scope_id=scope_id and enabled for share nowait;
 if not found then raise exception 'granted_publication_gate_disabled' using errcode='42501';end if;
 perform 1 from operations_whole_scope_publication_private.gates where organization_id=org and economic_scope_id=scope_id and enabled for share nowait;
 if not found then raise exception 'product_publication_gate_disabled' using errcode='42501';end if;
 perform 1 from operations_whole_scope_export_grant_private.gates where organization_id=org and economic_scope_id=scope_id and enabled for share nowait;
 if not found then raise exception 'grant_write_gate_disabled' using errcode='42501';end if;
 select * into prior from operations_whole_scope_publication_private.publications where organization_id=org and idempotency_key=q->>'idempotency_key';prior_found:=found;
 if prior_found and (prior.command is distinct from q or prior.actor_id is distinct from actor or prior.document->>'schema_version' is distinct from 'operations-whole-scope-granted-product-publication.v2') then raise exception 'granted_publication_idempotency_conflict' using errcode='23505';end if;
 select * into hinted_grant from operations_whole_scope_export_grant_private.heads where organization_id=org and economic_scope_id=scope_id;
 if not found then
 if exists(select 1 from operations_whole_scope_export_grant_private.events where organization_id=org and economic_scope_id=scope_id) or exists(select 1 from operations_whole_scope_export_grant_private.owners where organization_id=org and economic_scope_id=scope_id) then raise exception 'saved_current_granted_head_required' using errcode='55000';end if;
 raise exception 'current_granted_head_required' using errcode='PT409';end if;
 if prior_found then
 select e.* into selected_event from operations_whole_scope_publication_private.grant_bindings b join operations_whole_scope_export_grant_private.events e on e.organization_id=b.organization_id and e.economic_scope_id=b.economic_scope_id and e.event_id=b.grant_event_id where b.publication_id=prior.publication_id and b.organization_id=org and b.economic_scope_id=scope_id;
 if not found then raise exception 'saved_historical_granted_binding_required' using errcode='55000';end if;
 select m.* into membership from public.operations_project_scope_heads h join public.operations_project_scope_snapshots m on m.organization_id=h.organization_id and m.economic_scope_id=h.economic_scope_id and m.scope_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope_id;
 if not found then raise exception 'current_granted_scope_required' using errcode='PT409';end if;
 select c.* into composition from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope_id;
 else
 select ge.* into selected_event from operations_whole_scope_export_grant_private.events ge where ge.event_id=hinted_grant.event_id and ge.organization_id=org and ge.economic_scope_id=scope_id and ge.revision=hinted_grant.revision and ge.fingerprint=hinted_grant.fingerprint;
 if not found then raise exception 'saved_current_granted_head_required' using errcode='55000';end if;
 select * into membership from public.operations_project_scope_snapshots where organization_id=org and economic_scope_id=scope_id and scope_revision=(q->>'expected_scope_revision')::bigint and membership_fingerprint=q->>'expected_membership_fingerprint';
 if not found then raise exception 'current_granted_scope_required' using errcode='PT409';end if;
 select * into composition from public.operations_scope_obligation_compositions where organization_id=org and economic_scope_id=scope_id and composition_revision=(q->>'expected_composition_revision')::bigint and fingerprint=q->>'expected_composition_fingerprint';
 end if;
 if not found or composition.scope_snapshot_id is distinct from membership.snapshot_id then raise exception 'current_granted_composition_required' using errcode='PT409';end if;
 -- The saved issuer is explicit; never switch request JWT claims.
 perform operations_whole_scope_publication_private.authorize_issuer_granted_v2(selected_event.actor_id,org);
 select * into partner from operations_whole_scope_export_grant_private.partners where partner_version=selected_event.partner_version for share nowait;
 if not found or row(partner.organization_id,partner.economic_scope_id,partner.destination_organization_id,partner.destination_scope_id,partner.purpose) is distinct from row(org,scope_id,selected_event.destination_organization_id,selected_event.destination_scope_id,'operations-whole-scope-product-source-read'::text) then raise exception 'matching_granted_partner_required' using errcode='42501';end if;
 if not prior_found and (not partner.enabled or selected_event.command->'enabled' is distinct from 'true'::jsonb) then raise exception 'enabled_granted_partner_required' using errcode='42501';end if;
 if jsonb_typeof(membership.membership->'source_project_ids') is distinct from 'array' or jsonb_array_length(membership.membership->'source_project_ids')>1000 then raise exception 'granted_project_union_limit' using errcode='22023';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into projects from (select value::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids') union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if cardinality(projects)>1000 then raise exception 'granted_project_union_limit' using errcode='22023';end if;
 foreach project in array projects loop perform 1 from public.projects where id=project and organization_id=org and deleted_at is null for share nowait;
 if not found then raise exception 'granted_full_member_permission_denied' using errcode='42501';end if;end loop;
 perform operations_economy_private.lock_scope_read_root_nowait_v1(org,membership.membership->>'root_kind',(membership.membership->>'root_id')::uuid);
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0)) or not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0)) then raise exception 'granted_publication_lock_busy' using errcode='55P03';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-destination-owner-v1',selected_event.destination_organization_id::text,selected_event.destination_scope_id::text)),0)) then raise exception 'granted_destination_owner_busy' using errcode='55P03';end if;
 select * into owner from operations_whole_scope_export_grant_private.owners where organization_id=org and economic_scope_id=scope_id;
 if not found or row(owner.destination_organization_id,owner.destination_scope_id) is distinct from row(selected_event.destination_organization_id,selected_event.destination_scope_id) then raise exception 'saved_granted_owner_required' using errcode='55000';end if;
 -- Fixed cross-head order: grant SHARE before publication UPDATE, both NOWAIT.
 select * into locked_grant from operations_whole_scope_export_grant_private.heads where organization_id=org and economic_scope_id=scope_id for share nowait;
 if not found or row(locked_grant.event_id,locked_grant.revision,locked_grant.fingerprint) is distinct from row(hinted_grant.event_id,hinted_grant.revision,hinted_grant.fingerprint) then raise exception 'granted_head_changed' using errcode='PT409';end if;
 select ge.* into current_event from operations_whole_scope_export_grant_private.events ge where ge.event_id=locked_grant.event_id and ge.organization_id=org and ge.economic_scope_id=scope_id and ge.revision=locked_grant.revision and ge.fingerprint=locked_grant.fingerprint;
 if not found or row(current_event.destination_organization_id,current_event.destination_scope_id) is distinct from row(owner.destination_organization_id,owner.destination_scope_id) then raise exception 'saved_current_granted_head_required' using errcode='55000';end if;
 select gr.document into grant_receipt from operations_whole_scope_export_grant_private.receipts gr where gr.event_id=selected_event.event_id;
 if not found or grant_receipt is distinct from jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',selected_event.event_id,'economic_scope_id',scope_id,'revision',selected_event.revision,'fingerprint',selected_event.fingerprint,'command_fingerprint',selected_event.command_fingerprint,'enabled',selected_event.command->'enabled','historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true) then raise exception 'saved_selected_granted_receipt_required' using errcode='55000';end if;
 if not prior_found and (locked_grant.revision<>(q->>'expected_grant_revision')::bigint or selected_event.event_id is distinct from locked_grant.event_id) then raise exception 'granted_revision_changed' using errcode='PT409';end if;
 if not prior_found and (row(selected_event.scope_snapshot_id,selected_event.composition_snapshot_id) is distinct from row(membership.snapshot_id,composition.snapshot_id) or selected_event.document->'full_membership' is distinct from membership.membership) then raise exception 'granted_membership_changed' using errcode='PT409';end if;
 select * into publication_head from operations_whole_scope_publication_private.heads where organization_id=org and economic_scope_id=scope_id for update nowait;head_found:=found;
 if not head_found and exists(select 1 from operations_whole_scope_publication_private.publications where organization_id=org and economic_scope_id=scope_id) then raise exception 'saved_current_product_head_required' using errcode='55000';end if;
 if head_found then select * into current_publication from operations_whole_scope_publication_private.publications where organization_id=org and economic_scope_id=scope_id and publication_revision=publication_head.publication_revision and publication_id=publication_head.publication_id;
 if not found then raise exception 'saved_current_product_head_required' using errcode='55000';end if;end if;
 if not prior_found and coalesce(publication_head.publication_revision,0)<>(q->>'expected_publication_revision')::bigint then raise exception 'granted_publication_revision_changed' using errcode='PT409';end if;
 perform 1 from public.operations_project_scope_heads where organization_id=org and economic_scope_id=scope_id and current_revision=membership.scope_revision and root_kind=membership.membership->>'root_kind' and root_id=(membership.membership->>'root_id')::uuid for share nowait;
 if not found then raise exception 'current_granted_scope_required' using errcode='PT409';end if;
 perform 1 from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope_id and current_revision=composition.composition_revision for share nowait;
 if not found then raise exception 'current_granted_composition_required' using errcode='PT409';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into rechecked from (select value::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids') union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if rechecked is distinct from projects then raise exception 'granted_permission_set_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id',org,'economic_scope_id',scope_id,'expected_scope_revision',membership.scope_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',composition.composition_revision,'expected_composition_fingerprint',composition.fingerprint);
 begin captured:=operations_economy_private.read_scope_invoice_kernel_compatible_v1(request);
 exception when sqlstate '22023' then get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required') then raise exception 'granted_source_changed' using errcode='PT409';end if;raise;end;
 select coalesce(array_agg(distinct (value->>'project_id')::uuid order by (value->>'project_id')::uuid),'{}'::uuid[]) into captured_projects from jsonb_array_elements(captured->'members');
 if not captured_projects<@projects then raise exception 'granted_permission_set_changed' using errcode='PT409';end if;
 grant_json:=jsonb_build_object('event_id',selected_event.event_id,'revision',selected_event.revision,'fingerprint',selected_event.fingerprint,'destination_organization_id',selected_event.destination_organization_id,'destination_scope_id',selected_event.destination_scope_id,'destination_mapping_id',selected_event.document->'destination_mapping_id','destination_mapping_revision',selected_event.document->'destination_mapping_revision');
 if prior_found then
 if not head_found or publication_head.publication_revision<prior.publication_revision or locked_grant.revision<selected_event.revision or prior.export_grant is distinct from grant_json or prior.document->'export_grant' is distinct from grant_json or row((prior.document->>'scope_snapshot_id')::uuid,(prior.document->>'composition_snapshot_id')::uuid) is distinct from row(selected_event.scope_snapshot_id,selected_event.composition_snapshot_id) then raise exception 'saved_historical_granted_lineage_required' using errcode='55000';end if;
 select pr.document into receipt from operations_whole_scope_publication_private.receipts pr where pr.publication_id=prior.publication_id;
 if not found or receipt is distinct from operations_whole_scope_publication_private.receipt_granted_v2(prior.publication_id) then raise exception 'saved_historical_granted_receipt_required' using errcode='55000';end if;
 return receipt||jsonb_build_object('outcome','replayed','historical_only',true);end if;
 projection:=operations_whole_scope_publication_private.calculate_scope_v1(captured);
 if projection->>'source_coverage' is distinct from 'unavailable' or projection->>'membership_currentness' is distinct from 'as_of_graph' or projection->>'source_currentness' is distinct from 'saved_receiver_heads_only' or projection->'credit_eligible' is distinct from 'false'::jsonb or projection->'remaining_minor' is distinct from 'null'::jsonb or projection->'eac_minor' is distinct from 'null'::jsonb or projection->'budget_minor' is distinct from 'null'::jsonb or projection->'margin_minor' is distinct from 'null'::jsonb then raise exception 'granted_unknown_coverage_changed' using errcode='22023';end if;
 select coalesce(jsonb_agg(value-'source_organization_id'-'invoice_id' order by ord),'[]'::jsonb) into manifest from jsonb_array_elements(captured->'source_inventory') with ordinality x(value,ord);
 new_id:=gen_random_uuid();revision:=(q->>'expected_publication_revision')::bigint+1;
 evidence_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',captured)),'UTF8')),'hex');
 document:=jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication.v2','publication_id',new_id,'organization_id',org,'economic_scope_id',scope_id,'publication_revision',revision,'actor_id',actor,'command',q,'calculation_version','operations-whole-scope-invoice-capture-sql.v1','full_membership',membership.membership,'scope_snapshot_id',membership.snapshot_id,'scope_revision',membership.scope_revision,'membership_fingerprint',membership.membership_fingerprint,'composition_snapshot_id',composition.snapshot_id,'composition_revision',composition.composition_revision,'composition_fingerprint',composition.fingerprint,'capture',captured,'projection',projection,'source_manifest',manifest,'source_evidence_fingerprint',evidence_fp,'observed_at',captured->'as_of','export_grant',grant_json,'shadow_only',true);
 if octet_length(operations_economy_private.canonical_json_v1(document))>4194304 then raise exception 'granted_publication_private_size_limit' using errcode='54000';end if;
 publication_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-granted-product-publication-v2',document)),'UTF8')),'hex');
 insert into operations_whole_scope_publication_private.publications values(new_id,org,scope_id,revision,actor,q->>'idempotency_key',q,document,captured,projection,manifest,evidence_fp,publication_fp,(captured->>'as_of')::timestamptz,grant_json,null);
 insert into operations_whole_scope_publication_private.grant_bindings values(new_id,org,scope_id,selected_event.event_id);
 receipt:=operations_whole_scope_publication_private.receipt_granted_v2(new_id);
 insert into operations_whole_scope_publication_private.receipts values(new_id,receipt);
 if not head_found then insert into operations_whole_scope_publication_private.heads values(org,scope_id,revision,new_id);
 else update operations_whole_scope_publication_private.heads set publication_revision=revision,publication_id=new_id where organization_id=org and economic_scope_id=scope_id and publication_id=publication_head.publication_id and publication_revision=publication_head.publication_revision;
 if not found then raise exception 'granted_publication_revision_changed' using errcode='PT409';end if;end if;
 return receipt;
exception when lock_not_available then raise exception 'granted_publication_lock_busy' using errcode='55P03';
end;$$;
revoke all on function operations_whole_scope_publication_private.publish_granted_v2(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_whole_scope_publication_private.publish_granted_v2(jsonb) to authenticated;
create function public.publish_operations_whole_scope_granted_product_v2(p_command jsonb) returns jsonb
language sql security invoker set search_path='' set default_transaction_isolation='repeatable read' as $$select operations_whole_scope_publication_private.publish_granted_v2(p_command);$$;
revoke all on function public.publish_operations_whole_scope_granted_product_v2(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publish_operations_whole_scope_granted_product_v2(jsonb) to authenticated;

-- Complete SQL/procedure definitions cover prosqlbody; aggregate direct dependencies are inspected without pg_get_functiondef.
-- The callee itself is an identity, not an allowed extra caller. Dynamic invocation remains outside this finite audit.
do $$begin
 if exists(select 1 from (values
 ('operations_whole_scope_publication_private.publish_granted_v2(jsonb)','36796c1f4c6f903136efad5f62a16403ff7fe40b7379ae18fb06ef917c8edda3'),
 ('public.publish_operations_whole_scope_granted_product_v2(jsonb)','8ea16cce9333948dd945913861bd4b9472af3dabbf4372804a5e8ef30ca6fb36')
 ) expected(signature,body_sha256) join pg_proc p on p.oid=expected.signature::regprocedure where encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from expected.body_sha256) then raise exception 'installed_granted_successor_bodies_required' using errcode='55000';end if;
 if exists(select 1 from pg_proc p where (case when p.prokind='a' then p.prosrc else pg_get_functiondef(p.oid) end ~* '\mread_scope_invoice_kernel_compatible_v1\M' or exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass and d.refobjid='operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure and d.refobjsubid=0)) and p.oid<>all(array[
 'operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_publication_private.publish_granted_v2(jsonb)'::regprocedure::oid]))
 or exists(select 1 from pg_proc p where (case when p.prokind='a' then p.prosrc else pg_get_functiondef(p.oid) end ~* '\mpublish_granted_v2\M' or exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass and d.refobjid='operations_whole_scope_publication_private.publish_granted_v2(jsonb)'::regprocedure and d.refobjsubid=0)) and p.oid<>all(array['operations_whole_scope_publication_private.publish_granted_v2(jsonb)'::regprocedure::oid,'public.publish_operations_whole_scope_granted_product_v2(jsonb)'::regprocedure::oid]))
 or exists(select 1 from pg_proc p where (case when p.prokind='a' then p.prosrc else pg_get_functiondef(p.oid) end ~* '\mwrite_v1\M' or exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass and d.refobjid='operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure and d.refobjsubid=0)) and p.oid<>all(array['operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure::oid,'public.write_operations_whole_scope_product_export_grant_v1(jsonb)'::regprocedure::oid]))
 or not has_function_privilege('authenticated','public.publish_operations_whole_scope_granted_product_v2(jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.publish_operations_whole_scope_granted_product_v2(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_whole_scope_publication_private.publish_granted_v2(jsonb)','EXECUTE')
 or has_function_privilege('service_role','operations_whole_scope_publication_private.publish_granted_v2(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','operations_whole_scope_publication_private.publish_granted_v2(jsonb)','EXECUTE')
 or exists(select 1 from pg_proc p where p.oid='operations_whole_scope_publication_private.publish_granted_v2(jsonb)'::regprocedure and (p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]))
 or exists(select 1 from pg_proc p where p.oid='public.publish_operations_whole_scope_granted_product_v2(jsonb)'::regprocedure and (p.proowner<>(select oid from pg_roles where rolname=current_user) or p.prosecdef or p.proconfig is distinct from array['search_path=""','default_transaction_isolation=repeatable read']::text[]))
 then raise exception 'installed_granted_publication_successor_required' using errcode='55000';end if;
end;$$;
