#!/usr/bin/env python3
"""Fresh finite installed readers through a restricted actual HTTP connection."""
import hashlib, http.client, importlib.util, json, os, pathlib, re, secrets, shutil, socket, stat, sys, tempfile, time
ROOT=pathlib.Path(__file__).resolve().parent.parent.parent
PREFIX='scripts/project-economy/operations-compatible-catalog-http-'
BASE='scripts/project-economy/operations-compatible-full-catalog-native-closure.json'
BASE_SHA='c65f448b0887c42e9984bf161f6c6caed35333b9cc4f8bb6e5ef324d67e0d05e'
BASE_RUNNER='scripts/project-economy/operations-compatible-full-catalog-native.py'
BASE_RUNNER_SHA='34ee9c5a3e57cf3304f32e21c0ef6341ab5e2f06ae8063f49c808d0b1d577152'
DATABASE='operations_compatible_install_runtime'
AUTHENTICATOR='operations_catalog_http_authenticator'
PORT=55783
DOCKER=['docker','--host','unix:///var/run/docker.sock']
OWNED={PREFIX+x for x in ('setup.sql','journey.ts','journey.test.ts','native.py','native.guard.test.py','wire.py','wire.test.py')}|{'docs/project-economy/operations-compatible-catalog-http-native-contract.md'}
PHASES={'guard','closure','fresh','schema','setup','first','six','fixture','connection','capture','budget','docker_create','docker_verify','docker_start','health','http','control','restore','cleanup'}
CODES={'unclassified','22023','42501','55000','P0001','55P03','57014','40P01','25P02','PT409'}
HTTP_MARKERS=['operations-compatible-catalog-http PASS exact_eight_public_and_one_absence_copied_null_evidence','operations-compatible-catalog-http PASS denials18_roles_signature_expiry_tenant_metadata_stale_private']
CONTROL_MARKERS={s:'operations-compatible-catalog-http PASS control_'+s+'_actual_denial' for s in ('gate_disabled','admin_removed','profile_foreign')}
CHECKPOINTS={'none','capture_tablelist','capture_snapshot'}
REASONS={'unclassified','owned_output_at_cap'}
class ClosedFailure(Exception):
 def __init__(self,phase,code='unclassified',checkpoint='none',reason='unclassified'):
  self.phase=phase if type(phase) is str and phase in PHASES else 'guard';self.code=code if type(code) is str and code in CODES else 'unclassified';self.checkpoint=checkpoint if type(checkpoint) is str and checkpoint in CHECKPOINTS else 'none';self.reason=reason if type(reason) is str and reason in REASONS else 'unclassified';super().__init__('closed_catalog_http_failure')
def failed_child_output_reason(where,parent_identity):
 # No output bytes or exception properties are read. Frozen child cleanup has completed.
 descriptor=None
 try:
  parent=where.lstat()
  if where.resolve()!=where or not stat.S_ISDIR(parent.st_mode) or stat.S_IMODE(parent.st_mode)!=0o700 or parent.st_uid!=os.geteuid() or (parent.st_dev,parent.st_ino)!=parent_identity:return 'unclassified'
  descriptor=os.open(where/'authority_sql.stdout',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  info=os.fstat(descriptor);leaf=(where/'authority_sql.stdout').lstat()
  if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.geteuid() or info.st_nlink!=1 or info.st_size!=8388608:return 'unclassified'
  if (leaf.st_dev,leaf.st_ino)!= (info.st_dev,info.st_ino):return 'unclassified'
  last=os.fstat(descriptor);final=(where/'authority_sql.stdout').lstat();parent=where.lstat()
  if (parent.st_dev,parent.st_ino)!=parent_identity or parent.st_uid!=os.geteuid() or stat.S_IMODE(parent.st_mode)!=0o700 or not stat.S_ISDIR(parent.st_mode):return 'unclassified'
  if (final.st_dev,final.st_ino,final.st_uid,final.st_nlink,final.st_mode,final.st_size)!=(last.st_dev,last.st_ino,last.st_uid,last.st_nlink,last.st_mode,last.st_size) or not stat.S_ISREG(last.st_mode) or last.st_uid!=os.geteuid() or last.st_nlink!=1 or stat.S_IMODE(last.st_mode)!=0o600 or last.st_size!=8388608:return 'unclassified'
  return 'owned_output_at_cap'
 except Exception:return 'unclassified'
 finally:
  if descriptor is not None:os.close(descriptor)

def module(path,name):
 spec=importlib.util.spec_from_file_location(name,path);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);return v
def validate_environment(env):
 fixed={'CI':'true','EVENTFLOW_COMPATIBLE_CATALOG_HTTP_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE,'PYTHONDONTWRITEBYTECODE':'1','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix'}
 if any(env.get(k)!=v for k,v in fixed.items()) or not re.fullmatch(r'[1-9][0-9]*',env.get('GITHUB_RUN_ID','')):raise ClosedFailure('guard')
 for k,v in env.items():
  if not v:continue
  if (k.startswith('PG') and k not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}) or k.lower().endswith('_proxy') or k.startswith(('LD_','DYLD_','BASH_FUNC_','DOCKER_','COMPOSE_','PGRST_','SUPABASE_')) or k in {'BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','SHELLOPTS','BASHOPTS','PS4'}:raise ClosedFailure('guard')
  if k.startswith('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_') and k!='EVENTFLOW_COMPATIBLE_CATALOG_HTTP_ISOLATED_DB':raise ClosedFailure('guard')
def load_source(root=ROOT):
 try:
  p=root/BASE
  if p.resolve()!=p or hashlib.sha256(p.read_bytes()).hexdigest()!=BASE_SHA:raise ValueError()
  old=json.loads(p.read_text());p=root/(PREFIX+'native-closure.json')
  if p.resolve()!=p or p.stat().st_size>1048576:raise ValueError()
  new=json.loads(p.read_text())
  if set(new)!={'schema','database','baseline_schema_paths','install_paths','files'} or new['schema']!='operations-compatible-catalog-http-closure.v1' or new['database']!=DATABASE or new['baseline_schema_paths']!=old['baseline_schema_paths'] or new['install_paths']!=old['install_paths'] or len(old['files'])!=101 or set(new['files'])!=set(old['files'])|OWNED|{BASE}:raise ValueError()
  for rel,sha in new['files'].items():
   p=root/rel
   if type(rel) is not str or not re.fullmatch(r'[A-Za-z0-9_./-]+',rel) or '..' in pathlib.PurePosixPath(rel).parts or p.resolve()!=p or not p.is_file() or p.stat().st_size>33554432 or type(sha) is not str or not re.fullmatch(r'[0-9a-f]{64}',sha) or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise ValueError()
   if rel in old['files'] and sha!=old['files'][rel]:raise ValueError()
  if new['files'][BASE_RUNNER]!=BASE_RUNNER_SHA:raise ValueError()
  return new
 except Exception:raise ClosedFailure('closure') from None
def options():return "set standard_conforming_strings=on;set statement_timeout='45s';set lock_timeout='10s';set idle_in_transaction_session_timeout='50s';set eventflow.compatible_install_isolated='synthetic-disposable';set eventflow.compatible_install_fault_target='none';set eventflow.compatible_full_catalog_isolated='synthetic-disposable';set eventflow.compatible_catalog_http_isolated='synthetic-disposable';\n"
def health():
 end=time.monotonic()+15
 while time.monotonic()<end:
  connection=http.client.HTTPConnection('127.0.0.1',PORT,timeout=min(2,max(.05,end-time.monotonic())))
  try:
   connection.request('GET','/',headers={'Connection':'close'});r=connection.getresponse()
   if 200<=r.status<300 and time.monotonic()<end:return
  except (OSError,http.client.HTTPException):pass
  finally:connection.close()
  time.sleep(min(.1,max(0,end-time.monotonic())))
 raise ClosedFailure('health')
def exact_markers(path,expected):
 if path.stat().st_size>1048576 or path.read_text().splitlines()!=expected:raise ClosedFailure('http')
def owned_inspection(raw,name,label):
 if type(raw) is not str or len(raw.encode())>4096:raise ClosedFailure('docker_verify')
 match=re.fullmatch(r'"([0-9a-f]{64})" ("[^"\\]*") (\{.*\})',raw.strip())
 if not match:raise ClosedFailure('docker_verify')
 actual_name=json.loads(match.group(2));labels=json.loads(match.group(3))
 if actual_name!='/'+name or type(labels) is not dict or labels.get('eventflow.catalog-http-owner')!=label:raise ClosedFailure('docker_verify')
 return match.group(1)
def remove_private(private):
 try:
  shutil.rmtree(private)
  if os.path.lexists(private):raise ClosedFailure('cleanup')
 except Exception:raise ClosedFailure('cleanup') from None
def run_native(env):
 validate_environment(env);closure=load_source();base=module(ROOT/BASE_RUNNER,'catalog_http_frozen_full');atomic=base.module(ROOT/base.RUNNER,'catalog_http_frozen_atomic');shared=atomic.shared_module();verify=base.module(ROOT/(base.PREFIX+'verify.py'),'catalog_http_frozen_verifier')
 private=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-catalog-http-',dir='/tmp'));private.chmod(0o700);serial=0;retain=True;checkpoint='none'
 pg=dict(env,PGCONNECT_TIMEOUT='5',LC_ALL='C');psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
 name='operations-catalog-http-'+secrets.token_hex(12);label=secrets.token_hex(32);container_id=None;attempted=False
 def call(phase,command,child_env,timeout=90,stdin=None):
  nonlocal serial
  serial+=1;where=private/(str(serial)+'-'+phase);where.mkdir(mode=0o700);parent=where.lstat();parent_identity=(parent.st_dev,parent.st_ino)
  try:return shared.run_private('authority_sql',command,child_env,ROOT,where,timeout,stdin)
  except Exception as e:raise ClosedFailure(phase,e.code if type(e) is shared.ClosedFailure else 'unclassified',checkpoint if phase=='capture' else 'none',failed_child_output_reason(where,parent_identity) if phase=='capture' else 'unclassified') from None
 def sql(phase,text,child_env=pg):
  command=[sys.executable,'-I','-B',str(ROOT/(PREFIX+'wire.py'))] if phase=='capture' and checkpoint=='capture_snapshot' else psql
  return call(phase,command,child_env,90,text.encode())
 def json_line(path):
  if path.stat().st_size>8388608:raise ClosedFailure('capture',checkpoint=checkpoint)
  lines=path.read_text().splitlines()
  if len(lines)!=1:raise ClosedFailure('capture',checkpoint=checkpoint)
  return json.loads(lines[0])
 def expect_denied(statement,child_env):
  try:sql('connection',statement,child_env)
  except Exception as e:
   if type(e) is ClosedFailure and e.phase=='connection' and e.code=='42501':return
   raise ClosedFailure('connection') from None
  raise ClosedFailure('connection')
 def inspect_owned():
  path=call('docker_verify',DOCKER+['inspect','--format','{{json .Id}} {{json .Name}} {{json .Config.Labels}}',name],env,30)
  if path.stat().st_size>4096:raise ClosedFailure('docker_verify')
  return owned_inspection(path.read_text(),name,label)
 try:
  fresh="set statement_timeout='10s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') and not exists(select 1 from pg_roles where rolname<>'postgres' and rolname !~ '^pg_') and not exists(select 1 from pg_extension where extname<>'plpgsql');"
  if sql('fresh',fresh).read_text().splitlines()!=['t']:raise ClosedFailure('fresh')
  with socket.socket() as s:s.bind(('127.0.0.1',PORT))
  for path in closure['baseline_schema_paths']:sql('schema',(ROOT/path).read_text())
  for path in ['scripts/project-economy/operations-compatible-install-native-setup.sql','scripts/project-economy/operations-compatible-full-catalog-setup.sql']:sql('setup',options()+(ROOT/path).read_text())
  sql('first',options()+'begin;'+(ROOT/closure['install_paths'][0]).read_text()+'commit;')
  sql('six',options()+(ROOT/closure['install_paths'][1]).read_text())
  sql('fixture',options()+(ROOT/(PREFIX+'setup.sql')).read_text())
  password=secrets.token_urlsafe(48);secret=secrets.token_urlsafe(48)
  sql('connection',options()+'alter role '+AUTHENTICATOR+' password '+atomic.sql_string(password)+';')
  restricted=dict(pg,PGUSER=AUTHENTICATOR,PGPASSWORD=password)
  identity=json_line(sql('connection',"set statement_timeout='5s';select jsonb_build_object('session',session_user,'current',current_user,'unsafe',rolsuper or rolinherit or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls,'memberships',(select jsonb_agg(pg_get_userbyid(roleid) order by pg_get_userbyid(roleid)) from pg_auth_members where member=r.oid)) from pg_roles r where rolname=current_user;",restricted))
  if identity!={'session':AUTHENTICATOR,'current':AUTHENTICATOR,'unsafe':False,'memberships':['anon','authenticated','service_role']}:raise ClosedFailure('connection')
  expect_denied("set statement_timeout='5s';set role postgres;",restricted)
  for role in ('anon','authenticated','service_role'):
   if sql('connection',"set statement_timeout='5s';set role "+role+";select session_user||':'||current_user;",restricted).read_text().splitlines()!=[AUTHENTICATOR+':'+role]:raise ClosedFailure('connection')
  expect_denied("set statement_timeout='5s';set role authenticated;select * from public.operations_project_obligation_baselines;",restricted)
  old_cores=[('service_role',"read_scope_invoice_kernel_v1('{}'::jsonb)"),
   ('authenticated',"read_scope_invoice_capture_admin_v1('{}'::jsonb)"),
   ('authenticated',"read_scope_obligation_evidence_v1('11111111-1111-4111-8111-111111111111','large_project','cccccccc-cccc-4ccc-8ccc-cccccccccccc')"),
   ('authenticated',"read_scope_obligation_drilldown_v1('{}'::jsonb)"),
   ('service_role',"read_scope_composition_v1('11111111-1111-4111-8111-111111111111','20202020-2020-4020-8020-202020202020')"),
   ('service_role',"read_invoice_obligation_kernel_v1('{}'::jsonb)"),
   ('service_role',"read_obligation_original_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','10101010-1010-4010-8010-101010101010',repeat('a',64))"),
   ('service_role',"read_source_policy_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','10101010-1010-4010-8010-101010101010',repeat('a',64))")]
  for role,expression in old_cores:
   expect_denied("set statement_timeout='5s';set role "+role+";set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';select operations_economy_private."+expression+';',restricted)
  expect_denied("set statement_timeout='5s';set role service_role;insert into public.operations_scope_obligation_composition_heads values('11111111-1111-4111-8111-111111111111','20202020-2020-4020-8020-202020202020','SEK',99);",restricted)
  fixture=json_line(sql('fixture',options()+"select jsonb_agg(jsonb_build_object('slot',slot,'document',document) order by slot) from operations_catalog_http_fixture.capture;"))
  fixture_path=private/'fixture.json';fixture_path.write_text(json.dumps(fixture,separators=(',',':')));fixture_path.chmod(0o600)
  table_query="select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\"),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and c.relkind in ('r','p');"
  checkpoint='capture_tablelist'
  tables=json_line(sql('capture',options()+table_query))
  if type(tables) is not list or not tables or len(tables)>256 or len(set(tables))!=len(tables) or any(type(t) is not str or not re.fullmatch(r'[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*',t) for t in tables):raise ClosedFailure('capture',checkpoint=checkpoint)
  def capture():
   nonlocal checkpoint
   checkpoint='capture_snapshot'
   query=options()+'begin isolation level repeatable read read only;'+table_query+'\n'+(ROOT/(base.PREFIX+'read.sql')).read_text()+'\n'
   for t in tables:
    schema,table=t.split('.');query+="select jsonb_build_object('identity',"+atomic.sql_string(t)+",'count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate \"C\"),'[]'::jsonb)::text,'UTF8')),'hex')) from \""+schema+'"."'+table+'" t;\n'
   path=sql('capture',query+'commit;')
   if path.stat().st_size>8388608:raise ClosedFailure('capture',checkpoint=checkpoint)
   lines=path.read_text().splitlines()
   if len(lines)!=len(tables)+2 or json.loads(lines[0])!=tables:raise ClosedFailure('capture',checkpoint=checkpoint)
   metadata=verify.parse(lines[1]);business=[json.loads(s) for s in lines[2:]]
   if [r.get('identity') for r in business]!=tables or any(set(r)!={'identity','count','sha256'} or type(r['count']) is not int or not 0<=r['count']<=10000 or type(r['sha256']) is not str or not re.fullmatch(r'[0-9a-f]{64}',r['sha256']) for r in business):raise ClosedFailure('capture',checkpoint=checkpoint)
   return metadata,business
  before,business=capture()
  budget=call('budget',['deno','test','--no-config',str(ROOT/(PREFIX+'journey.test.ts'))],env,90)
  if '8 passed | 0 failed' not in budget.read_text():raise ClosedFailure('budget')
  file=private/'postgrest.env';file.write_text('PGRST_DB_URI=postgresql://'+AUTHENTICATOR+':'+password+'@127.0.0.1:5432/'+DATABASE+'\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET='+secret+'\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT='+str(PORT)+'\nPGRST_DB_POOL=4\nPGRST_DB_POOL_ACQUISITION_TIMEOUT=5\n');file.chmod(0o600)
  attempted=True
  created=call('docker_create',DOCKER+['create','--name',name,'--label','eventflow.catalog-http-owner='+label,'--network','host','--env-file',str(file),'postgrest/postgrest:v12.2.3'],env,90).read_text().strip()
  if not re.fullmatch(r'[0-9a-f]{64}',created):raise ClosedFailure('docker_verify')
  container_id=created
  if inspect_owned()!=container_id:raise ClosedFailure('docker_verify')
  call('docker_start',DOCKER+['start',container_id],env,30)
  if inspect_owned()!=container_id:raise ClosedFailure('docker_verify')
  version=call('docker_verify',DOCKER+['exec',container_id,'postgrest','--version'],env,30)
  if version.stat().st_size>256 or not re.fullmatch(r'PostgREST 12\.2\.3(?: \([0-9a-f]{7}\))?\n?',version.read_text()):raise ClosedFailure('docker_verify')
  health()
  deno_env=dict(env,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_BASE_URL='http://127.0.0.1:'+str(PORT)+'/',EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET=secret,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_FIXTURE_FILE=str(fixture_path))
  deno=['deno','run','--no-config','--allow-net=127.0.0.1:'+str(PORT),'--allow-read='+str(fixture_path),'--allow-env=CI,PGDATABASE,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_ISOLATED_DB,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_BASE_URL,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_FIXTURE_FILE,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_CONTROL',str(ROOT/(PREFIX+'journey.ts'))]
  exact_markers(call('http',deno,deno_env,240),HTTP_MARKERS)
  after,rows=capture();verify.unchanged(before,after);verify.unchanged(business,rows)
  saved_admin=json_line(sql('control',options()+"select to_jsonb(r) from public.user_roles r where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';"))
  controls=[('gate_disabled',"update public.operations_scope_invoice_kernel_read_gates set enabled=false where organization_id='11111111-1111-4111-8111-111111111111';","update public.operations_scope_invoice_kernel_read_gates set enabled=true where organization_id='11111111-1111-4111-8111-111111111111';"),
   ('admin_removed',"delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';","insert into public.user_roles select * from jsonb_populate_record(null::public.user_roles,"+atomic.sql_string(json.dumps(saved_admin,separators=(',',':')))+'::jsonb);'),
   ('profile_foreign',"update public.profiles set organization_id='88888888-8888-4888-8888-888888888888' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';","update public.profiles set organization_id='11111111-1111-4111-8111-111111111111' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';")]
  for kind,change,restore in controls:
   sql('control',options()+'begin;'+change+'commit;');exact_markers(call('control',deno,dict(deno_env,EVENTFLOW_COMPATIBLE_CATALOG_HTTP_CONTROL=kind),90),[CONTROL_MARKERS[kind]])
   sql('restore',options()+'begin;'+restore+'commit;');after,rows=capture();verify.unchanged(before,after);verify.unchanged(business,rows)
  exact_markers(call('http',deno,deno_env,240),HTTP_MARKERS)
  after,rows=capture();verify.unchanged(before,after);verify.unchanged(business,rows)
  retain=False
 finally:
  if attempted:
   try:
    actual=inspect_owned()
    if container_id is not None and actual!=container_id:raise ClosedFailure('cleanup')
    call('cleanup',DOCKER+['rm','--force',actual],env,30)
    found=call('cleanup',DOCKER+['ps','--all','--filter','label=eventflow.catalog-http-owner='+label,'--format','{{.ID}}'],env,30).read_text().strip()
    if found:raise ClosedFailure('cleanup')
   except Exception:retain=True;raise ClosedFailure('cleanup') from None
  if not retain:
   remove_private(private)
 return ['operations-compatible-catalog-http-native PASS restricted_live_connection_roles_no_elevated_bypass',
 'operations-compatible-catalog-http-native PASS exact8_and_absence_denials18_controls3_full56_table_state_restored',
 'operations-compatible-catalog-http-native PASS cleanup_finite_fixture_only_no_provider_source_admission']
def main(env=None):
 try:
  for line in run_native(dict(os.environ if env is None else env)):print(line)
  return 0
 except Exception as e:
  phase=e.phase if type(e) is ClosedFailure else 'guard';code=e.code if type(e) is ClosedFailure else 'unclassified'
  checkpoint=e.checkpoint if type(e) is ClosedFailure else 'none';reason=e.reason if type(e) is ClosedFailure else 'unclassified'
  print('operations-compatible-catalog-http-native FAIL '+phase+' SQLSTATE='+code+' CHECKPOINT='+checkpoint+' REASON='+reason);return 1
if __name__=='__main__':sys.exit(main())
