#!/usr/bin/env python3
"""NEW TEST ONLY actual PG15/PostgREST grant writer; no source export."""
import base64
import hashlib
import hmac
import http.client
import importlib.util
import json
import os
import pathlib
import re
import secrets
import shutil
import signal
import socket
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
DATABASE='eventflow_scope_product_publication_runtime'
COMMIT='72a25cd991f69712eb031e46a25f3eabf1e6f6aa'
SHARED_SHA='cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
RESOURCE_PATH='scripts/project-economy/operations-whole-scope-product-publication-native.py'
RESOURCE_SHA='205475706556958ea038aacbeb2fd94ab93115b8e93f144e0ae3bc57feae444f'
SQLSTATES={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES={'guard','closure','fresh','schema','fixture','lexical','role','parity','setup','docker','ready','case','cleanup','proof',*('case_'+str(i) for i in range(8))}
FIXED={'CI':'true','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','EVENTFLOW_WHOLE_SCOPE_GRANT_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
# Literal catalogs are sealed below after exact genuine D954 inventory matching.
SOURCE_PATHS=('docs/project-economy/whole-scope-product-grant-writer-source-v1-notes.md', 'scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-obligation-fixture.ts', 'scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'scripts/project-economy/operations-transport-seed.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native-bootstrap.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native-setup.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native.py', 'scripts/project-economy/whole-scope-product-grant-caller-controls.ts', 'scripts/project-economy/whole-scope-product-grant-event-sql-parity.ts', 'scripts/project-economy/whole-scope-product-grant-writer-postgres-test.sql', 'supabase/functions/_shared/finance-project-invoice-destination.ts', 'supabase/functions/_shared/finance-project-invoice.ts', 'supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts', 'supabase/functions/_shared/project-cost-obligation-authority.ts', 'supabase/functions/_shared/project-cost-obligations.ts', 'supabase/functions/_shared/project-operational-eac.ts', 'supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts', 'supabase/functions/_shared/whole-scope-product-grant-command-v1.deno-test.ts', 'supabase/functions/_shared/whole-scope-product-grant-command-v1.ts', 'supabase/functions/_shared/whole-scope-product-grant-event-v1.deno-test.ts', 'supabase/functions/_shared/whole-scope-product-grant-event-v1.ts', 'supabase/functions/_shared/whole-scope-product-source-proof.ts', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql', 'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql', 'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql', 'supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql', 'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql', 'supabase/migrations/20261002180958_operations_whole_scope_export_grant_v1.sql')
OWNED_PATHS=('docs/project-economy/whole-scope-grant-native-proof-v1.md', 'scripts/project-economy/operations-whole-scope-grant-native-cases.py', 'scripts/project-economy/operations-whole-scope-grant-native-guard-test.py', 'scripts/project-economy/operations-whole-scope-grant-native-runner.py', 'scripts/project-economy/operations-whole-scope-grant-native-setup.sql')
SCHEMA_PATHS=('scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql', 'scripts/project-economy/operations-transport-seed.sql')
EXTRA_SCHEMA=('supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql','supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql','supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql','supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql')
GRANT_DDL='supabase/migrations/20261002180958_operations_whole_scope_export_grant_v1.sql'

class Failure(Exception):
 def __init__(self,phase,code='unclassified',retain=False):
  self.phase=phase if type(phase) is str and phase in PHASES else 'guard';self.code=code if type(code) is str and code in SQLSTATES else 'unclassified';self.retain=retain is True
  super().__init__('closed_grant_native_failure')

def closed(error,phase,resource_type=None,case_type=None):
 # Only exact reviewed classes have plain owned attributes. Unknown exceptions
 # and subclasses are never reflected, stringified, or asked for properties.
 kind=type(error)
 if kind is Failure or (resource_type is not None and kind is resource_type):
  facts=object.__getattribute__(error,'__dict__')
  return Failure(phase if kind is not Failure else facts['phase'],facts['code'],facts['retain'])
 if case_type is not None and kind is case_type:
  case=object.__getattribute__(error,'__dict__')['case']
  return Failure('case_'+str(case) if type(case) is int and 0<=case<8 else phase)
 return Failure(phase)

def guard(env):
 if any(env.get(k)!=v for k,v in FIXED.items()) or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise Failure('guard')
 for key,value in env.items():
  if not value:continue
  if key.startswith('PG') and key not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}:raise Failure('guard')
  if key.startswith(('PGRST_','SUPABASE_','COMPOSE_','DOCKER_','DENO_','LD_','DYLD_','BASH_FUNC_')):raise Failure('guard')
  if key.upper() in {'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','NODE_OPTIONS','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES'} or key in {'BASH_ENV','ENV','SHELLOPTS','BASHOPTS','PS4','PYTHONINSPECT'}:raise Failure('guard')
  if key.startswith('EVENTFLOW_') and key!='EVENTFLOW_WHOLE_SCOPE_GRANT_ISOLATED_DB':raise Failure('guard')
 if not isinstance(env.get('PGPASSWORD'),str) or not re.fullmatch(r'[A-Za-z0-9_\-]{16,128}',env['PGPASSWORD']):raise Failure('guard')
 return 'scope-grant-'+env['GITHUB_RUN_ID']

def load(path):
 spec=importlib.util.spec_from_file_location('scope_grant_'+path.stem.replace('-','_'),path)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def closure():
 try:
  path=HERE/'operations-whole-scope-grant-native-closure.json'
  if ROOT.resolve()!=ROOT or path.resolve()!=path:raise ValueError()
  d=json.loads(path.read_text())
  if set(d)!={'schema','database','commit','ordered_schema_paths','files','owned_paths','provenance'} or d['schema']!='operations-whole-scope-grant-native-closure.v1' or d['database']!=DATABASE or d['commit']!=COMMIT:raise ValueError()
  if tuple(sorted(d['files']))!=SOURCE_PATHS or tuple(sorted(d['owned_paths']))!=OWNED_PATHS or tuple(d['ordered_schema_paths'])!=SCHEMA_PATHS or set(d['files'])&set(d['owned_paths']):raise ValueError()
  for relative,expected in (d['files']|d['owned_paths']).items():
   p=ROOT/relative
   if relative.startswith('/') or '..' in pathlib.PurePosixPath(relative).parts or p.resolve()!=p or not p.is_file() or set(expected)!={'sha256','git_blob','size'}:raise ValueError()
   data=p.read_bytes()
   if len(data)!=expected['size'] or hashlib.sha256(data).hexdigest()!=expected['sha256']:raise ValueError()
   if expected['git_blob'] is not None and hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=expected['git_blob']:raise ValueError()
  if len(SCHEMA_PATHS)!=23 or len(set(SCHEMA_PATHS))!=23 or not all(p in d['files'] for p in SCHEMA_PATHS):raise ValueError()
  helper=HERE/'operations-hired-personnel-native.py'
  if helper.resolve()!=helper or not helper.is_file():raise ValueError()
  if hashlib.sha256((ROOT/RESOURCE_PATH).read_bytes()).hexdigest()!=RESOURCE_SHA or hashlib.sha256(helper.read_bytes()).hexdigest()!=SHARED_SHA:raise ValueError()
  resource=load(ROOT/RESOURCE_PATH);shared=load(HERE/'operations-hired-personnel-native.py');return d,resource,shared
 except (OSError,ValueError,TypeError,KeyError,ImportError):raise Failure('closure') from None

def native_http(native,command,status,timeout_seconds=15):
 request=urllib.request.Request('http://127.0.0.1:55651/rpc/write_operations_whole_scope_product_export_grant_v1',data=json.dumps({'p_command':command},ensure_ascii=False,allow_nan=False).encode(),headers={'Authorization':'Bearer '+native.jwt,'Content-Type':'application/json'},method='POST')
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*_args,**_kwargs):return None
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect());deadline=time.monotonic()+timeout_seconds
 try:response=opener.open(request,timeout=timeout_seconds)
 except urllib.error.HTTPError as error:response=error
 with response:
  if response.status!=status:raise Failure('case')
  body=response.fp if isinstance(response,urllib.error.HTTPError) else response
  if not isinstance(body,http.client.HTTPResponse):raise Failure('case')
  chunks=[];size=0
  for _ in range(256):
   if time.monotonic()>=deadline:raise Failure('case')
   if body.fp is None:break
   body.fp.raw._sock.settimeout(max(.01,deadline-time.monotonic()));chunk=body.read1(1024)
   if not chunk:break
   chunks.append(chunk);size+=len(chunk)
   if size>16384:raise Failure('case')
  else:raise Failure('case')
 if time.monotonic()>=deadline:raise Failure('case')
 decoded=b''.join(chunks).decode('utf-8','strict')
 if time.monotonic()>=deadline:raise Failure('case')
 value=json.loads(decoded)
 if time.monotonic()>=deadline or type(value) is not dict:raise Failure('case')
 if time.monotonic()>=deadline:raise Failure('case')
 return value

def execute(env):
 namespace=guard(env);manifest,resource,shared=closure()
 with socket.socket() as probe:
  try:probe.bind(('127.0.0.1',55651))
  except OSError:raise Failure('guard') from None
 private=pathlib.Path(tempfile.mkdtemp(prefix='scope-grant-native-'));private.chmod(0o700)
 native=resource.Native(env,private,shared);docker=resource.OwnedDocker(native,namespace);retain=False;proof=None;phase='guard'
 sql=lambda value:native.sql_file("set test.whole_scope_export_grant_isolated='synthetic-disposable';\n"+value)
 try:
  version=native.process(['deno','--version'],timeout=10)
  if version.read_text().splitlines()[0]!='deno 2.8.1 (stable, release, x86_64-unknown-linux-gnu)':raise Failure('guard')
  phase='fresh';fresh=native.run("select jsonb_build_object('fresh',current_database()='"+DATABASE+"' and current_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')));")
  if fresh!={'fresh':True}:raise Failure('fresh')
  phase='schema';sql('\n'.join((ROOT/p).read_text() for p in manifest['ordered_schema_paths']));sql((HERE/'operations-whole-scope-product-publication-native-bootstrap.sql').read_text())
  for p in EXTRA_SCHEMA:sql((ROOT/p).read_text())
  phase='fixture';out=native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm',str(HERE/'operations-obligation-fixture.ts')]);fixture=json.loads(out.read_text());raw=json.dumps(fixture,ensure_ascii=False,allow_nan=False);literal="'"+raw.replace("'","''")+"'"
  setup=(HERE/'operations-whole-scope-product-publication-native-setup.sql').read_text()
  if setup.count(":'fixture'")!=1:raise Failure('fixture')
  sql(setup.replace(":'fixture'",literal))
  phase='lexical';generator=str(HERE/'whole-scope-product-grant-caller-controls.ts')
  for stage in ('predecessor','successor'):
   target=private/('grant-'+stage+'-caller-controls.sql');native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm','--allow-read='+str(ROOT)+','+str(private),'--allow-write='+str(private),generator,stage,str(target)])
  sql((private/'grant-predecessor-caller-controls.sql').read_text());sql((ROOT/GRANT_DDL).read_text());sql((private/'grant-successor-caller-controls.sql').read_text())
  phase='role';out=sql((HERE/'whole-scope-product-grant-writer-postgres-test.sql').read_text());rows=[json.loads(line) for line in out.read_text().splitlines() if line.startswith('[')]
  if len(rows)!=1 or not isinstance(rows[0],list) or len(rows[0])!=4:raise Failure('role')
  vectors=private/'grant-vectors.json';vectors.write_text(json.dumps(rows[0],ensure_ascii=False,allow_nan=False));vectors.chmod(0o600)
  phase='parity';out=native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm','--allow-read='+str(private),str(HERE/'whole-scope-product-grant-event-sql-parity.ts'),str(vectors)])
  if out.read_text().splitlines()!=['PASS whole_scope_grant_event_actual_sql_parity4_metadata_only']:raise Failure('parity')
  phase='setup';sql((HERE/'operations-whole-scope-grant-native-setup.sql').read_text())
  secret=secrets.token_urlsafe(48);settings={'PGRST_DB_URI':'postgres://postgres:'+urllib.parse.quote(env['PGPASSWORD'],safe='')+'@127.0.0.1:5432/'+DATABASE,'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':secret,'PGRST_SERVER_HOST':'127.0.0.1','PGRST_SERVER_PORT':'55651'}
  envfile=private/'postgrest.env';envfile.write_text('\n'.join(k+'='+v for k,v in settings.items())+'\n');envfile.chmod(0o600);phase='docker';docker.start(envfile)
  encode=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=');token=encode(b'{"alg":"HS256","typ":"JWT"}')+b'.'+encode(json.dumps({'role':'authenticated','sub':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','exp':int(time.time())+900},separators=(',',':')).encode());native.jwt=(token+b'.'+encode(hmac.new(secret.encode(),token,hashlib.sha256).digest())).decode()
  phase='ready';deadline=time.monotonic()+30;ready=False
  while time.monotonic()<deadline:
   try:
    if native_http(native,{},400,min(1,max(.01,deadline-time.monotonic()))).get('code')=='22023':ready=True;break
   except Exception:pass
   time.sleep(.1)
  if not ready:raise Failure('ready')
  phase='case';cases=load(HERE/'operations-whole-scope-grant-native-cases.py');subject=cases.Cases(native.run,native.start,native.wait,native.finish,lambda cmd,status:native_http(native,cmd,status))
  try:proof=subject.run_all()
  except Exception as error:raise closed(error,'case_'+str(min(len(subject.done),7)),resource.Failure,cases.CaseFailure) from None
  if proof!=cases.MARKERS:raise Failure('proof')
 except Exception as error:
  failure=closed(error,phase,resource.Failure)
  retain=failure.retain
  raise failure from None
 finally:
  failed=False
  try:native.cleanup()
  except Exception:failed=True
  try:docker.cleanup()
  except Exception:failed=True
  if failed:raise Failure('cleanup',retain=True)
  if not retain:shutil.rmtree(private)
 print('scope-grant-native PASS exact_actual_caller9_roles_event_parity4')
 for marker in proof:print(marker)

def main():
 def interrupted(_signal,_frame):raise Failure('cleanup',retain=True)
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:execute(dict(os.environ))
 except Exception as error:
  failure=closed(error,'case')
  print('scope-grant-native FAIL '+failure.phase+' SQLSTATE='+failure.code,file=sys.stderr);return 1
 return 0

if __name__=='__main__':sys.exit(main())
