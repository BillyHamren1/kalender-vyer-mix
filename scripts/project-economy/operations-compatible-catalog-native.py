#!/usr/bin/env python3
"""Fresh selected installed metadata and rollback negatives; never full authority."""
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import signal
import sys
import tempfile

HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
DATABASE='eventflow_scope_publication_runtime'
FIXED_ENV={'CI':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE,'EVENTFLOW_COMPATIBLE_CATALOG_ISOLATED_DB':'true','DENO_NO_PACKAGE_JSON':'1','PYTHONDONTWRITEBYTECODE':'1'}
BASE_RUNNER=HERE/'operations-scope-compatible-read-native.py'
BASE_SHA='3f84443ff4a333fa31c790a352b96d5572ab39b0dc94ee29f6a635120cc97697'
BASE_CLOSURE=HERE/'operations-scope-compatible-read-native-closure.json'
BASE_CLOSURE_SHA='7afa5082e3c118ffe318e7699a55b1e70d3561b00da006525c35828e0f9a95cb'
CLOSURE=HERE/'operations-compatible-catalog-native-closure.json'
CASES=('owner_drift','search_path_drift','public_definer_drift','direct_core_execute','inherited_core_execute','schema_usage_drift','unknown_static_caller','unknown_constructed_dispatcher','extension_provenance','known_body_drift','arbitrary_selector_dispatcher')
EXTRA=('scripts/project-economy/operations-scope-compatible-read-native-closure.json','scripts/project-economy/operations-compatible-catalog-read.sql','scripts/project-economy/operations-compatible-catalog-setup.sql','scripts/project-economy/operations-compatible-catalog-negativecases.sql','scripts/project-economy/operations-compatible-catalog-native.py','scripts/project-economy/operations-compatible-catalog-native.guard.test.py','docs/project-economy/operations-compatible-catalog-native-contract.md')
PHASES={'guard','paths','source_closure','fresh_database','schema','obligation_fixture','setup','try_setup','permission_setup','admin','preflight','product_setup','catalog_setup','baseline','proof'}|{'case_'+c for c in CASES}|{'restore_'+c for c in CASES}
CODES={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
FUNCTION_KEYS={'schema_name','function_name','identity_arguments','result_type','language_name','owner_name','routine_kind','security_definer','empty_search_path','source_sha256','acl_sha256','anon_schema_usage','authenticated_schema_usage','service_role_schema_usage','config_sha256','extension_membership','public_execute','anon_execute','authenticated_execute','service_role_execute'}
SCHEMA_KEYS={'schema_name','owner_name','acl_sha256','public_usage','public_create','anon_usage','authenticated_usage','service_role_usage'}
DOC_KEYS={'schema','selected_scope','full_certificate','unresolved_gates','purpose','database','transaction_isolation','transaction_read_only','scope','omitted_scope','installed_schema_count','schemas','installed_function_count','functions'}
GATES=['outside_schema_and_role_graph','generated_provenance','dynamic_dispatch','extension_dispatch','hosted_candidate_catalog']

class ClosedFailure(Exception):
 def __init__(self,phase,code='unclassified',retain_private=False):
  self.phase=phase if phase in PHASES else 'guard';self.code=code if code in CODES else 'unclassified';self.retain_private=retain_private
  super().__init__('closed_selected_catalog_failure')

def validate_environment(env):
 if any(env.get(k)!=v for k,v in FIXED_ENV.items()) or env.get('GITHUB_REPOSITORY')!='BillyHamren1/kalender-vyer-mix' or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise ClosedFailure('guard')
 for key,value in env.items():
  if not value:continue
  if key.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'} or key.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_','LD_')) or key.startswith('PG') and key not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'} or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','NODE_OPTIONS','SHELLOPTS','BASHOPTS','PS4','PYTHONSTARTUP','PYTHONINSPECT','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES'}:raise ClosedFailure('guard')
  if key.startswith(('EVENTFLOW_SCOPE_','EVENTFLOW_COMPATIBLE_CATALOG_')) and key not in {'EVENTFLOW_COMPATIBLE_CATALOG_ISOLATED_DB','EVENTFLOW_COMPATIBLE_CATALOG_DENO_BIN'}:raise ClosedFailure('guard')
 deno=env.get('EVENTFLOW_COMPATIBLE_CATALOG_DENO_BIN','deno')
 if deno!='deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve()!=pathlib.Path(deno) or not pathlib.Path(deno).is_file()):raise ClosedFailure('guard')
 return deno

def load_base():
 if BASE_RUNNER.resolve()!=BASE_RUNNER or not BASE_RUNNER.is_file() or hashlib.sha256(BASE_RUNNER.read_bytes()).hexdigest()!=BASE_SHA:raise ClosedFailure('paths')
 spec=importlib.util.spec_from_file_location('selected_catalog_frozen_helpers',BASE_RUNNER);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def closure_paths(base,root=ROOT,manifest=CLOSURE):
 try:
  if not manifest.is_file() or manifest.resolve()!=manifest:raise ValueError()
  base_manifest=root/'scripts/project-economy/operations-scope-compatible-read-native-closure.json'
  if not base_manifest.is_file() or base_manifest.resolve()!=base_manifest or hashlib.sha256(base_manifest.read_bytes()).hexdigest()!=BASE_CLOSURE_SHA:raise ValueError()
  value=json.loads(manifest.read_text());prior=json.loads(base_manifest.read_text())
  if set(value)!={'schema','database','selected_scope','full_certificate','ordered_schema_paths','files'} or value['schema']!='operations-compatible-catalog-native-closure.v1' or value['database']!=DATABASE or value['selected_scope'] is not True or value['full_certificate'] is not False or len(prior['files'])!=86 or set(value['files'])!=set(prior['files'])|set(EXTRA) or value['ordered_schema_paths']!=prior['ordered_schema_paths'] or len(value['ordered_schema_paths'])!=23:raise ValueError()
  for name,digest in value['files'].items():
   if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError()
   p=root/name
   if not p.is_file() or p.resolve()!=p or not p.is_relative_to(root) or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise ValueError()
  if any(value['files'][name]!=digest for name,digest in prior['files'].items()):raise ValueError()
  base.closure_paths(root,base_manifest)
  return [root/name for name in value['ordered_schema_paths']]
 except Exception:raise ClosedFailure('source_closure') from None

def run_private(shared,phase,command,env,private,timeout,stdin=None):
 if phase not in PHASES:raise ClosedFailure('guard')
 directory=private/phase
 try:
  directory.mkdir(mode=0o700)
  return shared.run_private('authority_sql',command,env,ROOT,directory,timeout,stdin)
 except shared.ClosedFailure as error:raise ClosedFailure(phase,error.code,error.retain_private) from None
 except (OSError,ValueError,TypeError):raise ClosedFailure(phase) from None

def json_rows(path,phase):
 try:
  if not path.is_file() or path.resolve()!=path or path.stat().st_size>8*1024*1024:raise ValueError()
  def pairs(items):
   v={}
   for k,x in items:
    if k in v:raise ValueError()
    v[k]=x
   return v
  rows=[json.loads(line,parse_constant=lambda _v:(_ for _ in ()).throw(ValueError()),object_pairs_hook=pairs) for line in path.read_text().splitlines() if line]
  return rows
 except Exception:raise ClosedFailure(phase) from None

def read_doc(v,readonly):
 if not isinstance(v,dict) or set(v)!=DOC_KEYS or v['schema']!='operations-compatible-catalog-selected.v1' or v['selected_scope'] is not True or v['full_certificate'] is not False or v['unresolved_gates']!=GATES or v['purpose']!='disposable_metadata_inventory_not_authority' or v['database']!=DATABASE or v['transaction_isolation']!='repeatable read' or v['transaction_read_only'] is not readonly or v['scope']!='public_auth_extensions_operations_namespaces' or v['omitted_scope']!='pg_catalog_and_other_namespaces':raise ClosedFailure('proof')
 if type(v['installed_function_count']) is not int or not 1<=v['installed_function_count']<=4096 or not isinstance(v['functions'],list) or len(v['functions'])!=v['installed_function_count'] or type(v['installed_schema_count']) is not int or not 1<=v['installed_schema_count']<=128 or not isinstance(v['schemas'],list) or len(v['schemas'])!=v['installed_schema_count']:raise ClosedFailure('proof')
 def string(x,limit=16384):return isinstance(x,str) and 0<len(x.encode('utf-8'))<=limit and '\0' not in x
 def digest(x):return isinstance(x,str) and re.fullmatch('[a-f0-9]{64}',x) is not None
 fnids=[]
 for r in v['functions']:
  if not isinstance(r,dict) or set(r)!=FUNCTION_KEYS:raise ClosedFailure('proof')
  if any(not string(r[k]) for k in ('schema_name','function_name','result_type','language_name','owner_name','routine_kind')) or not isinstance(r['identity_arguments'],str) or len(r['identity_arguments'].encode('utf-8'))>16384 or any(not digest(r[k]) for k in ('source_sha256','acl_sha256','config_sha256')) or any(type(r[k]) is not bool for k in ('security_definer','empty_search_path','anon_schema_usage','authenticated_schema_usage','service_role_schema_usage','public_execute','anon_execute','authenticated_execute','service_role_execute')) or not isinstance(r['extension_membership'],list) or any(not string(x,128) for x in r['extension_membership']):raise ClosedFailure('proof')
  fnids.append((r['schema_name'],r['function_name'],r['identity_arguments']))
 if len(set(fnids))!=len(fnids):raise ClosedFailure('proof')
 ids=[]
 for r in v['schemas']:
  if not isinstance(r,dict) or set(r)!=SCHEMA_KEYS or not string(r['schema_name'],128) or not string(r['owner_name'],128) or not digest(r['acl_sha256']) or any(type(r[k]) is not bool for k in ('public_usage','public_create','anon_usage','authenticated_usage','service_role_usage')):raise ClosedFailure('proof')
  ids.append(r['schema_name'])
 if len(set(ids))!=len(ids):raise ClosedFailure('proof')
 return v

def same_inventory(a,b):
 return {k:v for k,v in a.items() if k!='transaction_read_only'}=={k:v for k,v in b.items() if k!='transaction_read_only'}

def find(v,name,schema='operations_economy_private'):
 rows=[r for r in v['functions'] if r['schema_name']==schema and r['function_name']==name]
 if len(rows)!=1:raise ClosedFailure('proof')
 return rows[0]

def validate_controls(v):
 if not isinstance(v,dict) or set(v)!={'full_seed_sha256','service_direct_core_execute','temporary_roles'} or not isinstance(v['full_seed_sha256'],str) or not re.fullmatch('[a-f0-9]{64}',v['full_seed_sha256']) or type(v['service_direct_core_execute']) is not bool or type(v['temporary_roles']) is not int or not 0<=v['temporary_roles']<=1:raise ClosedFailure('proof')
 return v

def controls_sql():
 return "select jsonb_build_object('full_seed_sha256',operations_scope_compatible_read_native.state_sha256(),'service_direct_core_execute',exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='operations_economy_private.read_scope_invoice_kernel_v1(jsonb)'::regprocedure and a.grantee=(select oid from pg_roles where rolname='service_role') and a.privilege_type='EXECUTE'),'temporary_roles',(select count(*) from pg_roles where rolname like 'operations_compatible_catalog_%'));\n"

def projection_sql(source):
 if source.count('with catalog as (')!=1 or not source.endswith('rollback;\n'):raise ClosedFailure('paths')
 return source[source.index('with catalog as ('):-len('rollback;\n')]

def cases_sql(source):
 matches=re.findall(r'^-- BEGIN CASE ([a-z_]+)\n(.*?)^-- END CASE \1$',source,re.M|re.S)
 if tuple(name for name,_sql in matches)!=CASES or len(set(name for name,_sql in matches))!=len(CASES):raise ClosedFailure('paths')
 return dict(matches)

def options(base):return base.options()+"set eventflow.compatible_catalog_isolated='synthetic-disposable';\n"

def assert_negative(case,before,after,controls):
 if controls['temporary_roles']!=int(case in {'owner_drift','inherited_core_execute'}):raise ClosedFailure('proof')
 if same_inventory(before,after):raise ClosedFailure('proof')
 if case=='owner_drift' and find(after,'read_scope_invoice_kernel_compatible_v1')['owner_name']!='operations_compatible_catalog_owner':raise ClosedFailure('proof')
 if case=='search_path_drift' and find(after,'read_scope_invoice_kernel_compatible_v1')['empty_search_path'] is not False:raise ClosedFailure('proof')
 if case=='public_definer_drift' and find(after,'read_operations_scope_invoice_capture_admin_v1','public')['security_definer'] is not True:raise ClosedFailure('proof')
 if case in {'direct_core_execute','inherited_core_execute'}:
  if find(after,'read_scope_invoice_kernel_v1')['service_role_execute'] is not True or controls['service_direct_core_execute'] is not (case=='direct_core_execute'):raise ClosedFailure('proof')
 if case=='schema_usage_drift' and find(after,'read_scope_invoice_kernel_v1')['anon_schema_usage'] is not True:raise ClosedFailure('proof')
 names={'unknown_static_caller':'unreviewed_static','unknown_constructed_dispatcher':'unreviewed_constructed','extension_provenance':'unreviewed_extension','arbitrary_selector_dispatcher':'unreviewed_selector'}
 if case in names:
  row=find(after,names[case],'operations_compatible_catalog_native')
  if any(row[k] for k in ('public_execute','anon_execute','authenticated_execute','service_role_execute','anon_schema_usage','authenticated_schema_usage','service_role_schema_usage')):raise ClosedFailure('proof')
  if case=='extension_provenance' and row['extension_membership']!=['plpgsql']:raise ClosedFailure('proof')
 if case=='known_body_drift' and find(before,'read_scope_invoice_kernel_compatible_v1')['source_sha256']==find(after,'read_scope_invoice_kernel_compatible_v1')['source_sha256']:raise ClosedFailure('proof')

def execute(env):
 deno=validate_environment(env);base=load_base();ddl=closure_paths(base);shared=base.load_shared()
 private=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-catalog-',dir='/tmp'));private.chmod(0o700);retain=False
 pg_env=dict(env,PGCONNECT_TIMEOUT='5');deno_env={k:v for k,v in env.items() if not k.startswith('PG')}
 psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
 try:
  fresh="set statement_timeout='10s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema','pg_toast')) and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') and not exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') and not exists(select 1 from pg_roles where rolname not in ('postgres','pg_database_owner','pg_read_all_data','pg_write_all_data','pg_monitor','pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint'));"
  out=run_private(shared,'fresh_database',psql,pg_env,private,20,fresh.encode())
  if out.read_text().splitlines()!=['t']:raise ClosedFailure('fresh_database')
  run_private(shared,'schema',psql,pg_env,private,90,(options(base)+'\n'.join(p.read_text() for p in ddl)).encode())
  out=run_private(shared,'obligation_fixture',[deno,'run',str(HERE/'operations-obligation-fixture.ts')],deno_env,private,90)
  rows=json_rows(out,'obligation_fixture')
  if len(rows)!=1 or not isinstance(rows[0],dict):raise ClosedFailure('obligation_fixture')
  run_private(shared,'setup',psql,pg_env,private,90,base.setup_sql((HERE/'whole-scope-publication-transaction-native-setup.sql').read_text(),rows[0]).encode())
  for phase,file in (('try_setup','whole-scope-publication-try-native-setup.sql'),('permission_setup','whole-scope-reader-permission-native-setup.sql'),('admin','../../supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql')):
   run_private(shared,phase,psql,pg_env,private,45,(options(base)+(HERE/file).read_text()).encode())
  migration=(ROOT/'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql').read_text()
  pre=(HERE/'operations-scope-compatible-read-preflight-postgres-test.sql').read_text()
  if pre.count(":'migration'")!=1:raise ClosedFailure('preflight')
  pre=pre.replace(":'migration'","(select data->>'migration' from pg_temp.fixture_input)")
  out=run_private(shared,'preflight',psql,pg_env,private,45,(options(base)+base.copy_json({'migration':migration})+pre).encode())
  if out.read_text().splitlines()!=['operations-scope-compatible-read-preflight PASS unexpected_caller_security_search_path_exact_migration_rollback']:raise ClosedFailure('preflight')
  run_private(shared,'product_setup',psql,pg_env,private,45,(options(base)+migration+(HERE/'operations-scope-compatible-read-native-setup.sql').read_text()).encode())
  run_private(shared,'catalog_setup',psql,pg_env,private,30,(options(base)+(HERE/'operations-compatible-catalog-setup.sql').read_text()).encode())
  source=(HERE/'operations-compatible-catalog-read.sql').read_text();projection=projection_sql(source);mutations=cases_sql((HERE/'operations-compatible-catalog-negativecases.sql').read_text())
  baseline_sql=options(base)+source+"begin isolation level repeatable read read only;"+options(base)+controls_sql()+"rollback;\n"
  out=run_private(shared,'baseline',psql,pg_env,private,30,baseline_sql.encode());rows=json_rows(out,'baseline')
  if len(rows)!=2:raise ClosedFailure('baseline')
  baseline=read_doc(rows[0],True);baseline_controls=validate_controls(rows[1])
  if baseline_controls['temporary_roles']!=0 or baseline_controls['service_direct_core_execute'] is not False or find(baseline,'read_scope_invoice_kernel_v1')['service_role_execute'] is not False:raise ClosedFailure('proof')
  verified=[]
  for case in CASES:
   sql="begin isolation level repeatable read;"+options(base)+mutations[case]+"\n"+projection+controls_sql()+"rollback;\n"
   out=run_private(shared,'case_'+case,psql,pg_env,private,30,sql.encode());rows=json_rows(out,'case_'+case)
   if len(rows)!=2:raise ClosedFailure('proof')
   changed=read_doc(rows[0],False);controls=validate_controls(rows[1]);assert_negative(case,baseline,changed,controls)
   if controls['full_seed_sha256']!=baseline_controls['full_seed_sha256']:raise ClosedFailure('proof')
   out=run_private(shared,'restore_'+case,psql,pg_env,private,30,baseline_sql.encode());rows=json_rows(out,'restore_'+case)
   if len(rows)!=2 or not same_inventory(baseline,read_doc(rows[0],True)) or validate_controls(rows[1])!=baseline_controls:raise ClosedFailure('proof')
   verified.append('operations-compatible-catalog-negative PASS '+case+' rollback_selected_inventory_and_full_seed_unchanged')
  markers=['operations-compatible-catalog-selected PASS functions='+str(baseline['installed_function_count'])+' schemas='+str(baseline['installed_schema_count'])+' readonly_rr_full_certificate_false']+verified+['operations-compatible-catalog-native PASS selected23_admin_compatible11_rollbacks_no_dispatch_no_full_certificate']
 except ClosedFailure as error:retain=error.retain_private;raise
 finally:
  if not retain:
   try:shutil.rmtree(private)
   except OSError:raise ClosedFailure('proof',retain_private=True) from None
 for marker in markers:print(marker)

def main():
 def stop(_signal,_frame):raise ClosedFailure('guard')
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:execute(dict(os.environ))
 except ClosedFailure as error:
  print('operations-compatible-catalog-native FAIL '+error.phase+' SQLSTATE='+error.code,file=sys.stderr);return 1
 except Exception:
  print('operations-compatible-catalog-native FAIL guard SQLSTATE=unclassified',file=sys.stderr);return 1
 return 0
if __name__=='__main__':sys.exit(main())
