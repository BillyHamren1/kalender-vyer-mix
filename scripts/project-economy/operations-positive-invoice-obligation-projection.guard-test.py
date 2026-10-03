#!/usr/bin/env python3
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
SQL=ROOT/'supabase/migrations/20261003123000_operations_positive_invoice_obligation_projection_v1.sql'
CLIENT=ROOT/'src/lib/economy/positiveInvoiceObligationProjection.ts'
PANEL=ROOT/'src/components/project/OperationsPositiveInvoiceObligationProjection.tsx'
MOUNT=ROOT/'src/components/project/OperationsObligationDrilldownPanel.tsx'
RUNTIME=ROOT/'scripts/project-economy/operations-positive-invoice-obligation-projection-postgres-test.sql'
WORKFLOW=ROOT/'.github/workflows/operations-positive-invoice-obligation-projection-native.yml'
PG_IMAGE='docker.io/library/postgres@sha256:e27d24a29acce1b554771ba68c43afa55446069d228310451bb8c96c1531d2cb'
PG_BINARY_VERSION='postgres (PostgreSQL) 15.19 (Debian 15.19-1.pgdg13+2)'
PG_PACKAGE_VERSION='15.19-1.pgdg13+2'
IDENTITY_BLOCK=f'''          ops_projection_native_phase=postgres_version
          postgres_version="$(
            set -e
            timeout 10s env -u DOCKER_CONTEXT -u DOCKER_HOST \\
              docker --host "$socket" exec "$cid" postgres --version 2>/dev/null
            printf '.'
          )"
          case "$postgres_version" in
            '{PG_BINARY_VERSION}
          .') ;;
            *) false ;;
          esac
          postgres_package="$(
            set -e
            timeout 10s env -u DOCKER_CONTEXT -u DOCKER_HOST \\
              docker --host "$socket" exec "$cid" /bin/sh -ceu 'printf "%s\\n" "$PG_VERSION"' 2>/dev/null
            printf '.'
          )"
          case "$postgres_package" in
            '{PG_PACKAGE_VERSION}
          .') ;;
            *) false ;;
          esac
          unset postgres_version postgres_package
'''
RLS_ASSERTION_BLOCK='''          \\set ON_ERROR_STOP on
          do $assert$
          begin
            if not has_function_privilege('authenticated','public.read_operations_positive_invoice_obligation_projection_v1(jsonb)','execute') then
              raise exception 'authenticated_execute_privilege_required' using errcode='42501';
            end if;
            if has_function_privilege('anon','public.read_operations_positive_invoice_obligation_projection_v1(jsonb)','execute') then
              raise exception 'anon_execute_privilege_forbidden' using errcode='42501';
            end if;
          end
          $assert$;
          set role service_role;
          insert into public.operations_positive_invoice_projection_read_gates values ('11111111-1111-4111-8111-111111111111',false);
          reset role;
          grant select on public.operations_positive_invoice_projection_read_gates to authenticated;
          set role authenticated;
          do $assert$
          begin
            if exists (select 1 from public.operations_positive_invoice_projection_read_gates) then
              raise exception 'authenticated_read_gate_visibility_forbidden' using errcode='42501';
            end if;
          end
          $assert$;
'''
SERVICE_ROLE_BOOTSTRAP_LINE='          create role service_role noinherit nologin nosuperuser nocreatedb nocreaterole noreplication bypassrls;'


def require_service_role_bootstrap_contract(workflow):
 lowered=workflow.lower()
 assert workflow.count(SERVICE_ROLE_BOOTSTRAP_LINE)==1
 assert lowered.count('create role service_role ')==1
 assert lowered.count('bypassrls')==1
 assert 'alter role service_role' not in lowered
 assert 'row_security' not in lowered
 assert 'create role anon noinherit bypassrls' not in lowered
 assert 'create role authenticated noinherit bypassrls' not in lowered
 assert 'create role service_role superuser' not in lowered
 assert workflow.index(SERVICE_ROLE_BOOTSTRAP_LINE)<workflow.index('          ops_projection_native_phase=migration\n')


def require_postgres_identity_contract(workflow):
 assert workflow.count(f'PG_IMAGE: {PG_IMAGE}')==1
 assert workflow.count(IDENTITY_BLOCK)==1
 assert workflow.index(IDENTITY_BLOCK)<workflow.index('          ops_projection_native_phase=bootstrap\n')

def require_rls_assertion_contract(workflow):
 assert workflow.count(RLS_ASSERTION_BLOCK)==1
 assert 'else 1/0' not in workflow.lower()
 assert workflow.count("using errcode='42501';")==3
 assert workflow.index('          ops_projection_native_phase=rls\n')<workflow.index(RLS_ASSERTION_BLOCK)
 assert workflow.index(RLS_ASSERTION_BLOCK)<workflow.index('          ops_projection_native_phase=regression\n')

class Guard(unittest.TestCase):
 def setUp(self):
  self.sql=SQL.read_text();self.client=CLIENT.read_text();self.panel=PANEL.read_text();self.mount=MOUNT.read_text();self.runtime=RUNTIME.read_text();self.workflow=WORKFLOW.read_text()
 def test_default_off_and_authenticated_only(self):
  self.assertIn('enabled boolean not null default false',self.sql)
  self.assertIn('grant execute on function public.read_operations_positive_invoice_obligation_projection_v1(jsonb) to authenticated',self.sql)
  self.assertIn("VITE_OPERATIONS_POSITIVE_INVOICE_PROJECTION_ENABLED !== 'true'",self.panel)
  self.assertNotIn('service_role',self.client)
 def test_operations_only_and_no_mutating_economic_tables(self):
  lowered=self.sql.lower()
  for forbidden in ['update public.finance_','insert into public.finance_','delete from public.finance_','finance_cost_lines']:
   self.assertNotIn(forbidden,lowered)
  self.assertIn("'financeRecalculated',false",self.sql)
  self.assertIn('operations_single_obligation_positive_invoice_only',self.sql)
 def test_unknowns_and_nonclaims_remain_explicit(self):
  for text in ["'totalProjectCoverage','unavailable'","'creditCoverage','unavailable'","'hiredCoverage','unavailable'","'knownInvoiceMinor',case when complete then preliminary+confirmed else null end","'eacMinor',case when complete then eac else null end"]:
   self.assertIn(text,self.sql)
  self.assertIn("p.coverage === 'unavailable'",self.client)
  self.assertIn('Saknade belopp visas inte som noll',self.panel)
 def test_replacement_formula_and_rejected_exclusion(self):
  for text in ['remaining_estimate:=estimate-replaced','remaining_commitment:=committed-consumed','remaining:=greatest(remaining_estimate,remaining_commitment)','eac:=preliminary+confirmed+remaining',"if s->>'status'='rejected' then rejected_count:=rejected_count+1;continue;end if"]:
   self.assertIn(text,self.sql)
  self.assertIn("s->>'binding_state'='unresolved' and jsonb_typeof(s->'status') is distinct from 'null'",self.sql)
  self.assertNotIn("coalesce(s->'status'",self.sql)
 def test_primitive_source_states_are_required(self):
  self.assertIn("jsonb_typeof(s->'binding_state') is distinct from 'string'",self.sql)
  self.assertIn("jsonb_typeof(s->'policy_state') is distinct from 'string'",self.sql)
 def test_complete_cardinality_and_project_root_identity(self):
  self.assertIn("p.sourceCount !== p.activeSourceCount + p.rejectedSourceCount",self.client)
  self.assertIn("((p.knownInvoiceMinor as number) > 0) !== (p.activeSourceCount > 0)",self.client)
  self.assertIn("a.rootKind === 'project' && p.projectId !== a.rootId",self.client)
  self.assertIn("d->>'rootKind'='project' and d->>'obligationProjectId' is distinct from d->>'rootId'",self.sql)
 def test_mandatory_vectors_present(self):
  for label in ['estimate5000_invoice5400_not10400_preliminary','same_allocation_identity_preliminary_to_confirmed','partial_invoice_plus_remaining_commitment','rejected_document_does_not_consume_real_commitment','split_exact_two_identity_set','missing_never_fabricated_zero_total']:
   self.assertIn(label,self.runtime)
 def test_client_session_deadline_and_private_cache(self):
  for text in ['getSession()',"setHeader('Authorization'",'performance.now()-started>=15000','if (controller.signal.aborted) fail()','meta:{persist:false},gcTime:0,staleTime:0,retry:false,refetchInterval:30_000']:
   self.assertTrue(text in self.client or text in self.panel,text)
 def test_mounted_once_in_existing_drilldown(self):
  self.assertEqual(self.mount.count('<OperationsPositiveInvoiceObligationProjection'),1)
  self.assertEqual(self.mount.count("from './OperationsPositiveInvoiceObligationProjection'"),1)
 def test_published_workflow_and_no_step7_manifest(self):
  self.assertTrue(WORKFLOW.is_file())
  self.assertFalse(any(
   'operations-positive-invoice-obligation-projection' in p.name
   and 'manifest' in p.name.lower()
   for p in ROOT.rglob('*') if p.is_file()
  ))
 def test_postgres_identity_is_exact_pinned_and_pre_migration(self):
  require_postgres_identity_contract(self.workflow)
 def test_postgres_identity_contract_rejects_drift(self):
  mutations=[
   ('digest',self.workflow.replace('e27d24a29acce1b554771ba68c43afa55446069d228310451bb8c96c1531d2cb','f27d24a29acce1b554771ba68c43afa55446069d228310451bb8c96c1531d2cb',1)),
   ('binary',self.workflow.replace(PG_BINARY_VERSION,'postgres (PostgreSQL) 15.190 (Debian 15.19-1.pgdg13+2)',1)),
   ('package',self.workflow.replace(f"'{PG_PACKAGE_VERSION}\n          .')","'15.19-1.pgdg13+1\n          .')",1)),
   ('binary-stderr',self.workflow.replace('postgres --version 2>/dev/null','postgres --version',1)),
   ('package-stderr',self.workflow.replace("'printf \"%s\\n\" \"$PG_VERSION\"' 2>/dev/null","'printf \"%s\\n\" \"$PG_VERSION\"'",1)),
   ('phase',self.workflow.replace('ops_projection_native_phase=postgres_version','ops_projection_native_phase=postgres_version_drift',1)),
   ('order',self.workflow.replace('          ops_projection_native_phase=postgres_version\n','          ops_projection_native_phase=bootstrap\n          ops_projection_native_phase=postgres_version\n',1)),
  ]
  for label,mutated in mutations:
   self.assertNotEqual(mutated,self.workflow,label)
   with self.assertRaises((AssertionError,ValueError),msg=label):require_postgres_identity_contract(mutated)
 def test_rls_assertions_are_fail_closed_without_constant_division(self):
  require_rls_assertion_contract(self.workflow)
 def test_rls_assertion_contract_rejects_drift(self):
  mutations=[
   ('authenticated-inversion',self.workflow.replace("if not has_function_privilege('authenticated'","if has_function_privilege('authenticated'",1)),
   ('anon-inversion',self.workflow.replace("if has_function_privilege('anon'","if not has_function_privilege('anon'",1)),
   ('visibility-inversion',self.workflow.replace('if exists (select 1 from public.operations_positive_invoice_projection_read_gates)','if not exists (select 1 from public.operations_positive_invoice_projection_read_gates)',1)),
   ('missing-authenticated-raise',self.workflow.replace("raise exception 'authenticated_execute_privilege_required' using errcode='42501';",'null;',1)),
   ('missing-anon-raise',self.workflow.replace("raise exception 'anon_execute_privilege_forbidden' using errcode='42501';",'null;',1)),
   ('missing-visibility-raise',self.workflow.replace("raise exception 'authenticated_read_gate_visibility_forbidden' using errcode='42501';",'null;',1)),
   ('old-constant-folding',self.workflow.replace(RLS_ASSERTION_BLOCK,"          select case when true then 1 else 1/0 end;\n",1)),
   ('regression-before-assertion',self.workflow.replace('          ops_projection_native_phase=rls\n','          ops_projection_native_phase=regression\n          ops_projection_native_phase=rls\n',1)),
  ]
  for label,mutated in mutations:
   self.assertNotEqual(mutated,self.workflow,label)
   with self.assertRaises((AssertionError,ValueError),msg=label):require_rls_assertion_contract(mutated)
 def test_synthetic_service_role_matches_supabase_bypass_semantics(self):
  require_service_role_bootstrap_contract(self.workflow)
 def test_service_role_bootstrap_contract_rejects_drift(self):
  mutations=[
   ('missing-bypass',self.workflow.replace(SERVICE_ROLE_BOOTSTRAP_LINE,'          create role service_role noinherit nologin nosuperuser nocreatedb nocreaterole noreplication;',1)),
   ('anon-bypass',self.workflow.replace('          create role anon noinherit;','          create role anon noinherit bypassrls;',1)),
   ('authenticated-bypass',self.workflow.replace('          create role authenticated noinherit;','          create role authenticated noinherit bypassrls;',1)),
   ('service-superuser',self.workflow.replace(SERVICE_ROLE_BOOTSTRAP_LINE,'          create role service_role superuser bypassrls;',1)),
   ('alter-role-route',self.workflow.replace(SERVICE_ROLE_BOOTSTRAP_LINE,'          create role service_role noinherit;\n          alter role service_role bypassrls;',1)),
   ('row-security-session-bypass',self.workflow.replace('          set role service_role;','          set role service_role;\n          set row_security=off;',1)),
   ('duplicate-role-authority',self.workflow.replace(SERVICE_ROLE_BOOTSTRAP_LINE,SERVICE_ROLE_BOOTSTRAP_LINE+'\n'+SERVICE_ROLE_BOOTSTRAP_LINE,1)),
   ('bootstrap-after-migration',self.workflow.replace(SERVICE_ROLE_BOOTSTRAP_LINE+'\n','',1).replace('          ops_projection_native_phase=migration\n','          ops_projection_native_phase=migration\n'+SERVICE_ROLE_BOOTSTRAP_LINE+'\n',1)),
  ]
  for label,mutated in mutations:
   self.assertNotEqual(mutated,self.workflow,label)
   with self.assertRaises((AssertionError,ValueError),msg=label):require_service_role_bootstrap_contract(mutated)
 def test_no_true_nul(self):
  validator=ROOT/'scripts/project-economy/operations-positive-invoice-obligation-projection-client.test.mjs'
  for path in [SQL,CLIENT,PANEL,MOUNT,RUNTIME,validator,WORKFLOW,Path(__file__)]:self.assertNotIn(b'\0',path.read_bytes())

if __name__=='__main__':unittest.main()
