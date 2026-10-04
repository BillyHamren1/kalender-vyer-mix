// Pure fixed SQL for the root-owned disposable controller. No execution or caller SQL.
export const drilldownFixtureGuard = `
if current_database()<>'eventflow_project_evidence_http_runtime' then raise exception 'wrong_isolated_database' using errcode='42501';end if;
if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
or not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000199' and organization_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099'))
or not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000000117' and organization_id='00000000-0000-4000-8000-000000000001')
or not exists(select 1 from public.operations_project_scope_packing_policies where organization_id='00000000-0000-4000-8000-000000000001' and status='drilldown_ready')
then raise exception 'exact_drilldown_fixture_required' using errcode='55000';end if;`;

// Root wraps each literal in its bounded transaction + guard + ROW_COUNT=1 CAS.
export const drilldownMutations = Object.freeze({
  "drilldown/move-admin-org": `
if not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000093' and organization_id='00000000-0000-4000-8000-000000000099') then raise exception 'exact_foreign_fixture_required' using errcode='55000';end if;
update public.profiles set organization_id='00000000-0000-4000-8000-000000000099' where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001';`,
  "drilldown/restore-admin-org":
    `update public.profiles set organization_id='00000000-0000-4000-8000-000000000001' where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000099';`,
  "drilldown/delete-project-a":
    `update public.projects set deleted_at=clock_timestamp() where id='00000000-0000-4000-8000-000000000117' and organization_id='00000000-0000-4000-8000-000000000001' and deleted_at is null;`,
  "drilldown/revoke-admin":
    `delete from public.user_roles where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001' and role='admin';`,
  "drilldown/revoke-packing-policy":
    `update public.operations_project_scope_packing_policies set enabled=false where organization_id='00000000-0000-4000-8000-000000000001' and status='drilldown_ready' and enabled;`,
});

export const drilldownStateSql = `do $$begin ${drilldownFixtureGuard} end;$$;
select json_build_object('databaseName',current_database(),
'cateringPublications',(select count(*) from public.operations_catering_cost_publications),
'cateringObservations',(select count(*) from public.operations_catering_source_observations),
'cateringOutbox',(select count(*) from public.operations_catering_cost_outbox),
'invoiceSnapshots',(select count(*) from public.operations_finance_invoice_snapshots),
'baselines',(select count(*) from public.operations_project_obligation_baselines),
'bindings',(select count(*) from public.operations_project_obligation_invoice_bindings),
'sourcePolicies',(select count(*) from public.operations_obligation_source_policies),
'compositions',(select count(*) from public.operations_scope_obligation_compositions))::text;`;
