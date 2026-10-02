#!/usr/bin/env python3
"""NEW isolated containing-owner regression; no product/hosted writes or activation."""
import concurrent.futures
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
import time

HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
FLAG='EVENTFLOW_REMAINING_SIX_OWNER_ISOLATED_DB'
DATABASES={'operations_hired_authority_runtime':'hired','eventflow_own_credit_remaining_six':'credit','eventflow_own_credit_capacity_remaining_six':'capacity'}
ORG='11111111-1111-4111-8111-111111111111'
ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
PROJECT='55555555-5555-4555-8555-555555555555'
OBLIGATION='abababab-abab-4aba-8aba-abababababab'
BASE_PATH='scripts/project-economy/remaining-six-compatible-reader-native.py'
PHASES={'guard','source','fresh','schema','generator','original_fixture','candidate','candidate_fixture','owner_setup','owner_commands','reverse','legacy_concurrency','cleanup','proof'}
OWN=('scripts/project-economy/remaining-six-containing-owner-native.py','scripts/project-economy/remaining-six-containing-owner-native.guard.test.py','scripts/project-economy/remaining-six-containing-owner-native-state.sql','scripts/project-economy/remaining-six-containing-owner-native-commands.sql','scripts/project-economy/remaining-six-containing-owner-native-bootstrap.sql')
FIXTURES=('operations-hired-personnel-authority-postgres-test.sql','operations-hired-personnel-native-fixture.ts','operations-hired-personnel-native-setup.sql','operations-hired-personnel-native-concurrency.sh','operations-own-credit-assignment-postgres-test.sql','operations-own-credit-native-setup.sql','operations-own-credit-native-concurrency.sh','operations-credit-capacity-postgres-test.sql','operations-credit-capacity-native-setup.sql','operations-credit-capacity-native-concurrency.sh')
EXPECTED={
 'hired':('publisher_first_stale_assignment_lock','permanent_owner_contender_lock','assignment_first_withdrawal_lock_history','actual_gate_revoke_lock_denial','actual_project_revoke_lock_denial','immutable_source_invoice_history_no_eac'),
 'credit':('actual_auth_credit_v1_absent_head_blocked','actual_auth_original_v2_absent_head_blocked','actual_auth_simultaneous_CAS_one_event'),
 'capacity':('actual_two_credit_competing_reservations_no_overcap','actual_source_correction_serialized_retained_reservation')}
OWNER_DELTAS={
 'public.operations_obligation_source_policies':1,'public.operations_obligation_source_policy_heads':1,
 'public.operations_project_scope_heads':1,'public.operations_project_scope_member_ownership':3,
 'public.operations_project_scope_snapshots':1,'public.operations_scope_obligation_baseline_captures':1,
 'public.operations_scope_obligation_composition_heads':1,'public.operations_scope_obligation_compositions':1,
 'public.operations_scope_obligation_ownership':1}
CODES={'22023','42501','55000','55P03','57014','40001','PT409','22P02','25P02','40P01'}
class Refusal(Exception):
 pass
class NativeFailure(Exception):
 def __init__(self,phase,code):
  self.phase=phase if type(phase) is str and phase in PHASES else 'unclassified'
  self.code=code if type(code) is str and code in CODES else 'unclassified'

def guard(env):
 required={'CI':'true',FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix'}
 if any(env.get(k)!=v for k,v in required.items()) or env.get('PGDATABASE') not in DATABASES or not re.fullmatch('[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise Refusal('guard')
 for k,v in env.items():
  if not v:continue
  if k.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'} or k.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_','LD_')) or k.startswith('PG') and k not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'} or k in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','NODE_USE_ENV_PROXY','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','SHELLOPTS','BASHOPTS','PS4'}:raise Refusal('guard')
  if k.startswith('EVENTFLOW_') and k not in {FLAG}:raise Refusal('guard')
 return DATABASES[env['PGDATABASE']]
def load_source():
 p=HERE/'remaining-six-containing-owner-native-closure.json'
 if p.resolve()!=p:raise Refusal('source')
 value=json.loads(p.read_text())
 if set(value)!={'schema','source_commit','ordered_schema_paths','files','tables'} or value['schema']!='remaining-six-containing-owner-closure.v1' or value['source_commit']!='91ee5b68d76d078941e99f9fc09436ca4dd642a6' or len(value['ordered_schema_paths'])!=27 or len(value['tables'])!=62 or len(set(value['tables']))!=62:raise Refusal('source')
 expected=set(value['ordered_schema_paths'])|set(OWN)|{BASE_PATH,'scripts/project-economy/operations-hired-personnel-native.py','scripts/project-economy/operations-fixture.ts','scripts/project-economy/operations-obligation-fixture.ts','scripts/project-economy/operations-transport-seed.sql','supabase/functions/_shared/project-personnel-cost.ts','supabase/functions/_shared/hired-personnel-authority.ts','supabase/functions/_shared/project-cost-obligation-authority.ts','supabase/functions/_shared/finance-project-invoice.ts','supabase/functions/_shared/finance-project-invoice-destination.ts','supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql'}|{'scripts/project-economy/'+f for f in FIXTURES}
 if not isinstance(value['files'],dict) or set(value['files'])!=expected:raise Refusal('source')
 for name,digest in value['files'].items():
  if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest):raise Refusal('source')
  q=ROOT/name
  if q.resolve()!=q or not q.is_file() or not q.is_relative_to(ROOT) or hashlib.sha256(q.read_bytes()).hexdigest()!=digest:raise Refusal('source')
 spec=importlib.util.spec_from_file_location('remaining_six_owner_resource_base',ROOT/BASE_PATH);base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
 if tuple(value['ordered_schema_paths'])!=base.SCHEMA:raise Refusal('source')
 return value,base
def state(value,tables):
 if not isinstance(value,dict) or set(value)!={'schema','tables'} or value['schema']!='remaining-six-owner-state.v1' or not isinstance(value['tables'],list) or len(value['tables'])!=62:raise Refusal('state')
 result={}
 for row in value['tables']:
  if not isinstance(row,dict) or set(row)!={'name','count','fingerprint'} or not isinstance(row['name'],str) or row['name'] in result or type(row['count']) is not int or not 0<=row['count']<=1000 or not isinstance(row['fingerprint'],str) or not re.fullmatch('[0-9a-f]{64}',row['fingerprint']):raise Refusal('state')
  result[row['name']]={'count':row['count'],'fingerprint':row['fingerprint']}
 if set(result)!=set(tables):raise Refusal('state')
 return result
def unchanged(before,after,allowed=()):
 if set(before)!=set(after) or any(before[n]!=after[n] for n in before if n not in allowed):raise Refusal('state')
def owner_metadata(before,after):
 # Genuine 14937 includes two live source projects sharing Legacy-Order-42 and one booking.
 unchanged(before,after,OWNER_DELTAS)
 if not set(OWNER_DELTAS).issubset(before):raise Refusal('state')
 for name,delta in OWNER_DELTAS.items():
  if after[name]['count']!=before[name]['count']+delta:raise Refusal('state')
def script_markers(mode,output):
 prefix='operations-'+{'hired':'hired','credit':'own-credit','capacity':'credit-capacity'}[mode]+'-native PASS '
 actual=[s[len(prefix):] for s in output.splitlines() if s.startswith(prefix)]
 if tuple(actual)!=EXPECTED[mode] or len(set(actual))!=len(actual):raise Refusal('proof')
 return actual
def literal(value):return "'"+json.dumps(value,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
def make_harness(base,env,private,manifest):
 class OwnerHarness(base.Harness):
  def run(self,phase,cmd,body=None,seconds=30,extra=None):
   with self.index_lock:
    self.index+=1;d=self.private/(str(self.index).zfill(4)+'-'+phase);d.mkdir(mode=0o700)
   child=dict(self.env,PGCONNECT_TIMEOUT='3',PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=18000 -c test.remaining_six_owner_isolated=synthetic-disposable -c test.hired_personnel_isolated=synthetic-disposable -c eventflow.own_credit_isolated=synthetic-disposable -c eventflow.credit_capacity_isolated=synthetic-disposable')
   if extra:child.update(extra)
   if cmd[0]=='bash' and cmd[1] in {str(HERE/f) for f in FIXTURES if f.endswith('.sh')}:
    # Genuine old shell guards reject ambient PGOPTIONS and set their own budgets.
    child.pop('PGOPTIONS',None)
   try:return self.shared.run_private('authority_sql',cmd,child,ROOT,d,seconds,body)
   except self.shared.ClosedFailure as e:raise base.Failure(phase,e.code,e.retain_private) from None
  def state(self):
   raw=self.sql('state',(HERE/'remaining-six-containing-owner-native-state.sql').read_text())
   if len(raw.encode())>262144:raise Refusal('state')
   return state(json.loads(raw),manifest['tables'])
  def observe(self,name,wait=None,held_type=None):
   if not re.fullmatch('[a-z0-9_]{1,63}',name):raise Refusal('observer')
   pred="datname=current_database() and application_name='"+name+"'"
   if wait=='held':pred+=" and wait_event='PgSleep'"
   elif wait=='lock':pred+=" and wait_event_type='Lock'"
   if held_type=='advisory':pred+=" and exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.granted and l.locktype='advisory' and l.mode='ExclusiveLock')"
   raw=self.sql('observer','select coalesce((select pid from pg_stat_activity where '+pred+'),0);',5).strip()
   if not re.fullmatch('[0-9]{1,10}',raw):raise Refusal('observer')
   return int(raw)
 return OwnerHarness(env,private,base.shared_module())
def fixtures(h):
 values={}
 for name in ['operations-fixture.ts','operations-obligation-fixture.ts']:
  raw=h.run('generator',['deno','run','--cached-only',str(HERE/name)],seconds=90).read_text()
  if len(raw.encode())>262144:raise Refusal('generator')
  values[name]=json.loads(raw)
 return values
def original_sql(h,mode,values):
 prefix=''
 if mode=='hired':
  p=HERE/'operations-hired-personnel-authority-postgres-test.sql'
  raw=json.dumps({'personnel':values['operations-fixture.ts'],'obligation':values['operations-obligation-fixture.ts']},ensure_ascii=False,separators=(',',':'))
  prefix="select set_config('test.hired_personnel_fixture','"+raw.replace("'","''")+"',false)\\g /dev/null\n"
  source=p.read_text()
 else:
  p=HERE/('operations-own-credit-assignment-postgres-test.sql' if mode=='credit' else 'operations-credit-capacity-postgres-test.sql')
  source=p.read_text()
  if source.count(":'fixture'")!=1:raise Refusal('source')
  source=source.replace(":'fixture'",literal(values['operations-obligation-fixture.ts']))
 before=h.state();out=h.sql('direct',prefix+source,90)
 if not any(s.startswith('PASS ') for s in out.splitlines()):raise Refusal('proof')
 unchanged(before,h.state())
def setup(h,mode,values):
 if mode=='hired':
  # Actual generator verifies frozen raw Time snapshots; no supplied cost fixture.
  paths=[]
  for key in ['operations-fixture.ts','operations-obligation-fixture.ts']:
   p=h.private/(key+'.json');fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
   with os.fdopen(fd,'w') as f:f.write(json.dumps(values[key],ensure_ascii=False,separators=(',',':')))
   paths.append(str(p))
  raw=h.run('generator',['deno','run','--cached-only','--allow-read='+str(h.private),str(HERE/'operations-hired-personnel-native-fixture.ts'),*paths],seconds=90).read_text()
  if len(raw.encode())>262144:raise Refusal('generator')
  fixture=json.loads(raw);p=HERE/'operations-hired-personnel-native-setup.sql'
 else:fixture=values['operations-obligation-fixture.ts'];p=HERE/'operations-own-credit-native-setup.sql'
 source=p.read_text()
 if source.count(":'fixture'")!=1:raise Refusal('source')
 h.sql('fixture',source.replace(":'fixture'",literal(fixture)),90)
 if mode=='capacity':h.sql('fixture',(HERE/'operations-credit-capacity-native-setup.sql').read_text(),90)
def reader_reverse(h,base):
 anchor=h.sql('selectors',"select source_anchor from public.operations_project_obligation_invoice_bindings where organization_id='"+ORG+"' and obligation_id='"+OBLIGATION+"';").strip()
 if not re.fullmatch('[0-9a-f]{64}',anchor):raise Refusal('selectors')
 records=[]
 for family in ['original','policy']:
  call="public.read_operations_obligation_"+('original' if family=='original' else 'source_policy')+"_v1('"+ORG+"','"+PROJECT+"','"+OBLIGATION+"','"+anchor+"')"
  name='remaining_six_owner_'+family;writer_name=name+'_writer';before=h.state()
  hold="begin;set local role service_role;select "+call+";do $$begin perform pg_sleep(8);exception when query_canceled then null;end$$;rollback;"
  replay="begin;set local role service_role;do $$declare r jsonb;begin r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_hired_native',floor(extract(epoch from clock_timestamp()))::bigint::text,'remaining_owner_reverse_"+family+"',(select raw_body from public.operations_finance_invoice_snapshots where invoice_id='23232323-2323-4232-8232-232323232323' and source_revision=1));if r->>'outcome' is distinct from 'replayed' or r->>'requested_source_revision' is distinct from '1' or r->>'current_source_revision' is distinct from '1' then raise exception 'actual_bound_replayed_receipt_required';end if;end$$;commit;select 'remaining-six-owner-writer PASS';"
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   holder=pool.submit(h.sql,'holder',hold,15,{'PGAPPNAME':name});writer=None;pid=None
   try:
    pid=h.await_observation(name,'held','advisory')
    writer=pool.submit(h.sql,'reader',replay,15,{'PGAPPNAME':writer_name})
    writer_pid=h.await_observation(writer_name,'lock')
    if not h.observe(name,'held','advisory') or not writer_pid:raise Refusal('observer')
   finally:h.finish_holder(name,pid,holder,writer)
  if writer is None or 'remaining-six-owner-writer PASS' not in writer.result().splitlines() or h.observe(writer_name):raise Refusal('cleanup')
  after=h.state();unchanged(before,after,{'public.operations_finance_invoice_receipts'})
  if after['public.operations_finance_invoice_receipts']['count']!=before['public.operations_finance_invoice_receipts']['count']+1:raise Refusal('state')
  records.append('public_'+family+'_reader_first_actual_receiver_wait_money_neutral')
 return records
def execute(env):
 mode=guard(env);manifest,base=load_source();private=pathlib.Path(tempfile.mkdtemp(prefix='remaining-six-owner-'));private.chmod(0o700);retain=False;phase='fresh';records=[]
 h=make_harness(base,env,private,manifest)
 try:
  h.boolean('fresh',"select current_database()='"+env['PGDATABASE']+"' and current_user='postgres' and session_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_setting('server_version_num')='150019' and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p','v','m')) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth'));" )
  phase='generator';version=h.run('generator',['deno','--version']).read_text().splitlines()
  if not version or version[0]!='deno 2.8.1 (stable, release, x86_64-unknown-linux-gnu)':raise Refusal('generator')
  phase='schema'
  for path in manifest['ordered_schema_paths']:
   if path.endswith('20261002130228_operations_scope_invoice_compatible_read_entry.sql'):h.sql('schema',(HERE/'remaining-six-containing-owner-native-bootstrap.sql').read_text())
   h.sql('schema',(ROOT/path).read_text(),60)
  if mode=='hired':h.sql('schema',(HERE/'operations-transport-seed.sql').read_text())
  actual=json.loads(h.sql('source',"select json_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\") from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public') and c.relkind='r';"))
  if actual!=manifest['tables']:raise Refusal('source')
  phase='generator';values=fixtures(h)
  phase='original_fixture';original_sql(h,mode,values);records.append('original_containing_owner_fixture')
  phase='candidate';h.sql('candidate',(ROOT/'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql').read_text(),60)
  phase='candidate_fixture';original_sql(h,mode,values);records.append('candidate_containing_owner_fixture_after_core_revoke')
  phase='owner_setup';setup(h,mode,values)
  if mode=='hired':
   phase='owner_commands';before=h.state();output=h.sql('direct',(HERE/'remaining-six-containing-owner-native-commands.sql').read_text())
   if output.splitlines()!=['remaining-six-owner PASS actual_policy_compose_nested_owner_commands']:raise Refusal('proof')
   after=h.state();owner_metadata(before,after)
   records.append('actual_policy_compose_nested_owner_commands_money_neutral')
   phase='reverse';records+=reader_reverse(h,base)
  phase='legacy_concurrency';script=HERE/('operations-hired-personnel-native-concurrency.sh' if mode=='hired' else 'operations-own-credit-native-concurrency.sh' if mode=='credit' else 'operations-credit-capacity-native-concurrency.sh')
  internal={'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB':'true'} if mode=='hired' else {'EVENTFLOW_OWN_CREDIT_ISOLATED_DB':'true','EVENTFLOW_CREDIT_CAPACITY_ISOLATED_DB':'true'}
  records+=script_markers(mode,h.run('holder',['bash',str(script)],seconds=180,extra=internal).read_text())
  phase='cleanup';h.boolean('cleanup',"select not exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend');")
  expected=11 if mode=='hired' else 5 if mode=='credit' else 4
  if len(records)!=expected or len(set(records))!=expected:raise Refusal('proof')
  phase='proof';p=private/'proof.json';fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as f:json.dump({'mode':mode,'cases':records,'scope':'genuine fixture owner/observed read only; no activation/fullcatalog/fourth'},f)
 except base.Failure as e:
  if type(e) is base.Failure:
   retain=e.retain is not False
   raise NativeFailure(phase,e.code) from None
  retain=True
  raise NativeFailure('unclassified','unclassified') from None
 except BaseException:
  raise Refusal(phase) from None
 finally:
  if not retain:shutil.rmtree(private)
 for label in records:print('remaining-six-containing-owner-native PASS '+mode+' '+label)
 print('remaining-six-containing-owner-native PASS '+mode+' genuine_owner_reverse_immutable_money_cleanup')
def main():
 def interrupted(_signal,_frame):raise Refusal('guard')
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 if len(sys.argv)!=1:print('remaining-six-containing-owner-native FAIL guard');return 1
 try:execute(dict(os.environ))
 except Refusal as e:
  phase=e.args[0] if type(e) is Refusal and len(e.args)==1 and type(e.args[0]) is str and e.args[0] in PHASES else 'unclassified'
  print('remaining-six-containing-owner-native FAIL '+phase);return 1
 except NativeFailure as e:
  if type(e) is NativeFailure:print('remaining-six-containing-owner-native FAIL '+e.phase+' SQLSTATE '+e.code)
  else:print('remaining-six-containing-owner-native FAIL unclassified')
  return 1
 except BaseException:
  print('remaining-six-containing-owner-native FAIL unclassified');return 1
 return 0
if __name__=='__main__':sys.exit(main())
