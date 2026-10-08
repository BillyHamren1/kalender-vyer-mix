#!/usr/bin/env python3
"""NEW disposable six-entry native evidence; never hosted execution or activation."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import secrets
import shutil
import sys
import tempfile
import time
import threading
import signal

HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
DATABASE='operations_remaining_six_read_runtime'
SCHEMA=('scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql', 'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql', 'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql', 'supabase/migrations/20261002035459_operations_obligation_credit_assignment.sql', 'supabase/migrations/20261002042005_operations_obligation_credit_capacity.sql', 'supabase/migrations/20261002061659_operations_hired_personnel_authority.sql', 'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql')
OWN_FILES=('scripts/project-economy/remaining-six-compatible-reader-native.py', 'scripts/project-economy/remaining-six-compatible-reader-native.guard.test.py', 'scripts/project-economy/remaining-six-compatible-reader-native-bootstrap.sql', 'scripts/project-economy/remaining-six-compatible-reader-native-fixture.sql', 'scripts/project-economy/remaining-six-compatible-reader-native-state.sql', 'scripts/project-economy/remaining-six-compatible-reader-native-state-negative.sql', 'scripts/project-economy/remaining-six-compatible-reader-native-http.py', 'scripts/project-economy/remaining-six-compatible-reader-native-http-role.sql')
OTHER_FILES=('scripts/project-economy/operations-hired-personnel-native.py', 'scripts/project-economy/operations-obligation-fixture.ts', 'supabase/functions/_shared/project-cost-obligation-authority.ts', 'supabase/functions/_shared/finance-project-invoice-destination.ts', 'supabase/functions/_shared/finance-project-invoice.ts', 'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql', 'scripts/project-economy/remaining-six-compatible-reader-postgres-test.sql')
FLAG='EVENTFLOW_REMAINING_SIX_READ_ISOLATED_DB'
SHARED_SHA='cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
ORG='00000000-0000-4000-8000-000000000001'
ACTOR='00000000-0000-4000-8000-000000000199'
PROJECT='00000000-0000-4000-8000-000000000117'
OBLIGATION='00000000-0000-4000-8000-000000000118'
SCOPE='00000000-0000-4000-8000-000000000121'
PHASES={'guard','source','fresh','schema','generator','candidate','fixture','direct','selectors','state','holder','observer','reader','cancel','cleanup','proof'}
SQLSTATES={'22023','42501','55000','55P03','57014','40001','PT409','22P02','25P02','40P01'}
class Failure(Exception):
 def __init__(self,phase,code='unclassified',retain=False):
  self.phase=phase if phase in PHASES else 'guard';self.code=code if code in SQLSTATES else 'unclassified';self.retain=retain
  super().__init__('closed_remaining_six_failure')
def guard(env):
 required={'CI':'true',FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix'}
 if any(env.get(k)!=v for k,v in required.items()) or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise Failure('guard')
 for k,v in env.items():
  if not v:continue
  if k.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'} or k.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_','LD_')) or k.startswith('PG') and k not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'} or k in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','LD_PRELOAD','LD_LIBRARY_PATH','NODE_OPTIONS','NODE_USE_ENV_PROXY','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','SHELLOPTS','BASHOPTS','PS4'}:raise Failure('guard')
  if k.startswith('EVENTFLOW_REMAINING_SIX_') and k!=FLAG:raise Failure('guard')
 return dict(env)
def shared_module():
 p=HERE/'operations-hired-personnel-native.py'
 if p.resolve()!=p or hashlib.sha256(p.read_bytes()).hexdigest()!=SHARED_SHA:raise Failure('source')
 spec=importlib.util.spec_from_file_location('remaining_six_owned_process',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def closure():
 try:
  p=HERE/'remaining-six-compatible-reader-native-closure.json'
  if p.resolve()!=p:raise ValueError()
  v=json.loads(p.read_text())
  if set(v)!={'schema','database','ordered_schema_paths','files'} or v['schema']!='operations-remaining-six-native-closure.v1' or v['database']!=DATABASE or not isinstance(v['files'],dict) or len(v['ordered_schema_paths'])!=27:raise ValueError()
  if tuple(v['ordered_schema_paths'])!=SCHEMA or set(v['files'])!=set(SCHEMA)|set(OWN_FILES)|set(OTHER_FILES):raise ValueError()
  for name,digest in v['files'].items():
   if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError()
   f=ROOT/name
   if f.resolve()!=f or not f.is_file() or not f.is_relative_to(ROOT) or hashlib.sha256(f.read_bytes()).hexdigest()!=digest:raise ValueError()
  return [ROOT/n for n in v['ordered_schema_paths']]
 except Exception:raise Failure('source') from None

class Harness:
 def __init__(self,env,private,shared):
  self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock();self.psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq'];self.records=[]
 def run(self,phase,cmd,body=None,seconds=30,extra=None):
  with self.index_lock:
   self.index+=1;d=self.private/(str(self.index).zfill(4)+'-'+phase);d.mkdir(mode=0o700)
  env=dict(self.env,PGCONNECT_TIMEOUT='3',PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=18000 -c test.remaining_six_isolated=synthetic-disposable')
  if extra:env.update(extra)
  try:return self.shared.run_private('authority_sql',cmd,env,ROOT,d,seconds,body)
  except self.shared.ClosedFailure as e:raise Failure(phase,e.code,e.retain_private) from None
 def sql(self,phase,sql,seconds=30,extra=None):
  return self.run(phase,self.psql,sql.encode(),seconds,extra).read_text()
 def boolean(self,phase,sql):
  if self.sql(phase,sql).strip()!='t':raise Failure(phase)
 def state(self):
  result=self.sql('state',(HERE/'remaining-six-compatible-reader-native-state.sql').read_text()).strip()
  if not re.fullmatch('[0-9a-f]{64}',result):raise Failure('state')
  return result
 def observe(self,name,wait=None,held_type=None):
  pred="application_name='"+name+"'"
  if wait=='held':pred+=" and wait_event='PgSleep' and exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.granted and l.locktype in ('advisory','relation','transactionid','tuple'))"
  elif wait=='lock':pred+=" and wait_event_type='Lock'"
  if held_type in {'advisory','transactionid','relation'}:pred+=" and exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.granted and l.locktype='"+held_type+"' and l.mode='"+('AccessExclusiveLock' if held_type=='relation' else 'ExclusiveLock')+"')"
  out=self.sql('observer','select coalesce((select pid from pg_stat_activity where '+pred+'),0);',5).strip()
  if not re.fullmatch('[0-9]{1,10}',out):raise Failure('observer')
  return int(out)
 def await_observation(self,name,wait,held_type=None):
  deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   pid=self.observe(name,wait,held_type)
   if pid:return pid
   time.sleep(.005)
  raise Failure('observer')
 def inspect_future(self,future):
  try:return future.result(timeout=25)
  except Failure:raise
  except concurrent.futures.TimeoutError:raise Failure('cleanup',retain=True) from None
  except BaseException:raise Failure('cleanup',retain=True) from None
 def finish_holder(self,name,pid,future,reader=None):
  failures=[]
  try:
   current=self.observe(name)
   if current:
    if pid is not None and current!=pid:raise Failure('cleanup',retain=True)
    self.boolean('cancel',"select coalesce((select pg_cancel_backend(pid) from pg_stat_activity where pid="+str(current)+" and application_name='"+name+"' and backend_type='client backend'),false);")
  except BaseException as e:failures.append(e)
  for owned in [future,reader]:
   if owned is not None:
    try:self.inspect_future(owned)
    except BaseException as e:failures.append(e)
  try:self.boolean('cleanup',"select not exists(select 1 from pg_stat_activity where application_name='"+name+"');")
  except BaseException as e:
   if isinstance(e,Failure):e.retain=True
   failures.append(e)
  if failures:
   first=next((e for e in failures if isinstance(e,Failure)),Failure('cleanup',retain=True))
   first.retain=first.retain or any(not isinstance(e,Failure) or e.retain for e in failures)
   raise first
 def case(self,label,sql,lock,kind='try',expected='55P03'):
  if not re.fullmatch('[a-z0-9_]{1,64}',label) or kind not in {'try','fallback','priority'}:raise Failure('guard')
  name='remaining_six_holder_'+label;before=self.state()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   holder=pool.submit(self.sql,'holder',"begin;"+lock+";do $$begin perform pg_sleep(8);exception when query_canceled then null;end$$;rollback;",15,{'PGAPPNAME':name})
   held_type='advisory' if 'pg_advisory_xact_lock' in lock else 'relation' if lock.startswith('lock table') else 'transactionid'
   pid=None;reader=None
   try:
    pid=self.await_observation(name,'held',held_type)
    readname='remaining_six_reader_'+label
    request=self.reader_sql(sql,expected)
    started=time.monotonic()
    reader=pool.submit(self.sql,'reader',request,8,{'PGAPPNAME':readname})
    observed_wait=False
    if kind=='fallback':
     # Catch an actual relation wait while holder remains alive; no sleep inference.
     limit=time.monotonic()+2
     while time.monotonic()<limit and not reader.done():
      if self.observe(readname,'lock'):observed_wait=True;break
    result=reader.result(timeout=8)
    elapsed=time.monotonic()-started
    if result.splitlines()!=['remaining_six_reader PASS'] or not self.observe(name,'held',held_type) or kind=='fallback' and not observed_wait:raise Failure('reader')
    if kind=='try' and elapsed>3:raise Failure('reader')
   finally:self.finish_holder(name,pid,holder,reader)
  if self.state()!=before:raise Failure('state')
  self.records.append({'case':label,'kind':kind,'status':'PASS'})
 def reader_sql(self,sql,expected):
  role='authenticated' if sql.startswith('select public.read_operations_scope_obligation_evidence') or sql.startswith('select public.read_operations_scope_obligation_drilldown') else 'service_role'
  call=sql.removeprefix('select ').removesuffix(';')
  return "begin;set local lock_timeout='2s';select set_config('request.jwt.claims','{\"sub\":\""+ACTOR+"\",\"role\":\"authenticated\"}',true)\\g /dev/null\nset local role "+role+";do $$declare caught boolean:=false;begin begin perform "+call+";exception when sqlstate '"+expected+"' then if '"+expected+"'='55P03' and sqlerrm<>'remaining_reader_dependency_busy' then raise exception 'wrong_busy_message';end if;caught:=true;end;if not caught then raise exception 'denial_required';end if;if current_setting('lock_timeout')<>'2s' then raise exception 'caller_setting_not_restored';end if;end$$;reset role;rollback;select 'remaining_six_reader PASS';"

def literal(value):return "'"+json.dumps(value,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
def make_calls(selection):
 if set(selection)!={'snapshot','event','anchor'} or any(not isinstance(v,str) for v in selection.values()) or not re.fullmatch('[0-9a-f]{64}',selection['anchor']) or any(not re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',selection[k]) for k in ['snapshot','event']):raise Failure('selectors')
 drill={'schema_version':'operations-scope-obligation-drilldown-read.v1','root_kind':'project','root_id':PROJECT,'obligation_id':OBLIGATION,'expected_composition_snapshot_id':selection['snapshot'],'expected_baseline_event_id':selection['event']}
 kernel={'schema_version':'operations-invoice-obligation-kernel-read.v1','organization_id':ORG,'project_id':PROJECT,'obligation_id':OBLIGATION}
 return {'parent':f"select public.read_operations_scope_obligation_evidence_v1('{ORG}','project','{PROJECT}');",'drilldown':'select public.read_operations_scope_obligation_drilldown_v1('+literal(drill)+');','composition':f"select public.read_operations_scope_obligation_composition_v1('{ORG}','{SCOPE}');",'kernel':'select public.read_operations_invoice_obligation_kernel_evidence_v1('+literal(kernel)+');','original':f"select public.read_operations_obligation_original_v1('{ORG}','{PROJECT}','{OBLIGATION}','{selection['anchor']}');",'policy':f"select public.read_operations_obligation_source_policy_v1('{ORG}','{PROJECT}','{OBLIGATION}','{selection['anchor']}');"}

def execute(env):
 guard(env);schema=closure();shared=shared_module();private=pathlib.Path(tempfile.mkdtemp(prefix='remaining-six-native-'));private.chmod(0o700);retain=False
 h=Harness(env,private,shared)
 try:
  h.boolean('fresh',"select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_setting('server_version_num')='150019' and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p','v','m')) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth'));" )
  version=h.run('generator',['deno','--version']).read_text().splitlines()
  if not version or version[0]!='deno 2.8.1 (stable, release, x86_64-unknown-linux-gnu)':raise Failure('generator')
  for p in schema:
   if p.name=='20261002130228_operations_scope_invoice_compatible_read_entry.sql':h.sql('schema',(HERE/'remaining-six-compatible-reader-native-bootstrap.sql').read_text())
   h.sql('schema',p.read_text(),60)
  h.sql('candidate',(ROOT/'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql').read_text(),60)
  raw=h.run('generator',['deno','run','--cached-only',str(HERE/'operations-obligation-fixture.ts')]).read_text()
  if len(raw.encode())>262144:raise Failure('generator')
  fixture=json.loads(raw)
  setup=(HERE/'remaining-six-compatible-reader-native-fixture.sql').read_text()
  if setup.count(":'fixture'")!=1:raise Failure('fixture')
  output=h.sql('fixture',setup.replace(":'fixture'",literal(fixture)),60)
  if 'remaining-six-native-fixture PASS genuine_invoice_baseline_binding_composition_three_root_kinds' not in output.splitlines():raise Failure('fixture')
  before=h.state();negative=h.sql('state',(HERE/'remaining-six-compatible-reader-native-state-negative.sql').read_text())
  if negative.splitlines()!=['remaining-six-state-negative PASS same_count_actual_head_change_actor_counts_neutral_rolled_back'] or h.state()!=before:raise Failure('state')
  direct=h.sql('direct',(HERE/'remaining-six-compatible-reader-postgres-test.sql').read_text(),90)
  if 'REMAINING_SIX_DIRECT_PARITY_PASS|49' not in direct.splitlines() or h.state()!=before:raise Failure('direct')
  selection=json.loads(h.sql('selectors',"select jsonb_build_object('snapshot',c.snapshot_id,'event',c.document->'baseline_events'->0->>'baseline_event_id','anchor',(select source_anchor from public.operations_project_obligation_invoice_bindings where organization_id=c.organization_id and obligation_id='"+OBLIGATION+"' order by binding_sequence desc limit 1)) from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id='"+ORG+"' and h.economic_scope_id='"+SCOPE+"';"))
  calls=make_calls(selection)
  orglock="select pg_advisory_xact_lock(hashtextextended('obligation-org:"+ORG+"',0))"
  for family,call in calls.items():h.case(family+'_org_try',call,orglock)
  for family in ['parent','drilldown']:
   for table,selector in [('auth.users',"id='"+ACTOR+"'"),('public.profiles',"user_id='"+ACTOR+"'"),('public.user_roles',"user_id='"+ACTOR+"' and role='admin'")]:
    h.case(family+'_'+table.split('.')[-1]+'_try',calls[family],'select 1 from '+table+' where '+selector+' for update')
  for family,call in calls.items():h.case(family+'_project_try',call,"select 1 from public.projects where id='"+PROJECT+"' for update")
  for family in ['parent','drilldown','composition']:h.case(family+'_scope_head_try',calls[family],"select 1 from public.operations_project_scope_heads where organization_id='"+ORG+"' and economic_scope_id='"+SCOPE+"' for update")
  for family,call in calls.items():h.case(family+'_baseline_head_try',call,"select 1 from public.operations_project_obligation_heads where organization_id='"+ORG+"' and obligation_id='"+OBLIGATION+"' for update")
  source="select pg_advisory_xact_lock(hashtextextended('invoice-economic-source-v1:"+ORG+":99999999-9999-4999-8999-999999999999:00000000-0000-4000-8000-000000000120',0))"
  for family,call in calls.items():h.case(family+'_source_try',call,source)
  for family,call in calls.items():h.case(family+'_invoice_head_try',call,"select 1 from public.operations_finance_invoice_streams where organization_id='"+ORG+"' and invoice_id='00000000-0000-4000-8000-000000000120' for update")
  for family in ['parent','drilldown','composition','kernel','policy']:h.case(family+'_source_policy_try',calls[family],"select 1 from public.operations_obligation_source_policy_heads where organization_id='"+ORG+"' and obligation_id='"+OBLIGATION+"' for update")
  packing_root='00000000-0000-4000-8000-000000000319'
  packing_parent=f"select public.read_operations_scope_obligation_evidence_v1('{ORG}','packing_project','{packing_root}');"
  packing_saved=json.loads(h.sql('selectors',"select jsonb_build_object('snapshot',c.snapshot_id,'event',c.document->'baseline_events'->0->>'baseline_event_id') from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id='"+ORG+"' and h.economic_scope_id='00000000-0000-4000-8000-000000000321';"))
  if set(packing_saved)!={'snapshot','event'} or any(not isinstance(v,str) or not re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',v) for v in packing_saved.values()):raise Failure('selectors')
  packing_drill='select public.read_operations_scope_obligation_drilldown_v1('+literal({'schema_version':'operations-scope-obligation-drilldown-read.v1','root_kind':'packing_project','root_id':packing_root,'obligation_id':'00000000-0000-4000-8000-000000000318','expected_composition_snapshot_id':packing_saved['snapshot'],'expected_baseline_event_id':packing_saved['event']})+');'
  for family,call in [('parent',packing_parent),('drilldown',packing_drill)]:
   h.case(family+'_packing_policy_try',call,"select 1 from public.operations_project_scope_packing_policies where organization_id='"+ORG+"' and status='drilldown_ready' for update")
   h.case(family+'_packing_root_try',call,"select 1 from public.packing_projects where organization_id='"+ORG+"' and id='"+packing_root+"' for update")
  for family in ['parent','drilldown']:h.case(family+'_relation_fallback',calls[family],'lock table public.profiles in access exclusive mode','fallback')
  h.case('drilldown_parse_priority',"select public.read_operations_scope_obligation_drilldown_v1('{}'::jsonb);",orglock,kind='priority',expected='22023')
  spec=importlib.util.spec_from_file_location('remaining_six_actual_postgrest',HERE/'remaining-six-compatible-reader-native-http.py');http=importlib.util.module_from_spec(spec);spec.loader.exec_module(http)
  if len(h.records)!=51 or len({r['case'] for r in h.records})!=51:raise Failure('proof')
  api=http.execute(h,sys.modules[__name__],selection,calls)
  if len(api)!=18:raise Failure('proof')
  h.records.extend(api)
  if len({r['case'] for r in h.records})!=69:raise Failure('proof')
  proof={'schema':'operations-remaining-six-native-proof.v1','database':DATABASE,'directVectors':49,'cases':h.records,'sameCountHeadNegative':True,'economicStateUnchanged':h.state()==before,'cleanup':True,'semantics':'observed_rows_known_try_per_lock_fallback'}
  if not proof['economicStateUnchanged']:raise Failure('state')
  p=private/'proof.json';fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as f:json.dump(proof,f,separators=(',',':'))
 except Failure as e:retain=e.retain;raise
 finally:
  if not retain:shutil.rmtree(private)
 return proof

def interrupted(_signum,_frame):raise Failure('cleanup')
def main():
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:
  if len(sys.argv)!=1:raise Failure('guard')
  proof=execute(dict(os.environ))
  for row in proof['cases']:print('remaining-six-native PASS '+row['case']+' '+row['kind'])
  print('remaining-six-native PASS direct49_known_try_per_lock_fallback_state_neutral_cleanup')
 except Failure as e:print('remaining-six-native FAIL phase='+e.phase+' sqlstate='+e.code,file=sys.stderr);return 1
 except BaseException:print('remaining-six-native FAIL phase=guard sqlstate=unclassified',file=sys.stderr);return 1
 return 0
if __name__=='__main__':sys.exit(main())
