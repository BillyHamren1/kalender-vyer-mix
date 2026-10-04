-- Compatible legacy observed-row reads only. No publication/cost/gate mutation.
-- Known TRY/NOWAIT admission plus PUBLIC-wrapper100ms PER-lock fallback.
-- No universal no-wait/whole-request100ms/full graph snapshot authority.
begin;
do $preflight$
declare expected record; actual pg_catalog.pg_proc%rowtype;
begin
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'7bf2d63d4737456e7dd774525a732fb863acdbd642343e2bd6f1a4bc19df0fe8'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_scope_obligation_drilldown_v1(jsonb)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'ff9f6d8d26d0d18262bb5779ceaf0a11736247009dbb7afc8920b771361f40a1'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_scope_composition_v1(uuid,uuid)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'d25fe80ff72562ee233ba7b7c76b5ae3501ccae996836275988c4fb95efe3155'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_invoice_obligation_kernel_v1(jsonb)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'b140f9a15f7110470b8e8889ed3af97cda997ad0217d944a200339c18bc3690b'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'264637564cfd61dcc5aeea5eedfa6b8de3bb2a190aa235f78fef5e64f1b3fe6f'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
 select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text)');
 if not found or not actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
 or actual.proconfig is distinct from array['search_path=""']
 or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>'0e39ef61c8d94b31876a1e61e8b44b7da5e4a0fe7cc118e123d6ab8c8ca045ac'
 then raise exception 'remaining_reader_original_core_changed' using errcode='55000';end if;
end;
$preflight$;
-- Fail closed on changed/unknown lexical named callers before any routing.
-- Match the six exact tokens regardless qualifier/quote/call punctuation.
-- Legal SQL comments may separate a function identifier from its parentheses.
-- Metadata/string literal mentions may conservatively fail closed; this is not
-- a parser or exhaustive extension/outside-language/dynamic dispatcher proof.
-- Privileged generated/dynamic dispatcher reachability and real hired-owner
-- execution remain native gates; this lexical installed guard does not prove them.
do $callers$
declare known jsonb:='{"public.read_operations_obligation_original_v1(uuid,uuid,uuid,text)":{"body_sha256":"385b7f901cbc6d39255c8b319ba8d7d272f196057c72baeb62a8587a7d7cad84","security_definer":false},"operations_economy_private.append_source_policy_v1(jsonb)":{"body_sha256":"c12e665c248a092401c106fb7f56dd7992090fd8d691bf17cbe16bb672a97772","security_definer":true},"operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text)":{"body_sha256":"0e39ef61c8d94b31876a1e61e8b44b7da5e4a0fe7cc118e123d6ab8c8ca045ac","security_definer":true},"public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text)":{"body_sha256":"46ebaf260f22a48c723979e4f8bd3296cef67ba6afc5ca468c7959d32da391fc","security_definer":false},"operations_economy_private.compose_scope_obligations_v1(jsonb)":{"body_sha256":"bc474279d8974274581489326fd817589dce04ec4078e3e24039ad5c0d488453","security_definer":true},"operations_economy_private.read_scope_composition_v1(uuid,uuid)":{"body_sha256":"d25fe80ff72562ee233ba7b7c76b5ae3501ccae996836275988c4fb95efe3155","security_definer":true},"public.read_operations_scope_obligation_composition_v1(uuid,uuid)":{"body_sha256":"7d6ca6624b2a335de652f3974c6006a5a13682e542e7d0d31885eee2725f012b","security_definer":false},"operations_economy_private.credit_assignment_source_proof_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint)":{"body_sha256":"557fe2bf5be7625598d53c21d31da71046a5d1fa18ed6b4f5e42e39f3bef4ef9","security_definer":true},"operations_economy_private.credit_capacity_source_v1(uuid,uuid,uuid,uuid)":{"body_sha256":"48bfea3ca307858daedce61e07516768f8bfc351f1b89fabca17aa09ed38c89c","security_definer":true},"operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid)":{"body_sha256":"7bf2d63d4737456e7dd774525a732fb863acdbd642343e2bd6f1a4bc19df0fe8","security_definer":true},"public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid)":{"body_sha256":"bfb41d93c6bb8417e070944c06d8c9847a08dbb30774e72bc4653bc636010aae","security_definer":false},"operations_economy_private.read_invoice_obligation_kernel_v1(jsonb)":{"body_sha256":"b140f9a15f7110470b8e8889ed3af97cda997ad0217d944a200339c18bc3690b","security_definer":true},"public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb)":{"body_sha256":"2a08546b3c241a2232db7d34ba2a8ba46426f1df45e671e94c3e74f7407eb7b0","security_definer":false},"operations_economy_private.read_scope_invoice_kernel_v1(jsonb)":{"body_sha256":"fd2bc4404b341884724165c9cad2e006a25d268e48a020a5462c33ac83dce786","security_definer":true},"operations_economy_private.read_scope_obligation_drilldown_v1(jsonb)":{"body_sha256":"ff9f6d8d26d0d18262bb5779ceaf0a11736247009dbb7afc8920b771361f40a1","security_definer":true},"public.read_operations_scope_obligation_drilldown_v1(jsonb)":{"body_sha256":"17d13af929281c11293d3d3adc0e6c739557c5b71bb9afc165830dd43d17a640","security_definer":false},"operations_hired_private.invoice_evidence_v1(uuid,uuid,uuid,uuid)":{"body_sha256":"136a9e7605f02ef1d26b330e0924d29f5c9a78e37fda952bbf9d14493259f0d1","security_definer":false}}'::jsonb;row record;signature text;expected jsonb;begin
 for row in select p.*,n.nspname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.prosrc ~* '\m(read_scope_obligation_evidence_v1|read_scope_obligation_drilldown_v1|read_scope_composition_v1|read_invoice_obligation_kernel_v1|read_obligation_original_v1|read_source_policy_v1)\M' loop
  signature:=row.nspname||'.'||row.proname||'('||replace(pg_catalog.oidvectortypes(row.proargtypes),', ',',')||')';
  expected:=known->signature;
  if expected is null or row.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
   or row.prosecdef is distinct from (expected->>'security_definer')::boolean
   or row.proconfig is distinct from array['search_path=""']
   or encode(pg_catalog.sha256(convert_to(row.prosrc,'UTF8')),'hex') is distinct from expected->>'body_sha256'
  then raise exception 'remaining_reader_installed_caller_changed' using errcode='55000';end if;
 end loop;
end;$callers$;

-- All six original public wrappers must be present and unchanged, with their
-- actual invoker roles/argument names. Optional named-caller matching alone is
-- insufficient to authorize installing a replacement over a missing API.
do $public_preflight$
declare expected jsonb;actual pg_catalog.pg_proc%rowtype;role_name text;begin
 for expected in select value from jsonb_array_elements('[{"signature":"public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid)","body_sha256":"bfb41d93c6bb8417e070944c06d8c9847a08dbb30774e72bc4653bc636010aae","allowed_role":"authenticated","argument_names":["p_organization_id","p_root_kind","p_root_id"]},{"signature":"public.read_operations_scope_obligation_drilldown_v1(jsonb)","body_sha256":"17d13af929281c11293d3d3adc0e6c739557c5b71bb9afc165830dd43d17a640","allowed_role":"authenticated","argument_names":["p_request"]},{"signature":"public.read_operations_scope_obligation_composition_v1(uuid,uuid)","body_sha256":"7d6ca6624b2a335de652f3974c6006a5a13682e542e7d0d31885eee2725f012b","allowed_role":"service_role","argument_names":["p_organization_id","p_economic_scope_id"]},{"signature":"public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb)","body_sha256":"2a08546b3c241a2232db7d34ba2a8ba46426f1df45e671e94c3e74f7407eb7b0","allowed_role":"service_role","argument_names":["p_request"]},{"signature":"public.read_operations_obligation_original_v1(uuid,uuid,uuid,text)","body_sha256":"385b7f901cbc6d39255c8b319ba8d7d272f196057c72baeb62a8587a7d7cad84","allowed_role":"service_role","argument_names":["p_organization_id","p_project_id","p_obligation_id","p_source_anchor"]},{"signature":"public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text)","body_sha256":"46ebaf260f22a48c723979e4f8bd3296cef67ba6afc5ca468c7959d32da391fc","allowed_role":"service_role","argument_names":["p_organization_id","p_project_id","p_obligation_id","p_source_anchor"]}]'::jsonb) loop
  select * into actual from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(expected->>'signature');
  if not found or actual.prosecdef or actual.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
   or actual.prorettype<>'jsonb'::regtype or actual.proconfig is distinct from array['search_path=""']
   or to_jsonb(actual.proargnames) is distinct from expected->'argument_names'
   or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex') is distinct from expected->>'body_sha256'
  then raise exception 'remaining_reader_original_public_changed' using errcode='55000';end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if pg_catalog.has_function_privilege(role_name,actual.oid,'execute') is distinct from (role_name=expected->>'allowed_role')
   then raise exception 'remaining_reader_original_public_acl_changed' using errcode='55000';end if;
  end loop;
 end loop;
end;$public_preflight$;

-- Installed user SQL/plpgsql dynamic EXECUTE is audited separately, including
-- SECURITY INVOKER routines that can execute under a definer's effective owner.
-- Match the bare EXECUTE token, including legal comment interposition; literal
-- mentions may conservatively fail closed. Exact fixed-column phase SQL does
-- not dispatch a caller-selected reader.
-- Extension/system/temp/outside-language functions are excluded here: full
-- installed/native privilege certification remains an explicit release gate.
do $dynamic_preflight$
declare row record;signature text;begin
 for row in select p.*,n.nspname,l.lanname from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_language l on l.oid=p.prolang
  where n.nspname<>'pg_catalog' and n.nspname<>'information_schema' and n.nspname not like 'pg\_%' escape '\'
   and l.lanname in('sql','plpgsql') and p.prosrc ~* '\mexecute\M'
   and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
  signature:=row.nspname||'.'||row.proname||'('||replace(pg_catalog.oidvectortypes(row.proargtypes),', ',',')||')';
  if signature<>'public.sync_all_phase_times()' or not row.prosecdef
   or row.proconfig is distinct from array['search_path=public']
   or row.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
   or encode(pg_catalog.sha256(convert_to(row.prosrc,'UTF8')),'hex')<>'1fdf1c10a25d5a222480d447aeeb83187e9ca471ffb4a21ee51a3f8ca6d3384d'
  then raise exception 'remaining_reader_installed_dynamic_changed' using errcode='55000';end if;
 end loop;
end;$dynamic_preflight$;

create schema operations_remaining_reader_private;
revoke all on schema operations_remaining_reader_private from public,anon,authenticated,service_role;
grant usage on schema operations_remaining_reader_private to authenticated,service_role;

create function operations_remaining_reader_private.try_org_v1(p_org uuid,p_scope boolean)
returns void language plpgsql security definer set search_path='' as $body$
begin
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('obligation-org:'||p_org,0))
 then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';end if;
 if p_scope and not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('operations-economic-scope:'||p_org,0))
 then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';end if;
end;$body$;

create function operations_remaining_reader_private.actor_v1()
returns uuid language plpgsql security definer set search_path='' as $body$
declare actor uuid:=auth.uid();org uuid;begin
 if actor is null then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 perform 1 from auth.users where id=actor for share nowait;
 if not found then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 begin select organization_id into strict org from public.profiles where user_id=actor for share nowait;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_scope_admin_profile_required' using errcode='42501';end;
 if org is null then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=actor and organization_id=org and role='admin' for share nowait;
 if not found then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 return org;
end;$body$;

create function operations_remaining_reader_private.root_v1(p_org uuid,p_kind text,p_root uuid,p_parent boolean)
returns void language plpgsql security definer set search_path='' as $body$
begin
 if p_org is null or p_root is null or p_kind is null or p_kind not in('project','large_project','packing_project')
 then raise exception 'invalid_scope_root' using errcode='22023';end if;
 if p_kind='project' then perform 1 from public.projects where id=p_root and organization_id=p_org and deleted_at is null for share nowait;
 elsif p_kind='large_project' then perform 1 from public.large_projects where id=p_root and organization_id=p_org and deleted_at is null for share nowait;
 else perform 1 from public.packing_projects where id=p_root and organization_id=p_org for share nowait;end if;
 if not found then
  if p_parent then raise exception 'scope_evidence_root_denied' using errcode='42501';
  else raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 end if;
 if p_kind='packing_project' then
  perform 1 from public.operations_project_scope_packing_policies policy join public.packing_projects packing
   on packing.id=p_root and packing.organization_id=p_org and packing.status=policy.status
   where policy.organization_id=p_org and policy.enabled for share of policy nowait;
  if not found then
   if p_parent then raise exception 'scope_evidence_packing_denied' using errcode='42501';
   else raise exception 'scope_packing_missing_or_unenrolled' using errcode='42501';end if;
  end if;
 end if;
end;$body$;

create function operations_remaining_reader_private.sources_v1(p_org uuid,p_sources jsonb)
returns void language plpgsql security definer set search_path='' as $body$
declare key text;begin
 -- Owner-only selectors are actual immutable/current binding UUID columns.
 -- Supports composition's10,000 anchors; never reuses kernel's100 cap.
 for key in select x.key from (select distinct 'invoice-economic-source-v1:'||p_org||':'||(value->>'source_organization_id')::uuid||':'||(value->>'invoice_id')::uuid as key
  from jsonb_array_elements(p_sources)) x order by x.key collate "C"
 loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(key,0))
  then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';end if;
 end loop;
end;$body$;

create function operations_remaining_reader_private.original_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text,p_policy boolean)
returns boolean language plpgsql security definer set search_path='' as $body$
declare h public.operations_project_obligation_heads%rowtype;b public.operations_project_obligation_baselines%rowtype;
 binding public.operations_project_obligation_invoice_bindings%rowtype;s public.operations_finance_invoice_snapshots%rowtype;
 current_revision bigint;a jsonb;begin
 perform 1 from public.projects where id=p_project and organization_id=p_org and deleted_at is null for share nowait;
 if not found then raise exception 'obligation_original_project_denied' using errcode='42501';end if;
 select * into h from public.operations_project_obligation_heads where organization_id=p_org and project_id=p_project and obligation_id=p_obligation for share nowait;
 if not found or h.cost_basis<>'invoice' then return false;end if;
 select * into binding from public.operations_project_obligation_invoice_bindings where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor order by binding_sequence desc limit 1;
 if not found then return false;end if;
 select * into b from public.operations_project_obligation_baselines where organization_id=p_org and obligation_id=p_obligation and revision=h.current_revision;
 if b.event_id is distinct from binding.baseline_event_id then return false;end if;
 perform operations_remaining_reader_private.sources_v1(p_org,jsonb_build_array(jsonb_build_object('source_organization_id',binding.source_organization_id,'invoice_id',binding.invoice_id)));
 select st.current_revision into current_revision from public.operations_finance_invoice_streams st
  where st.organization_id=p_org and st.source_organization_id=binding.source_organization_id and st.invoice_id=binding.invoice_id for share nowait;
 if current_revision is distinct from binding.source_economic_revision then return false;end if;
 select * into s from public.operations_finance_invoice_snapshots where id=binding.source_snapshot_id;
 if not found or s.source_publication_fingerprint is distinct from binding.source_economic_fingerprint or s.body_sha256 is distinct from binding.source_raw_body_sha256 then return false;end if;
 select value into a from jsonb_array_elements(s.envelope->'allocations') where (value->>'allocation_id')::uuid=binding.source_allocation_id;
 if a is null or a->>'status' not in('preliminary','confirmed') or (a->>'amount_minor')::bigint is distinct from binding.amount_minor or (a->>'destination_project_id')::uuid is distinct from p_project then return false;end if;
 if p_policy then perform 1 from public.operations_obligation_source_policy_heads
  where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor for share nowait;end if;
 return true;
end;$body$;

create function operations_remaining_reader_private.references_v1(p_org uuid,p_baselines jsonb,p_references jsonb)
returns void language plpgsql security definer set search_path='' as $body$
declare row jsonb;selectors jsonb;begin
 for row in select value from jsonb_array_elements(p_baselines) loop
  perform 1 from public.operations_project_obligation_heads h where h.organization_id=p_org and h.obligation_id=(row->>'obligation_id')::uuid
   and h.project_id=(row->>'project_id')::uuid and h.current_revision=(row->>'baseline_revision')::bigint for share nowait;
 end loop;
 -- Admit ALL referenced source keys before ANY original-source protocol head.
 -- A changed/absent binding remains ordinary unresolved evidence, not fake0.
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',b.source_organization_id,'invoice_id',b.invoice_id)),'[]') into selectors
 from jsonb_array_elements(p_references) r cross join lateral
 (select source_organization_id,invoice_id from public.operations_project_obligation_invoice_bindings
  where organization_id=p_org and project_id=(r.value->>'project_id')::uuid and obligation_id=(r.value->>'obligation_id')::uuid
   and source_anchor=r.value->>'source_anchor' order by binding_sequence desc limit 1) b
 join public.operations_project_obligation_heads h on h.organization_id=p_org and h.project_id=(r.value->>'project_id')::uuid and h.obligation_id=(r.value->>'obligation_id')::uuid and h.cost_basis='invoice'
 join public.operations_project_obligation_baselines base on base.organization_id=h.organization_id and base.obligation_id=h.obligation_id and base.revision=h.current_revision
 where base.event_id=(select baseline_event_id from public.operations_project_obligation_invoice_bindings binding where binding.organization_id=p_org and binding.project_id=h.project_id and binding.obligation_id=h.obligation_id and binding.source_anchor=r.value->>'source_anchor' order by binding.binding_sequence desc limit 1);
 perform operations_remaining_reader_private.sources_v1(p_org,selectors);
 for row in select value from jsonb_array_elements(p_references) loop
  perform operations_remaining_reader_private.original_v1(p_org,(row->>'project_id')::uuid,(row->>'obligation_id')::uuid,row->>'source_anchor',true);
 end loop;
end;$body$;

create function operations_remaining_reader_private.kernel_v1(p jsonb)
returns void language plpgsql security definer set search_path='' as $body$
declare org uuid:=(p->>'organization_id')::uuid;project uuid:=(p->>'project_id')::uuid;obligation uuid:=(p->>'obligation_id')::uuid;
 selectors jsonb;h public.operations_project_obligation_heads%rowtype;binding public.operations_project_obligation_invoice_bindings%rowtype;
 current_source public.operations_finance_invoice_economic_current_v2%rowtype;bound boolean;begin
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 if (select count(distinct source_anchor) from public.operations_project_obligation_invoice_bindings where organization_id=org and project_id=project and obligation_id=obligation)>10000
 then raise exception 'invoice_kernel_binding_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_organization_id,'invoice_id',x.invoice_id)),'[]') into selectors from
 (select distinct latest.source_organization_id,latest.invoice_id from
  (select distinct on(source_anchor) source_organization_id,invoice_id from public.operations_project_obligation_invoice_bindings
   where organization_id=org and project_id=project and obligation_id=obligation order by source_anchor,binding_sequence desc) latest) x;
 if jsonb_array_length(selectors)>100 then raise exception 'invoice_kernel_source_selector_limit' using errcode='22023';end if;
 perform operations_remaining_reader_private.sources_v1(org,selectors);
 perform 1 from public.projects where organization_id=org and id=project and deleted_at is null for share nowait;
 if not found then raise exception 'invoice_kernel_project_denied' using errcode='42501';end if;
 select * into h from public.operations_project_obligation_heads where organization_id=org and project_id=project and obligation_id=obligation for share nowait;
 if not found then raise exception 'actual_invoice_kernel_obligation_required' using errcode='22023';end if;
 if h.cost_basis<>'invoice' then return;end if;
 for binding in select distinct on(source_anchor) * from public.operations_project_obligation_invoice_bindings
  where organization_id=org and project_id=project and obligation_id=obligation order by source_anchor,binding_sequence desc loop
  perform 1 from public.operations_finance_invoice_streams where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id for share nowait;
  perform 1 from public.operations_finance_credit_v2_streams where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id for share nowait;
  bound:=operations_remaining_reader_private.original_v1(org,project,obligation,binding.source_anchor,false);
  select * into current_source from public.operations_finance_invoice_economic_current_v2
   where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id;
  if found and bound and current_source.source_currentness='saved_receiver_heads_only' and current_source.envelope is not null
   and current_source.source_economic_revision=binding.source_economic_revision and current_source.source_economic_fingerprint=binding.source_economic_fingerprint
  then perform 1 from public.operations_obligation_source_policy_heads
   where organization_id=org and project_id=project and obligation_id=obligation and source_anchor=binding.source_anchor for share nowait;end if;
 end loop;
end;$body$;

create function operations_remaining_reader_private.parent_entry_v1(p_org uuid,p_kind text,p_root uuid)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare org uuid;scope public.operations_project_scope_heads%rowtype;saved public.operations_scope_obligation_compositions%rowtype;head bigint;doc jsonb;begin
 org:=operations_remaining_reader_private.actor_v1();
 if p_org is distinct from org or p_root is null or p_kind is null or p_kind not in('project','large_project','packing_project')
 then raise exception 'scope_evidence_selector_denied' using errcode='42501';end if;
 perform operations_remaining_reader_private.try_org_v1(org,true);
 perform operations_remaining_reader_private.root_v1(org,p_kind,p_root,true);
 select * into scope from public.operations_project_scope_heads where organization_id=org and root_kind=p_kind and root_id=p_root for share nowait;
 if found then
  select current_revision into head from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope.economic_scope_id for share nowait;
  if found then
   select * into saved from public.operations_scope_obligation_compositions where organization_id=org and economic_scope_id=scope.economic_scope_id and composition_revision=head;
   if not found then raise exception 'scope_evidence_saved_capture_missing' using errcode='22023';end if;
 doc:=saved.document;
 if jsonb_typeof(doc->'baseline_events') is distinct from 'array' or jsonb_typeof(doc->'source_inventory') is distinct from 'array' then raise exception 'scope_evidence_saved_catalog_invalid' using errcode='22023';end if;
 if jsonb_array_length(doc->'baseline_events')>1000 or jsonb_array_length(doc->'source_inventory')>200 then raise exception 'scope_evidence_requires_pagination' using errcode='54000';end if;
 if doc->>'schema_version' is distinct from 'operations-scope-obligation-composition.v1' or doc->>'organization_id' is distinct from org::text
 or doc->>'economic_scope_id' is distinct from scope.economic_scope_id::text or doc->>'scope_revision' is distinct from saved.scope_revision::text
 or doc->>'composition_revision' is distinct from saved.composition_revision::text or doc->>'membership_fingerprint' is distinct from saved.membership_fingerprint
 or doc->>'currency' is distinct from saved.currency or doc->>'coverage' is distinct from 'unavailable' or doc->'eac_minor' is distinct from 'null'::jsonb or doc->'budget_minor' is distinct from 'null'::jsonb
 or encode(sha256(convert_to(operations_economy_private.canonical_json_v1(doc),'UTF8')),'hex') is distinct from saved.fingerprint then raise exception 'scope_evidence_saved_provenance_invalid' using errcode='22023';end if;

   perform operations_economy_private.scope_membership_v1(org,p_kind,p_root);
   perform operations_remaining_reader_private.references_v1(org,doc->'baseline_events',doc->'source_inventory');
  end if;
 end if;
 return operations_economy_private.read_scope_obligation_evidence_v1(p_org,p_kind,p_root);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

create function operations_remaining_reader_private.composition_entry_v1(p_org uuid,p_scope uuid)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare scope public.operations_project_scope_heads%rowtype;saved public.operations_scope_obligation_compositions%rowtype;head bigint;begin
 if p_org is null or p_scope is null then raise exception 'scope_composition_selector_required' using errcode='22023';end if;
 perform operations_remaining_reader_private.try_org_v1(p_org,true);
 select * into scope from public.operations_project_scope_heads where organization_id=p_org and economic_scope_id=p_scope for share nowait;
 if not found then raise exception 'scope_composition_tenant_denied' using errcode='42501';end if;
 perform operations_remaining_reader_private.root_v1(p_org,scope.root_kind,scope.root_id,false);
 perform operations_economy_private.scope_membership_v1(p_org,scope.root_kind,scope.root_id);
 select current_revision into head from public.operations_scope_obligation_composition_heads where organization_id=p_org and economic_scope_id=p_scope for share nowait;
 if found then
  select * into saved from public.operations_scope_obligation_compositions where organization_id=p_org and economic_scope_id=p_scope and composition_revision=head;
  if not found then raise exception 'saved_scope_composition_unavailable' using errcode='22023';end if;
  perform operations_remaining_reader_private.references_v1(p_org,saved.document->'baseline_events',saved.document->'source_inventory');
 end if;
 return operations_economy_private.read_scope_composition_v1(p_org,p_scope);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

create function operations_remaining_reader_private.drilldown_entry_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare org uuid; kind text; root uuid; key text; scope public.operations_project_scope_heads%rowtype;
 saved public.operations_scope_obligation_compositions%rowtype; captured jsonb; membership jsonb; proof jsonb;
 baseline public.operations_project_obligation_baselines%rowtype; current_baseline public.operations_project_obligation_baselines%rowtype;
 current_revision bigint; selectors jsonb; source jsonb; evidence jsonb; sources jsonb:='[]'; reply jsonb; state text;
 diagnostics jsonb:='["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable"]';
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>6
 or not(p ?& array['schema_version','root_kind','root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'])
 or p->>'schema_version' is distinct from 'operations-scope-obligation-drilldown-read.v1'
 or jsonb_typeof(p->'root_kind') is distinct from 'string' or p->>'root_kind' not in ('project','large_project','packing_project')
 then raise exception 'exact_scope_obligation_drilldown_request_required' using errcode='22023';end if;
 foreach key in array array['root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'invalid_scope_obligation_drilldown_identity' using errcode='22023';end if;end loop;
 org:=operations_remaining_reader_private.actor_v1();kind:=p->>'root_kind';root:=(p->>'root_id')::uuid;
 perform operations_remaining_reader_private.try_org_v1(org,true);
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 perform operations_remaining_reader_private.root_v1(org,kind,root,false);
 membership:=operations_economy_private.scope_membership_v1(org,kind,root);
 select * into scope from public.operations_project_scope_heads where organization_id=org and root_kind=kind and root_id=root for share nowait;
 if not found then raise exception 'displayed_scope_capture_changed' using errcode='PT409';end if;
 select c.* into saved from public.operations_scope_obligation_composition_heads h
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where h.organization_id=org and h.economic_scope_id=scope.economic_scope_id for share of h nowait;
 if not found or saved.snapshot_id is distinct from (p->>'expected_composition_snapshot_id')::uuid
 or saved.scope_revision is distinct from scope.current_revision
 or saved.membership_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(membership),'UTF8')),'hex')
 then raise exception 'displayed_scope_capture_changed' using errcode='PT409';end if;
 if jsonb_typeof(saved.document->'baseline_events') is distinct from 'array' or jsonb_array_length(saved.document->'baseline_events')>1000
 or jsonb_typeof(saved.document->'source_inventory') is distinct from 'array' or jsonb_array_length(saved.document->'source_inventory')>200
 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 if (select count(*) from jsonb_array_elements(saved.document->'baseline_events') b where b->>'obligation_id'=(p->>'obligation_id')::uuid::text
 and b->>'baseline_event_id'=(p->>'expected_baseline_event_id')::uuid::text)<>1 then
 raise exception 'displayed_obligation_capture_changed' using errcode='PT409';end if;
 select b into captured from jsonb_array_elements(saved.document->'baseline_events') b
 where b->>'obligation_id'=(p->>'obligation_id')::uuid::text and b->>'baseline_event_id'=(p->>'expected_baseline_event_id')::uuid::text;
 perform 1 from public.projects where id=(captured->>'project_id')::uuid and organization_id=org and deleted_at is null for share nowait;
 if not found then raise exception 'obligation_project_access_denied' using errcode='42501';end if;
 if operations_economy_private.authorize_obligation_admin_v1((captured->>'project_id')::uuid) is distinct from org then
 raise exception 'obligation_project_access_denied' using errcode='42501';end if;
 select * into baseline from public.operations_project_obligation_baselines
 where organization_id=org and project_id=(captured->>'project_id')::uuid and obligation_id=(p->>'obligation_id')::uuid
 and event_id=(p->>'expected_baseline_event_id')::uuid;
 if not found or baseline.fingerprint is distinct from captured->>'baseline_fingerprint' or baseline.revision::text is distinct from captured->>'baseline_revision'
 then raise exception 'saved_obligation_capture_invalid' using errcode='22023';end if;
 if (select count(*) from (select distinct source_anchor from public.operations_project_obligation_invoice_bindings
 where organization_id=org and project_id=baseline.project_id and obligation_id=baseline.obligation_id limit 201) bounded)>200
 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_organization_id,'invoice_id',x.invoice_id)),'[]') into selectors
 from (select distinct latest.source_organization_id,latest.invoice_id from
 (select distinct on(source_anchor) source_organization_id,invoice_id from public.operations_project_obligation_invoice_bindings
 where organization_id=org and ((project_id=baseline.project_id and obligation_id=baseline.obligation_id)
 or source_anchor in (select s->>'source_anchor' from jsonb_array_elements(saved.document->'source_inventory') s))
 order by source_anchor,binding_sequence desc) latest) x;
 if jsonb_array_length(selectors)>100 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 -- Include ALL captured scope source anchors because its unchanged reader also
 -- checks other obligations; no invoice head may precede its own barrier.
 -- All invoice barriers precede unchanged scope/original readers' head row locks.
 if jsonb_array_length(selectors)>0 then perform operations_remaining_reader_private.sources_v1(org,selectors);end if;

 perform operations_remaining_reader_private.references_v1(org,saved.document->'baseline_events',saved.document->'source_inventory');
 select h.current_revision into current_revision from public.operations_project_obligation_heads h
  where h.organization_id=org and h.project_id=baseline.project_id and h.obligation_id=baseline.obligation_id for share nowait;
 select * into current_baseline from public.operations_project_obligation_baselines
  where organization_id=org and project_id=baseline.project_id and obligation_id=baseline.obligation_id and revision=current_revision;
 -- Preserve changed-baseline: saved baseline/null source evidence, no kernel call.
 if found and current_baseline.event_id=baseline.event_id then
  perform operations_remaining_reader_private.kernel_v1(jsonb_build_object('schema_version','operations-invoice-obligation-kernel-read.v1','organization_id',org,'project_id',baseline.project_id,'obligation_id',baseline.obligation_id));
 end if;
 return operations_economy_private.read_scope_obligation_drilldown_v1(p);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

create function operations_remaining_reader_private.kernel_entry_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare org uuid;project uuid;obligation uuid;key text;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>4 or not(p ?& array['schema_version','organization_id','project_id','obligation_id']) or p->>'schema_version' is distinct from 'operations-invoice-obligation-kernel-read.v1' then raise exception 'exact_invoice_kernel_read_scope_required' using errcode='22023';end if;
 foreach key in array array['organization_id','project_id','obligation_id'] loop if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_invoice_kernel_read_identity' using errcode='22023';end if;end loop;
 org:=(p->>'organization_id')::uuid;project:=(p->>'project_id')::uuid;obligation:=(p->>'obligation_id')::uuid;

 perform operations_remaining_reader_private.try_org_v1(org,false);
 perform operations_remaining_reader_private.kernel_v1(p);
 return operations_economy_private.read_invoice_obligation_kernel_v1(p);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

create function operations_remaining_reader_private.original_entry_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text)
returns jsonb language plpgsql security definer set search_path='' as $body$
begin
 if p_org is null or p_project is null or p_obligation is null or p_anchor is null or p_anchor !~ '^[0-9a-f]{64}$'
 then raise exception 'invalid_obligation_original_selector' using errcode='22023';end if;
 perform operations_remaining_reader_private.try_org_v1(p_org,false);
 perform operations_remaining_reader_private.original_v1(p_org,p_project,p_obligation,p_anchor,false);
 return operations_economy_private.read_obligation_original_v1(p_org,p_project,p_obligation,p_anchor);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

create function operations_remaining_reader_private.policy_entry_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text)
returns jsonb language plpgsql security definer set search_path='' as $body$
begin
 if p_org is null or p_project is null or p_obligation is null or p_anchor is null or p_anchor !~ '^[0-9a-f]{64}$'
 then raise exception 'invalid_obligation_original_selector' using errcode='22023';end if;
 perform operations_remaining_reader_private.try_org_v1(p_org,false);
 perform operations_remaining_reader_private.original_v1(p_org,p_project,p_obligation,p_anchor,true);
 return operations_economy_private.read_source_policy_v1(p_org,p_project,p_obligation,p_anchor);
exception when lock_not_available then raise exception 'remaining_reader_dependency_busy' using errcode='55P03';
end;$body$;

revoke all on all functions in schema operations_remaining_reader_private from public,anon,authenticated,service_role;
grant execute on function operations_remaining_reader_private.parent_entry_v1(uuid,text,uuid),operations_remaining_reader_private.drilldown_entry_v1(jsonb) to authenticated;
grant execute on function operations_remaining_reader_private.composition_entry_v1(uuid,uuid),operations_remaining_reader_private.kernel_entry_v1(jsonb),operations_remaining_reader_private.original_entry_v1(uuid,uuid,uuid,text),operations_remaining_reader_private.policy_entry_v1(uuid,uuid,uuid,text) to service_role;

create or replace function public.read_operations_scope_obligation_evidence_v1(p_organization_id uuid,p_root_kind text,p_root_id uuid) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.parent_entry_v1(p_organization_id,p_root_kind,p_root_id);$body$;
revoke all on function public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid) to authenticated;

create or replace function public.read_operations_scope_obligation_drilldown_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.drilldown_entry_v1(p_request);$body$;
revoke all on function public.read_operations_scope_obligation_drilldown_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_obligation_drilldown_v1(jsonb) to authenticated;

create or replace function public.read_operations_scope_obligation_composition_v1(p_organization_id uuid,p_economic_scope_id uuid) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.composition_entry_v1(p_organization_id,p_economic_scope_id);$body$;
revoke all on function public.read_operations_scope_obligation_composition_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_obligation_composition_v1(uuid,uuid) to service_role;

create or replace function public.read_operations_invoice_obligation_kernel_evidence_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.kernel_entry_v1(p_request);$body$;
revoke all on function public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb) to service_role;

create or replace function public.read_operations_obligation_original_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.original_entry_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$body$;
revoke all on function public.read_operations_obligation_original_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_obligation_original_v1(uuid,uuid,uuid,text) to service_role;

create or replace function public.read_operations_obligation_source_policy_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text) returns jsonb language sql security invoker set search_path='' set lock_timeout='100ms'
 as $body$ select operations_remaining_reader_private.policy_entry_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$body$;
revoke all on function public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text) to service_role;

-- Remove direct client bypasses only; exact owner recursion remains unchanged.
-- append_source_policy, compose, first-two scope kernels, credit authority and
-- hired definer->invoker invoice evidence continue under their audited owner.
revoke execute on function operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid),
 operations_economy_private.read_scope_obligation_drilldown_v1(jsonb),
 operations_economy_private.read_scope_composition_v1(uuid,uuid),
 operations_economy_private.read_invoice_obligation_kernel_v1(jsonb),
 operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text),
 operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text)
from public,anon,authenticated,service_role;
-- Full native schema/caller certificate, queues/settings/JWT/PostgREST and old
-- application regressions remain release gates. This is observed-row evidence,
-- not universal no-wait or coherent whole-source publication authority.
commit;
