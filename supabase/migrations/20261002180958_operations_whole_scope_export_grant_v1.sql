-- Default-off metadata grant writer. No signing, source export, delivery,
-- product NULL-column change, Finance admission or official financial writes.
create schema operations_whole_scope_export_grant_private;
revoke all on schema operations_whole_scope_export_grant_private from public,anon,authenticated,service_role;
grant usage on schema operations_whole_scope_export_grant_private to authenticated,service_role;

-- Conservative bare identifier tokens cover quoted, unqualified and comment-
-- separated named callers. Literal mentions may fail closed; this is not a
-- SQL parser or dynamic/hosted caller certificate.
do $$begin
 if not exists(select 1 from pg_proc p where p.oid='operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure and p.proowner=(select oid from pg_roles where rolname=current_user) and p.prosecdef and p.proconfig=array['search_path=""']::text[])
 or not exists(select 1 from pg_proc p where p.oid='operations_economy_private.authorize_scope_read_nowait_v1()'::regprocedure and p.proowner=(select oid from pg_roles where rolname=current_user) and p.prosecdef and p.proconfig=array['search_path=""']::text[])
 or exists(select 1 from pg_proc p where p.prosrc~*'\mread_scope_invoice_kernel_compatible_v1\M' and p.oid<>all(array['public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,'operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure::oid]))
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 or not has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 then raise exception 'installed_grant_compatible_predecessor_required' using errcode='55000';end if;
end;$$;

create table operations_whole_scope_export_grant_private.gates(
 organization_id uuid not null,economic_scope_id uuid not null,enabled boolean not null default false,
 primary key(organization_id,economic_scope_id),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_export_grant_private.partners(
 partner_version uuid primary key default gen_random_uuid(),organization_id uuid not null,economic_scope_id uuid not null,
 destination_organization_id uuid not null,destination_scope_id uuid not null,
 purpose text not null default 'operations-whole-scope-product-source-read' check(purpose='operations-whole-scope-product-source-read'),
 enabled boolean not null default false,
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_export_grant_private.owners(
 organization_id uuid not null,economic_scope_id uuid not null,destination_organization_id uuid not null,destination_scope_id uuid not null,
 first_event_id uuid not null,
 primary key(organization_id,economic_scope_id),unique(destination_organization_id,destination_scope_id),
 unique(organization_id,economic_scope_id,destination_organization_id,destination_scope_id),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_export_grant_private.events(
 event_id uuid primary key,organization_id uuid not null,economic_scope_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),actor_id uuid not null,
 partner_version uuid not null references operations_whole_scope_export_grant_private.partners(partner_version),
 destination_organization_id uuid not null,destination_scope_id uuid not null,
 scope_snapshot_id uuid not null references public.operations_project_scope_snapshots(snapshot_id),
 composition_snapshot_id uuid not null references public.operations_scope_obligation_compositions(snapshot_id),
 idempotency_key text not null,command jsonb not null,command_fingerprint text not null check(command_fingerprint~'^[0-9a-f]{64}$'),
 document jsonb not null,raw_body text not null check(octet_length(raw_body)<=1048576),fingerprint text not null check(fingerprint~'^[0-9a-f]{64}$'),
 captured_evidence jsonb not null,source_evidence_fingerprint text not null check(source_evidence_fingerprint~'^[0-9a-f]{64}$'),
 unique(organization_id,economic_scope_id,revision),unique(organization_id,idempotency_key),
 unique(organization_id,economic_scope_id,event_id),
 foreign key(organization_id,economic_scope_id,destination_organization_id,destination_scope_id)
 references operations_whole_scope_export_grant_private.owners(organization_id,economic_scope_id,destination_organization_id,destination_scope_id)
 deferrable initially deferred
);
alter table operations_whole_scope_export_grant_private.owners add constraint grant_owner_first_saved_event
 foreign key(organization_id,economic_scope_id,first_event_id) references operations_whole_scope_export_grant_private.events(organization_id,economic_scope_id,event_id) deferrable initially deferred;
create table operations_whole_scope_export_grant_private.heads(
 organization_id uuid not null,economic_scope_id uuid not null,event_id uuid not null references operations_whole_scope_export_grant_private.events(event_id),
 revision bigint not null check(revision between 1 and 9007199254740991),fingerprint text not null check(fingerprint~'^[0-9a-f]{64}$'),
 primary key(organization_id,economic_scope_id),
 foreign key(organization_id,economic_scope_id) references operations_whole_scope_export_grant_private.owners(organization_id,economic_scope_id)
);
create table operations_whole_scope_export_grant_private.receipts(
 event_id uuid primary key references operations_whole_scope_export_grant_private.events(event_id),document jsonb not null
);

alter table operations_whole_scope_export_grant_private.gates enable row level security;
alter table operations_whole_scope_export_grant_private.partners enable row level security;
alter table operations_whole_scope_export_grant_private.owners enable row level security;
alter table operations_whole_scope_export_grant_private.events enable row level security;
alter table operations_whole_scope_export_grant_private.heads enable row level security;
alter table operations_whole_scope_export_grant_private.receipts enable row level security;
revoke all on all tables in schema operations_whole_scope_export_grant_private from public,anon,authenticated,service_role;
grant select,insert on operations_whole_scope_export_grant_private.gates,operations_whole_scope_export_grant_private.partners to service_role;
grant update(enabled) on operations_whole_scope_export_grant_private.gates,operations_whole_scope_export_grant_private.partners to service_role;

create function operations_whole_scope_export_grant_private.config_guard_v1() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op<>'UPDATE' or (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then raise exception 'immutable_grant_config_identity' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.config_guard_v1() from public,anon,authenticated,service_role;
create trigger grant_gate_identity before update or delete on operations_whole_scope_export_grant_private.gates for each row execute function operations_whole_scope_export_grant_private.config_guard_v1();
create trigger grant_partner_identity before update or delete on operations_whole_scope_export_grant_private.partners for each row execute function operations_whole_scope_export_grant_private.config_guard_v1();
create trigger grant_gate_no_truncate before truncate on operations_whole_scope_export_grant_private.gates for each statement execute function public.operations_personnel_evidence_immutable();
create trigger grant_partner_no_truncate before truncate on operations_whole_scope_export_grant_private.partners for each statement execute function public.operations_personnel_evidence_immutable();

-- SQL JSONB has already normalized lexical -0; raw endpoint parity is not claimed.
create function operations_whole_scope_export_grant_private.command_v1(p jsonb) returns jsonb
language plpgsql set search_path='' as $$declare k text;q jsonb:=p;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>16 or not(p ?& array['schema_version','economic_scope_id','partner_version','destination_organization_id','destination_scope_id','destination_mapping_id','destination_mapping_revision','destination_mapping_fingerprint','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_grant_revision','enabled','idempotency_key','reason'])
 or p->>'schema_version' is distinct from 'operations-whole-scope-product-export-grant-command.v1' or jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception 'exact_grant_command_required' using errcode='22023';end if;
 foreach k in array array['economic_scope_id','partner_version','destination_organization_id','destination_scope_id','destination_mapping_id'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_grant_identity' using errcode='22023';end if;
 q:=jsonb_set(q,array[k],to_jsonb((p->>k)::uuid::text));end loop;
 foreach k in array array['destination_mapping_revision','expected_scope_revision','expected_composition_revision','expected_grant_revision'] loop
 if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric)
 or (p->>k)::numeric not between (case when k='expected_grant_revision' then 0 else 1 end) and (case when k='expected_grant_revision' then 9007199254740990 else 9007199254740991 end) then raise exception 'invalid_grant_revision' using errcode='22023';end if;
 q:=jsonb_set(q,array[k],to_jsonb(((p->>k)::numeric)::bigint));end loop;
 foreach k in array array['destination_mapping_fingerprint','expected_membership_fingerprint','expected_composition_fingerprint'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{64}$' then raise exception 'invalid_grant_fingerprint' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3 then raise exception 'invalid_grant_audit' using errcode='22023';end if;
 if octet_length(operations_economy_private.canonical_json_v1(q))>16384 then raise exception 'grant_command_size_limit' using errcode='54000';end if;
 return q;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.command_v1(jsonb) from public,anon,authenticated,service_role;

create function operations_whole_scope_export_grant_private.event_guard_v1() returns trigger
language plpgsql set search_path='' as $$declare m public.operations_project_scope_snapshots%rowtype;c public.operations_scope_obligation_compositions%rowtype;expected jsonb;begin
 if tg_op<>'INSERT' then raise exception 'immutable_grant_event' using errcode='55000';end if;
 if new.idempotency_key is distinct from new.command->>'idempotency_key' then raise exception 'saved_grant_idempotency_required' using errcode='55000';end if;
 if not exists(select 1 from operations_whole_scope_export_grant_private.partners p where p.partner_version=new.partner_version and row(p.organization_id,p.economic_scope_id,p.destination_organization_id,p.destination_scope_id,p.purpose)=row(new.organization_id,new.economic_scope_id,new.destination_organization_id,new.destination_scope_id,'operations-whole-scope-product-source-read'::text)) then raise exception 'saved_grant_partner_identity_required' using errcode='55000';end if;
 if new.command is distinct from operations_whole_scope_export_grant_private.command_v1(new.command)
 or new.command_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-command-v1',new.command)),'UTF8')),'hex') then raise exception 'saved_normalized_grant_command_required' using errcode='55000';end if;
 select * into m from public.operations_project_scope_snapshots where snapshot_id=new.scope_snapshot_id and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id;
 if not found then raise exception 'saved_grant_scope_required' using errcode='55000';end if;
 select * into c from public.operations_scope_obligation_compositions where snapshot_id=new.composition_snapshot_id and organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and scope_snapshot_id=m.snapshot_id;
 if not found then raise exception 'saved_grant_composition_required' using errcode='55000';end if;
 if m.membership_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(m.membership),'UTF8')),'hex') then raise exception 'saved_grant_membership_hash_required' using errcode='55000';end if;
 if jsonb_typeof(new.document->'created_at') is distinct from 'string' or new.document->>'created_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
 or left(new.document->>'created_at',4)='0000'
 or to_char((new.document->>'created_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') is distinct from new.document->>'created_at' then raise exception 'server_grant_utc6_required' using errcode='55000';end if;
 expected:=jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-event.v1','event_id',new.event_id,'organization_id',new.organization_id,'economic_scope_id',new.economic_scope_id,'revision',new.revision,'enabled',new.command->'enabled','actor_id',new.actor_id,'created_at',new.document->'created_at','partner_version',new.partner_version,'destination_organization_id',new.destination_organization_id,'destination_scope_id',new.destination_scope_id,'destination_mapping_id',new.command->'destination_mapping_id','destination_mapping_revision',new.command->'destination_mapping_revision','destination_mapping_fingerprint',new.command->'destination_mapping_fingerprint','scope_snapshot_id',m.snapshot_id,'scope_revision',m.scope_revision,'membership_fingerprint',m.membership_fingerprint,'composition_snapshot_id',c.snapshot_id,'composition_revision',c.composition_revision,'composition_fingerprint',c.fingerprint,'full_membership',m.membership,'command',new.command,'command_fingerprint',new.command_fingerprint);
 if new.document is distinct from expected or new.raw_body is distinct from operations_economy_private.canonical_json_v1(expected)
 or new.fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-event-v1',expected)),'UTF8')),'hex')
 or new.revision<>(new.command->>'expected_grant_revision')::bigint+1
 or row(new.economic_scope_id,new.partner_version,new.destination_organization_id,new.destination_scope_id) is distinct from row((new.command->>'economic_scope_id')::uuid,(new.command->>'partner_version')::uuid,(new.command->>'destination_organization_id')::uuid,(new.command->>'destination_scope_id')::uuid)
 or m.scope_revision<>(new.command->>'expected_scope_revision')::bigint or m.membership_fingerprint<>new.command->>'expected_membership_fingerprint'
 or c.composition_revision<>(new.command->>'expected_composition_revision')::bigint or c.fingerprint<>new.command->>'expected_composition_fingerprint'
 then raise exception 'saved_matching_grant_event_required' using errcode='55000';end if;
 if jsonb_typeof(new.captured_evidence) is distinct from 'object'
 or new.captured_evidence->>'organization_id' is distinct from new.organization_id::text
 or new.captured_evidence->>'economic_scope_id' is distinct from new.economic_scope_id::text
 or new.captured_evidence->>'scope_snapshot_id' is distinct from m.snapshot_id::text
 or new.captured_evidence->>'composition_snapshot_id' is distinct from c.snapshot_id::text
 or octet_length(operations_economy_private.canonical_json_v1(new.captured_evidence))>4194304
 or new.source_evidence_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',new.captured_evidence)),'UTF8')),'hex') then raise exception 'actual_grant_capture_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.event_guard_v1() from public,anon,authenticated,service_role;
create trigger grant_event_guard before insert or update or delete on operations_whole_scope_export_grant_private.events for each row execute function operations_whole_scope_export_grant_private.event_guard_v1();
create trigger grant_event_no_truncate before truncate on operations_whole_scope_export_grant_private.events for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_export_grant_private.owner_first_event_v1() returns trigger
language plpgsql set search_path='' as $$begin
 if not exists(select 1 from operations_whole_scope_export_grant_private.events e where e.event_id=new.first_event_id and e.organization_id=new.organization_id and e.economic_scope_id=new.economic_scope_id and e.destination_organization_id=new.destination_organization_id and e.destination_scope_id=new.destination_scope_id and e.revision=1)
 then raise exception 'actual_first_grant_owner_event_required' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.owner_first_event_v1() from public,anon,authenticated,service_role;
create constraint trigger grant_owner_saved_first_event after insert on operations_whole_scope_export_grant_private.owners deferrable initially deferred for each row execute function operations_whole_scope_export_grant_private.owner_first_event_v1();
create trigger grant_owner_immutable before update or delete on operations_whole_scope_export_grant_private.owners for each row execute function public.operations_personnel_evidence_immutable();
create trigger grant_owner_no_truncate before truncate on operations_whole_scope_export_grant_private.owners for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_export_grant_private.head_guard_v1() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (tg_op='INSERT' and new.revision<>1)
 or (tg_op='UPDATE' and (row(new.organization_id,new.economic_scope_id) is distinct from row(old.organization_id,old.economic_scope_id) or new.revision<>old.revision+1))
 then raise exception 'immutable_monotonic_grant_head' using errcode='55000';end if;
 if not exists(select 1 from operations_whole_scope_export_grant_private.events e join operations_whole_scope_export_grant_private.owners o using(organization_id,economic_scope_id) where e.event_id=new.event_id and e.organization_id=new.organization_id and e.economic_scope_id=new.economic_scope_id and e.revision=new.revision and e.fingerprint=new.fingerprint and row(e.destination_organization_id,e.destination_scope_id)=row(o.destination_organization_id,o.destination_scope_id)) then raise exception 'saved_matching_grant_head_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.head_guard_v1() from public,anon,authenticated,service_role;
create trigger grant_head_guard before insert or update or delete on operations_whole_scope_export_grant_private.heads for each row execute function operations_whole_scope_export_grant_private.head_guard_v1();
create trigger grant_head_no_truncate before truncate on operations_whole_scope_export_grant_private.heads for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_export_grant_private.receipt_guard_v1() returns trigger
language plpgsql set search_path='' as $$declare e operations_whole_scope_export_grant_private.events%rowtype;expected jsonb;begin
 if tg_op<>'INSERT' then raise exception 'immutable_grant_receipt' using errcode='55000';end if;
 select * into e from operations_whole_scope_export_grant_private.events where event_id=new.event_id;
 if not found then raise exception 'actual_grant_receipt_event_required' using errcode='55000';end if;
 expected:=jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',e.event_id,'economic_scope_id',e.economic_scope_id,'revision',e.revision,'fingerprint',e.fingerprint,'command_fingerprint',e.command_fingerprint,'enabled',e.command->'enabled','historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true);
 if new.document is distinct from expected then raise exception 'saved_matching_grant_receipt_required' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_whole_scope_export_grant_private.receipt_guard_v1() from public,anon,authenticated,service_role;
create trigger grant_receipt_guard before insert or update or delete on operations_whole_scope_export_grant_private.receipts for each row execute function operations_whole_scope_export_grant_private.receipt_guard_v1();
create trigger grant_receipt_no_truncate before truncate on operations_whole_scope_export_grant_private.receipts for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_whole_scope_export_grant_private.write_v1(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 q jsonb;org uuid;actor uuid:=auth.uid();scope_id uuid;destination_org uuid;destination_scope uuid;
 partner operations_whole_scope_export_grant_private.partners%rowtype;
 prior operations_whole_scope_export_grant_private.events%rowtype;
 prior_found boolean;head operations_whole_scope_export_grant_private.heads%rowtype;head_found boolean;
 current_event operations_whole_scope_export_grant_private.events%rowtype;
 owner operations_whole_scope_export_grant_private.owners%rowtype;owner_found boolean;
 membership public.operations_project_scope_snapshots%rowtype;
 composition public.operations_scope_obligation_compositions%rowtype;
 projects uuid[];rechecked uuid[];captured_projects uuid[];project uuid;
 request jsonb;captured jsonb;receipt jsonb;actual_receipt jsonb;doc jsonb;
 expected bigint;new_revision bigint;new_event uuid;command_fp text;event_fp text;source_fp text;raw_event text;message text;
begin
 if current_setting('transaction_isolation') not in ('repeatable read','serializable') then raise exception 'coherent_grant_transaction_required' using errcode='55000';end if;
 q:=operations_whole_scope_export_grant_private.command_v1(p_command);
 org:=operations_economy_private.authorize_scope_read_nowait_v1();scope_id:=(q->>'economic_scope_id')::uuid;
 destination_org:=(q->>'destination_organization_id')::uuid;destination_scope:=(q->>'destination_scope_id')::uuid;
 perform 1 from operations_whole_scope_export_grant_private.gates where organization_id=org and economic_scope_id=scope_id and enabled for share nowait;
 if not found then raise exception 'grant_write_gate_disabled' using errcode='42501';end if;
 select * into prior from operations_whole_scope_export_grant_private.events where organization_id=org and idempotency_key=q->>'idempotency_key';prior_found:=found;
 if prior_found and (prior.command is distinct from q or prior.actor_id is distinct from actor) then raise exception 'grant_idempotency_conflict' using errcode='23505';end if;
 select * into partner from operations_whole_scope_export_grant_private.partners where partner_version=(q->>'partner_version')::uuid for share nowait;
 if not found or row(partner.organization_id,partner.economic_scope_id,partner.destination_organization_id,partner.destination_scope_id,partner.purpose) is distinct from row(org,scope_id,destination_org,destination_scope,'operations-whole-scope-product-source-read'::text) then raise exception 'matching_grant_partner_required' using errcode='42501';end if;
 -- These immutable rows are only hints. A historical command authorizes no old graph.
 if prior_found then
 select m.* into membership from public.operations_project_scope_heads h join public.operations_project_scope_snapshots m on m.organization_id=h.organization_id and m.economic_scope_id=h.economic_scope_id and m.scope_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope_id;
 if not found then raise exception 'current_grant_scope_required' using errcode='PT409';end if;
 select c.* into composition from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope_id;
 else
 select * into membership from public.operations_project_scope_snapshots where organization_id=org and economic_scope_id=scope_id and scope_revision=(q->>'expected_scope_revision')::bigint and membership_fingerprint=q->>'expected_membership_fingerprint';
 if not found then raise exception 'current_grant_scope_required' using errcode='PT409';end if;
 select * into composition from public.operations_scope_obligation_compositions where organization_id=org and economic_scope_id=scope_id and composition_revision=(q->>'expected_composition_revision')::bigint and fingerprint=q->>'expected_composition_fingerprint';
 end if;
 if not found or composition.scope_snapshot_id is distinct from membership.snapshot_id then raise exception 'current_grant_composition_required' using errcode='PT409';end if;
 if jsonb_typeof(membership.membership->'source_project_ids') is distinct from 'array' or jsonb_array_length(membership.membership->'source_project_ids')>1000 then raise exception 'grant_project_union_limit' using errcode='22023';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into projects from (
 select value::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids')
 union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if cardinality(projects)>1000 then raise exception 'grant_project_union_limit' using errcode='22023';end if;
 foreach project in array projects loop
 perform 1 from public.projects where id=project and organization_id=org and deleted_at is null for share nowait;
 if not found then raise exception 'grant_full_member_permission_denied' using errcode='42501';end if;end loop;
 perform operations_economy_private.lock_scope_read_root_nowait_v1(org,membership.membership->>'root_kind',(membership.membership->>'root_id')::uuid);
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0)) or not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0)) then raise exception 'grant_write_lock_busy' using errcode='55P03';end if;
 -- Exact compact purpose tuple; permanent destination ownership excludes partner versions.
 if not pg_try_advisory_xact_lock(hashtextextended(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-destination-owner-v1',destination_org::text,destination_scope::text)),0)) then raise exception 'grant_destination_owner_busy' using errcode='55P03';end if;
 select * into owner from operations_whole_scope_export_grant_private.owners where organization_id=org and economic_scope_id=scope_id;owner_found:=found;
 if owner_found and row(owner.destination_organization_id,owner.destination_scope_id) is distinct from row(destination_org,destination_scope) then raise exception 'grant_source_permanent_owner_conflict' using errcode='23505';end if;
 if exists(select 1 from operations_whole_scope_export_grant_private.owners o where o.destination_organization_id=destination_org and o.destination_scope_id=destination_scope and row(o.organization_id,o.economic_scope_id) is distinct from row(org,scope_id)) then raise exception 'grant_destination_permanent_owner_conflict' using errcode='23505';end if;
 select * into head from operations_whole_scope_export_grant_private.heads where organization_id=org and economic_scope_id=scope_id for update nowait;head_found:=found;
 if head_found then
 select * into current_event from operations_whole_scope_export_grant_private.events where event_id=head.event_id and organization_id=org and economic_scope_id=scope_id and revision=head.revision and fingerprint=head.fingerprint;
 if not found or not owner_found or row(current_event.destination_organization_id,current_event.destination_scope_id) is distinct from row(owner.destination_organization_id,owner.destination_scope_id) then raise exception 'saved_current_grant_head_required' using errcode='55000';end if;
 select document into actual_receipt from operations_whole_scope_export_grant_private.receipts where event_id=current_event.event_id;
 if not found or actual_receipt is distinct from jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',current_event.event_id,'economic_scope_id',scope_id,'revision',current_event.revision,'fingerprint',current_event.fingerprint,'command_fingerprint',current_event.command_fingerprint,'enabled',current_event.command->'enabled','historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true) then raise exception 'saved_current_grant_receipt_required' using errcode='55000';end if;
 elsif owner_found or exists(select 1 from operations_whole_scope_export_grant_private.events where organization_id=org and economic_scope_id=scope_id) then raise exception 'saved_current_grant_head_required' using errcode='55000';end if;
 -- The disabled-partner exception is checked against the locked actual head, never an earlier hint.
 if not prior_found and not partner.enabled and ((q->>'enabled')::boolean or not head_found or current_event.partner_version is distinct from partner.partner_version or row(current_event.destination_organization_id,current_event.destination_scope_id) is distinct from row(destination_org,destination_scope)) then raise exception 'enabled_grant_partner_required' using errcode='42501';end if;
 perform 1 from public.operations_project_scope_heads where organization_id=org and economic_scope_id=scope_id and current_revision=membership.scope_revision and root_kind=membership.membership->>'root_kind' and root_id=(membership.membership->>'root_id')::uuid for share nowait;
 if not found then raise exception 'current_grant_scope_required' using errcode='PT409';end if;
 perform 1 from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope_id and current_revision=composition.composition_revision for share nowait;
 if not found then raise exception 'current_grant_composition_required' using errcode='PT409';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into rechecked from (
 select value::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids')
 union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if rechecked is distinct from projects then raise exception 'grant_permission_set_changed' using errcode='PT409';end if;
 expected:=(q->>'expected_grant_revision')::bigint;
 if not prior_found and coalesce(head.revision,0)<>expected then raise exception 'grant_revision_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id',org,'economic_scope_id',scope_id,'expected_scope_revision',membership.scope_revision,'expected_membership_fingerprint',membership.membership_fingerprint,'expected_composition_revision',composition.composition_revision,'expected_composition_fingerprint',composition.fingerprint);
 begin captured:=operations_economy_private.read_scope_invoice_kernel_compatible_v1(request);
 exception when sqlstate '22023' then get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required') then raise exception 'grant_source_changed' using errcode='PT409';end if;raise;end;
 select coalesce(array_agg(distinct (value->>'project_id')::uuid order by (value->>'project_id')::uuid),'{}'::uuid[]) into captured_projects from jsonb_array_elements(captured->'members');
 if not captured_projects<@projects then raise exception 'grant_permission_set_changed' using errcode='PT409';end if;
 if prior_found then
 if not head_found or not owner_found or head.revision<prior.revision or row(prior.destination_organization_id,prior.destination_scope_id) is distinct from row(owner.destination_organization_id,owner.destination_scope_id) then raise exception 'saved_historical_grant_lineage_required' using errcode='55000';end if;
 select document into receipt from operations_whole_scope_export_grant_private.receipts where event_id=prior.event_id;
 if not found or receipt is distinct from jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',prior.event_id,'economic_scope_id',scope_id,'revision',prior.revision,'fingerprint',prior.fingerprint,'command_fingerprint',prior.command_fingerprint,'enabled',prior.command->'enabled','historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true) then raise exception 'saved_historical_grant_receipt_required' using errcode='55000';end if;
 return receipt||jsonb_build_object('outcome','replayed','historical_only',true);
 end if;
 new_event:=gen_random_uuid();new_revision:=expected+1;
 command_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-command-v1',q)),'UTF8')),'hex');
 doc:=jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-event.v1','event_id',new_event,'organization_id',org,'economic_scope_id',scope_id,'revision',new_revision,'enabled',q->'enabled','actor_id',actor,'created_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'partner_version',partner.partner_version,'destination_organization_id',destination_org,'destination_scope_id',destination_scope,'destination_mapping_id',q->'destination_mapping_id','destination_mapping_revision',q->'destination_mapping_revision','destination_mapping_fingerprint',q->'destination_mapping_fingerprint','scope_snapshot_id',membership.snapshot_id,'scope_revision',membership.scope_revision,'membership_fingerprint',membership.membership_fingerprint,'composition_snapshot_id',composition.snapshot_id,'composition_revision',composition.composition_revision,'composition_fingerprint',composition.fingerprint,'full_membership',membership.membership,'command',q,'command_fingerprint',command_fp);
 raw_event:=operations_economy_private.canonical_json_v1(doc);
 if octet_length(raw_event)>1048576 or octet_length(operations_economy_private.canonical_json_v1(captured))>4194304 then raise exception 'grant_event_size_limit' using errcode='54000';end if;
 event_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-event-v1',doc)),'UTF8')),'hex');
 source_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',captured)),'UTF8')),'hex');
 if not owner_found then insert into operations_whole_scope_export_grant_private.owners values(org,scope_id,destination_org,destination_scope,new_event);end if;
 insert into operations_whole_scope_export_grant_private.events values(new_event,org,scope_id,new_revision,actor,partner.partner_version,destination_org,destination_scope,membership.snapshot_id,composition.snapshot_id,q->>'idempotency_key',q,command_fp,doc,raw_event,event_fp,captured,source_fp);
 receipt:=jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-receipt.v1','outcome','accepted','event_id',new_event,'economic_scope_id',scope_id,'revision',new_revision,'fingerprint',event_fp,'command_fingerprint',command_fp,'enabled',q->'enabled','historical_only',false,'export_state','blocked_missing_export_writer','shadow_only',true);
 insert into operations_whole_scope_export_grant_private.receipts values(new_event,receipt);
 if not head_found then insert into operations_whole_scope_export_grant_private.heads values(org,scope_id,new_event,new_revision,event_fp);
 else
 update operations_whole_scope_export_grant_private.heads h set event_id=new_event,revision=new_revision,fingerprint=event_fp where h.organization_id=org and h.economic_scope_id=scope_id and row(h.event_id,h.revision,h.fingerprint)=row(head.event_id,head.revision,head.fingerprint);
 if not found then raise exception 'grant_revision_changed' using errcode='PT409';end if;
 end if;
 return receipt;
exception when lock_not_available then raise exception 'grant_write_lock_busy' using errcode='55P03';
end;$$;
revoke all on function operations_whole_scope_export_grant_private.write_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_whole_scope_export_grant_private.write_v1(jsonb) to authenticated;
create function public.write_operations_whole_scope_product_export_grant_v1(p_command jsonb) returns jsonb
language sql security invoker set search_path='' set default_transaction_isolation='repeatable read'
as $$select operations_whole_scope_export_grant_private.write_v1(p_command);$$;
revoke all on function public.write_operations_whole_scope_product_export_grant_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.write_operations_whole_scope_product_export_grant_v1(jsonb) to authenticated;

-- Exact installed successor and direct-role boundary; no global dynamic certificate.
do $$declare entry oid:='operations_whole_scope_export_grant_private.write_v1(jsonb)'::regprocedure;
 wrapper oid:='public.write_operations_whole_scope_product_export_grant_v1(jsonb)'::regprocedure;begin
 if exists(select 1 from pg_proc p where p.prosrc~*'\mread_scope_invoice_kernel_compatible_v1\M' and p.oid<>all(array[entry,'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,'operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure::oid]))
 or exists(select 1 from pg_proc p where p.prosrc~*'\mwrite_v1\M' and p.oid<>wrapper)
 then raise exception 'installed_grant_static_successor_required' using errcode='55000';end if;
 if not exists(select 1 from pg_proc p where p.oid=entry and p.proowner=(select oid from pg_roles where rolname=current_user) and p.prosecdef and p.proconfig=array['search_path=""']::text[])
 or not exists(select 1 from pg_proc p where p.oid=wrapper and p.proowner=(select oid from pg_roles where rolname=current_user) and not p.prosecdef and p.proconfig=array['search_path=""','default_transaction_isolation=repeatable read']::text[])
 or not has_function_privilege('authenticated',entry,'EXECUTE') or not has_function_privilege('authenticated',wrapper,'EXECUTE')
 or has_function_privilege('service_role',entry,'EXECUTE') or has_function_privilege('service_role',wrapper,'EXECUTE') or has_function_privilege('anon',entry,'EXECUTE') or has_function_privilege('anon',wrapper,'EXECUTE')
 or has_schema_privilege('anon','operations_whole_scope_export_grant_private','USAGE')
 then raise exception 'installed_grant_owner_roles_required' using errcode='55000';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_whole_scope_export_grant_private' and p.oid<>entry
 and (p.proowner<>(select oid from pg_roles where rolname=current_user) or p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[] or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE')))
 or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='operations_whole_scope_export_grant_private' and c.relkind='r'
 and (not c.relrowsecurity or c.relowner<>(select oid from pg_roles where rolname=current_user) or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 or (c.relname not in ('gates','partners') and has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))))
 then raise exception 'installed_grant_private_ledger_acl_required' using errcode='55000';end if;
end;$$;
