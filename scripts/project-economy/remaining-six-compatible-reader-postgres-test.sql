-- NEW six-entry fixture only. Root must provide actual audited closure and
-- genuine isolated HTTP/UI/drilldown producer fixtures before this SQL.
-- This tests public-wrapper/direct old-owner parity, not queue/JWT/API proof.
begin;
do $guard$
begin
 if current_database()<>'operations_remaining_six_read_runtime'
 or current_setting('test.remaining_six_isolated',true) is distinct from 'synthetic-disposable'
 then raise exception 'remaining_six_disposable_fixture_required' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
 or not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001')
 or not exists(select 1 from public.user_roles where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001' and role='admin')
 then raise exception 'remaining_six_actual_actor_fixture_required' using errcode='55000';end if;
 if not exists(select 1 from public.operations_project_scope_heads where organization_id='00000000-0000-4000-8000-000000000001' and root_id='00000000-0000-4000-8000-000000001017')
 then raise exception 'remaining_six_genuine_composition_fixture_required' using errcode='55000';end if;
end;$guard$;

create temporary table remaining_six_vectors(family text not null,args jsonb not null,actor boolean not null default true);
grant select on remaining_six_vectors to authenticated,service_role;
create function pg_temp.remaining_six_invoke(family text,args jsonb,old_core boolean) returns jsonb language plpgsql security invoker as $body$
declare value jsonb;state text;message text;begin
 -- TEST-only fixed branches: no caller SQL or arbitrary function/identifier.
 begin
  case family
   when 'parent' then
    if old_core then value:=operations_economy_private.read_scope_obligation_evidence_v1((args->>0)::uuid,args->>1,(args->>2)::uuid);
    else value:=public.read_operations_scope_obligation_evidence_v1((args->>0)::uuid,args->>1,(args->>2)::uuid);end if;
   when 'drilldown' then
    if old_core then value:=operations_economy_private.read_scope_obligation_drilldown_v1(args->0);
    else value:=public.read_operations_scope_obligation_drilldown_v1(args->0);end if;
   when 'composition' then
    if old_core then value:=operations_economy_private.read_scope_composition_v1((args->>0)::uuid,(args->>1)::uuid);
    else value:=public.read_operations_scope_obligation_composition_v1((args->>0)::uuid,(args->>1)::uuid);end if;
   when 'kernel' then
    if old_core then value:=operations_economy_private.read_invoice_obligation_kernel_v1(args->0);
    else value:=public.read_operations_invoice_obligation_kernel_evidence_v1(args->0);end if;
   when 'original' then
    if old_core then value:=operations_economy_private.read_obligation_original_v1((args->>0)::uuid,(args->>1)::uuid,(args->>2)::uuid,args->>3);
    else value:=public.read_operations_obligation_original_v1((args->>0)::uuid,(args->>1)::uuid,(args->>2)::uuid,args->>3);end if;
   when 'policy' then
    if old_core then value:=operations_economy_private.read_source_policy_v1((args->>0)::uuid,(args->>1)::uuid,(args->>2)::uuid,args->>3);
    else value:=public.read_operations_obligation_source_policy_v1((args->>0)::uuid,(args->>1)::uuid,(args->>2)::uuid,args->>3);end if;
   else raise exception 'remaining_six_fixed_family_required' using errcode='22023';
  end case;
  return jsonb_build_object('kind','reply','value',value);
 exception when others then
  get stacked diagnostics state=returned_sqlstate,message=message_text;
  if octet_length(message)>16384 then raise exception 'remaining_six_error_size_limit' using errcode='54000';end if;
  return jsonb_build_object('kind','error','sqlstate',state,'message',message);
 end;
end;$body$;
grant execute on function pg_temp.remaining_six_invoke(text,jsonb,boolean) to authenticated,service_role;

-- Deliberate gate setup is inside this disposable transaction and occurs before
-- read-state checkpoints. No invoice/personnel source/head or official cost write.
insert into public.operations_invoice_obligation_kernel_read_gates values('00000000-0000-4000-8000-000000000001',true)
on conflict(organization_id) do update set enabled=true;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',true);

do $vectors$
declare org uuid:='00000000-0000-4000-8000-000000000001';row record;baseline jsonb;anchor text;request jsonb;begin
 for row in select s.*,c.snapshot_id,c.document from public.operations_project_scope_heads s
 join public.operations_scope_obligation_composition_heads h on h.organization_id=s.organization_id and h.economic_scope_id=s.economic_scope_id
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where s.organization_id=org and s.root_id in('00000000-0000-4000-8000-000000001017','00000000-0000-4000-8000-000000000117','00000000-0000-4000-8000-000000000219','00000000-0000-4000-8000-000000000319','00000000-0000-4000-8000-000000000417','00000000-0000-4000-8000-000000000517','00000000-0000-4000-8000-000000000617')
 order by s.root_kind,s.root_id loop
  baseline:=row.document->'baseline_events'->0;
  if baseline is null then raise exception 'remaining_six_actual_saved_baseline_required' using errcode='55000';end if;
  select source_anchor into anchor from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=(baseline->>'obligation_id')::uuid order by binding_sequence desc limit 1;
  insert into remaining_six_vectors values('parent',jsonb_build_array(org,row.root_kind,row.root_id),true),('composition',jsonb_build_array(org,row.economic_scope_id),true);
  request:=jsonb_build_object('schema_version','operations-scope-obligation-drilldown-read.v1','root_kind',row.root_kind,'root_id',row.root_id,'obligation_id',baseline->'obligation_id','expected_composition_snapshot_id',row.snapshot_id,'expected_baseline_event_id',baseline->'baseline_event_id');
  insert into remaining_six_vectors values('drilldown',jsonb_build_array(request),true),
   ('kernel',jsonb_build_array(jsonb_build_object('schema_version','operations-invoice-obligation-kernel-read.v1','organization_id',org,'project_id',baseline->'project_id','obligation_id',baseline->'obligation_id')),true),
   ('original',jsonb_build_array(org,baseline->'project_id',baseline->'obligation_id',coalesce(anchor,repeat('f',64))),true),
   ('policy',jsonb_build_array(org,baseline->'project_id',baseline->'obligation_id',coalesce(anchor,repeat('f',64))),true);
 end loop;
 if (select count(*) from remaining_six_vectors)<24 then raise exception 'remaining_six_three_root_fixture_required' using errcode='55000';end if;
end;$vectors$;
insert into remaining_six_vectors values
 ('parent','[null,null,null]',false),('drilldown','[{}]',false),('composition','[null,null]',false),('kernel','[{}]',false),('original','[null,null,null,null]',false),('policy','[null,null,null,null]',false),
 ('original','["synthetic-invalid-uuid",null,null,null]',false);

create temporary table remaining_six_results(family text not null,original jsonb not null,candidate jsonb not null);
do $parity$
declare row record;old jsonb;candidate jsonb;clock text;caller_setting text;allowed text;begin
 for row in select * from remaining_six_vectors loop
  perform set_config('request.jwt.claims',case when row.actor then '{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}' else '{}' end,true);
  old:=pg_temp.remaining_six_invoke(row.family,row.args,true);
  caller_setting:=current_setting('lock_timeout');
  perform set_config('lock_timeout','2s',true);
  allowed:=case when row.family in('parent','drilldown') then 'authenticated' else 'service_role' end;
  execute 'set local role '||allowed;
  candidate:=pg_temp.remaining_six_invoke(row.family,row.args,false);
  if current_setting('lock_timeout')<>'2s' then raise exception 'remaining_six_public_setting_not_restored' using errcode='55000';end if;
  execute 'reset role';perform set_config('lock_timeout',caller_setting,true);
  clock:=case row.family when 'parent' then 'generatedAt' when 'drilldown' then 'asOf' when 'kernel' then 'as_of' else null end;
  if old->>'kind'='reply' and candidate->>'kind'='reply' and clock is not null then
   if jsonb_typeof(old#>array['value',clock]) is distinct from 'string' or jsonb_typeof(candidate#>array['value',clock]) is distinct from 'string'
   then raise exception 'remaining_six_original_clock_required' using errcode='55000';end if;
   old:=jsonb_set(old,'{value}',(old->'value')-clock);candidate:=jsonb_set(candidate,'{value}',(candidate->'value')-clock);
  end if;
  if old is distinct from candidate then raise exception 'remaining_six_exact_parity_failed' using errcode='55000';end if;
  insert into remaining_six_results values(row.family,old,candidate);
 end loop;
end;$parity$;

do $metadata$
declare row record;cores text[]:=array['read_scope_obligation_evidence_v1(uuid,text,uuid)','read_scope_obligation_drilldown_v1(jsonb)','read_scope_composition_v1(uuid,uuid)','read_invoice_obligation_kernel_v1(jsonb)','read_obligation_original_v1(uuid,uuid,uuid,text)','read_source_policy_v1(uuid,uuid,uuid,text)'];core text;role_name text;counted integer:=0;begin
 for row in select p.oid,p.prosecdef,p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('read_operations_scope_obligation_evidence_v1','read_operations_scope_obligation_drilldown_v1','read_operations_scope_obligation_composition_v1','read_operations_invoice_obligation_kernel_evidence_v1','read_operations_obligation_original_v1','read_operations_obligation_source_policy_v1') loop
  counted:=counted+1;
  if row.prosecdef or row.proconfig is distinct from array['search_path=""','lock_timeout=100ms'] or has_function_privilege('anon',row.oid,'execute')
  then raise exception 'remaining_six_public_scope_metadata_failed' using errcode='55000';end if;
 end loop;
 if counted<>6 then raise exception 'remaining_six_six_public_entries_required' using errcode='55000';end if;
 foreach core in array cores loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if pg_catalog.has_function_privilege(role_name,'operations_economy_private.'||core,'execute') then raise exception 'remaining_six_old_core_client_bypass' using errcode='55000';end if;
  end loop;
 end loop;
 if pg_catalog.has_function_privilege('service_role','operations_remaining_reader_private.actor_v1()','execute')
 or pg_catalog.has_function_privilege('authenticated','operations_remaining_reader_private.kernel_v1(jsonb)','execute')
 or pg_catalog.has_function_privilege('anon','operations_remaining_reader_private.parent_entry_v1(uuid,text,uuid)','execute')
 then raise exception 'remaining_six_private_primitive_client_bypass' using errcode='55000';end if;
end;$metadata$;
select 'REMAINING_SIX_DIRECT_PARITY_PASS' as result,count(*) as vectors from remaining_six_results;
rollback;
-- No native queue/API/bypass/full-source authority is granted by this marker.
