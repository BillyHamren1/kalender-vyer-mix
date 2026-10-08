#!/usr/bin/env python3
"""NEW selected genuine receiver/containing-owner reverse races; isolated CI only."""
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
ROOT=HERE.parents[1]
FLAG='EVENTFLOW_REMAINING_SIX_CREDIT_CAPACITY_REVERSE_ISOLATED_DB'
DATABASES={'eventflow_own_credit_reverse_remaining_six':'credit','eventflow_own_credit_capacity_reverse_remaining_six':'capacity'}
SOURCE='c3a25aece32edc35bedf0487f8a4135c14a4db5c'
OWNER_PATH='scripts/project-economy/remaining-six-containing-owner-native.py'
OWNER_CLOSURE='scripts/project-economy/remaining-six-containing-owner-native-closure.json'
PREFIX='remaining-six-credit-capacity-reverse-native'
OWN=tuple('scripts/project-economy/'+PREFIX+suffix for suffix in ['.py','.guard.test.py','-evidence.py','-evidence.test.py','-state.sql','-history.sql','-neutrality.sql','-bootstrap.sql'])+('docs/project-economy/remaining-six-credit-capacity-reverse-native-matrix.md','docs/project-economy/remaining-six-credit-capacity-reverse-native-contract.md')
CASES=('original_containing_fixture','candidate_containing_fixture','public_original_first_v1_original_replay_exact_wait','public_original_held_v2_credit_replay_nonconflicting','actual_owner_original_and_credit_keys_v1_original_replay','actual_owner_original_and_credit_keys_v2_credit_replay','public_original_first_absent_v2_original_saved_money_unresolved')
PHASES={'guard','source','fresh','schema','generator','original_fixture','candidate','candidate_fixture','setup','state','state_negative','receiver_wait','receiver_nonconflict','owner_original','owner_credit','counterpart','proof','cleanup'}
CODES={'22023','42501','55000','55P03','57014','40001','PT409','22P02','25P02','40P01','unclassified'}
class Refusal(Exception):
 pass
class NativeFailure(Exception):
 def __init__(self,phase='unclassified',code='unclassified'):
  self.phase=phase if type(phase) is str and phase in PHASES else 'unclassified'
  self.code=code if type(code) is str and code in CODES else 'unclassified'
def guard(env):
 required={'CI':'true',FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix'}
 if type(env) is not dict or any(env.get(k)!=v for k,v in required.items()) or type(env.get('PGDATABASE')) is not str or env['PGDATABASE'] not in DATABASES or type(env.get('GITHUB_RUN_ID')) is not str or re.fullmatch('[0-9]{1,20}',env['GITHUB_RUN_ID']) is None:raise Refusal('guard')
 for key,value in env.items():
  if type(key) is not str or type(value) is not str:raise Refusal('guard')
  if not value:continue
  if key.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'} or key.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_','LD_')) or key.startswith('PG') and key not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'} or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','NODE_USE_ENV_PROXY','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','SHELLOPTS','BASHOPTS','PS4'} or key.startswith('EVENTFLOW_') and key!=FLAG:raise Refusal('guard')
 return DATABASES[env['PGDATABASE']]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path)
 result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
 return result
def load_source():
 path=HERE/(PREFIX+'-closure.json')
 if path.resolve()!=path:raise Refusal('source')
 value=json.loads(path.read_text())
 if type(value) is not dict or set(value)!={'schema','source_commit','files','tables','ordered_schema_paths'} or value['schema']!='remaining-six-credit-capacity-reverse-closure.v1' or value['source_commit']!=SOURCE or type(value['files']) is not dict or type(value['tables']) is not list or len(value['tables'])!=62 or type(value['ordered_schema_paths']) is not list or len(value['ordered_schema_paths'])!=27:raise Refusal('source')
 for name,digest in value['files'].items():
  if type(name) is not str or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or type(digest) is not str or re.fullmatch('[0-9a-f]{64}',digest) is None:raise Refusal('source')
  target=ROOT/name
  if target.resolve()!=target or not target.is_relative_to(ROOT) or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise Refusal('source')
 owner_doc=json.loads((ROOT/OWNER_CLOSURE).read_text())
 if set(value['files'])!=set(owner_doc['files'])|{OWNER_CLOSURE}|set(OWN) or value['ordered_schema_paths']!=owner_doc['ordered_schema_paths'] or value['tables']!=owner_doc['tables']:raise Refusal('source')
 owner=module('credit_capacity_reverse_frozen_owner',ROOT/OWNER_PATH)
 original,base=owner.load_source()
 if original!=owner_doc:raise Refusal('source')
 evidence=module('credit_capacity_reverse_evidence',HERE/(PREFIX+'-evidence.py'))
 return value,owner,base,evidence
def decoded(raw):
 if type(raw) is not str or len(raw.encode())>262144:raise Refusal('state')
 return json.loads(raw)
def receipt_output(raw):
 if type(raw) is not str or len(raw.encode())>262144:raise Refusal('state')
 records=[]
 for line in raw.splitlines():
  if not line.startswith('{'):continue
  value=json.loads(line)
  if type(value) is dict and 'outcome' in value:records.append(value)
 if len(records)!=1:raise Refusal('state')
 return records[0]
def original_output(raw,evidence,anchor):
 if type(raw) is not str or len(raw.encode())>262144:raise Refusal('state')
 records=[json.loads(line) for line in raw.splitlines() if line.startswith('{')]
 records=[r for r in records if type(r) is dict and r.get('schema_version')=='operations-obligation-original-evidence.v1']
 if len(records)!=1:raise Refusal('state')
 value=records[0]
 required={'state':'bound_original','authority_scope':'local_project_only','source_currentness':'receiver_v1_only','remaining_coverage':'unavailable','eac_minor':None,'shadow_only':True,'organization_id':evidence.ORG,'project_id':evidence.PROJECT,'obligation_id':evidence.OBLIGATION,'source_anchor':anchor,'currency':'SEK','estimate_minor':1000000,'committed_minor':None,'amount_minor':540000,'baseline_revision':1,'source_economic_revision':1}
 if any(key not in value or type(value[key]) is not type(expected) or value[key]!=expected for key,expected in required.items()):raise Refusal('state')
 return value
def make_harness(base,env,private,manifest,evidence):
 class ReverseHarness(base.Harness):
  def run(self,phase,cmd,body=None,seconds=30,extra=None):
   with self.index_lock:
    self.index+=1;directory=self.private/(str(self.index).zfill(4)+'-'+phase);directory.mkdir(mode=0o700)
   child=dict(self.env,PGCONNECT_TIMEOUT='3',PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=6000 -c idle_in_transaction_session_timeout=18000 -c standard_conforming_strings=on -c test.remaining_six_credit_cap_reverse_isolated=synthetic-disposable -c eventflow.own_credit_isolated=synthetic-disposable -c eventflow.credit_capacity_isolated=synthetic-disposable')
   if extra:child.update(extra)
   try:return self.shared.run_private('authority_sql',cmd,child,ROOT,directory,seconds,body)
   except self.shared.ClosedFailure as failure:
    if type(failure) is self.shared.ClosedFailure:raise base.Failure(phase,failure.code,failure.retain_private) from None
    raise base.Failure('cleanup','unclassified',True) from None
   except BaseException:raise base.Failure('cleanup','unclassified',True) from None
  def state(self):return evidence.state(decoded(self.sql('state',(HERE/(PREFIX+'-state.sql')).read_text())),manifest['tables'])
  def history(self):return evidence.history(decoded(self.sql('state',(HERE/(PREFIX+'-history.sql')).read_text())))
  def neutral(self,mode,counterpart=False):return evidence.neutrality(decoded(self.sql('state',(HERE/(PREFIX+'-neutrality.sql')).read_text())),mode,counterpart)
  def observe(self,name,wait=None,held_type=None):
   if type(name) is not str or re.fullmatch('[a-z0-9_]{1,63}',name) is None:raise Refusal('state')
   pred="datname=current_database() and backend_type='client backend' and application_name='"+name+"'"
   if wait=='held':pred+=" and wait_event='PgSleep'"
   elif wait=='lock':pred+=" and wait_event_type='Lock'"
   elif wait is not None:raise Refusal('state')
   raw=self.sql('state','select coalesce((select pid from pg_stat_activity where '+pred+'),0);',5).strip()
   if re.fullmatch('[0-9]{1,10}',raw) is None:raise Refusal('state')
   return int(raw)
 return ReverseHarness(env,private,base.shared_module())
def source_key(evidence,invoice):
 if invoice not in {evidence.ORIGINAL,evidence.CREDIT}:raise Refusal('state')
 return 'invoice-economic-source-v1:'+evidence.ORG+':'+evidence.FINANCE+':'+invoice
def key_predicate(pid,key,granted):
 if type(pid) is not int or not 1<=pid<=2147483647 or type(key) is not str or re.fullmatch('invoice-economic-source-v1:[0-9a-f:-]{110}',key) is None or type(granted) is not bool:raise Refusal('state')
 hashed="pg_catalog.hashtextextended('"+key+"',0)"
 return "exists(select 1 from pg_locks l where l.pid="+str(pid)+" and l.database=(select oid from pg_database where datname=current_database()) and l.locktype='advisory' and l.mode='ExclusiveLock' and l.granted="+str(granted).lower()+" and l.objsubid=1 and l.classid::bigint=(("+hashed+" >>32)&4294967295) and l.objid::bigint=("+hashed+"&4294967295))"
def blocker_predicate(holder,writer,key):
 return key_predicate(holder,key,True)+' and '+key_predicate(writer,key,False)+' and '+str(holder)+'=any(pg_blocking_pids('+str(writer)+'))'
def reader_sql(evidence,anchor):
 evidence.safe_hash(anchor)
 return "select public.read_operations_obligation_original_v1('"+evidence.ORG+"','"+evidence.PROJECT+"','"+evidence.OBLIGATION+"','"+anchor+"');"
def raw_selector(evidence,variant):
 if variant=='original':return "(select raw_body from public.operations_finance_invoice_snapshots where invoice_id='"+evidence.ORIGINAL+"' and source_revision=1)"
 if variant=='credit':return "(select raw_body from public.operations_finance_credit_v2_snapshots where invoice_id='"+evidence.CREDIT+"' and source_revision=1)"
 if variant=='counterpart':return "(select raw_original_v2 from public.operations_own_credit_native_fixture where slot='only')"
 raise Refusal('state')
def receiver_sql(evidence,variant,nonce):
 if type(nonce) is not str or re.fullmatch('[a-z0-9_]{16,128}',nonce) is None:raise Refusal('state')
 protocol='v1' if variant=='original' else 'v2'
 return "select public.operations_receive_finance_project_invoice_destination_"+protocol+"('fixture_credit_native_"+protocol+"',floor(extract(epoch from clock_timestamp()))::bigint::text,'"+nonce+"',"+raw_selector(evidence,variant)+");"
def holding_sql(call,owner=False,mode=None,revision=None):
 if type(call) is not str or not call.startswith('select ') or not call.endswith(';') or call.count(';')!=1 or type(owner) is not bool:raise Refusal('state')
 if owner:
  if type(mode) is not str or mode not in {'credit','capacity'} or type(revision) is not int or revision not in {1,2}:raise Refusal('state')
  keys="'outcome','event_id','revision','receipt_currentness','credit_eligible','eac_minor','shadow_only'"+(", 'source_anchor','remaining_coverage'" if mode=='credit' else ", 'capacity_state','reserved_minor','retained_aggregate_minor'")
  expected=9 if mode=='credit' else 10
  conditions="jsonb_typeof(r)='object' and (select count(*) from jsonb_object_keys(r))="+str(expected)+" and r ?& array["+keys+"] and r->>'outcome'='accepted' and r->'revision'=to_jsonb("+str(revision)+") and r->'credit_eligible'='false'::jsonb and r->'eac_minor'='null'::jsonb and r->'shadow_only'='true'::jsonb and r->>'event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"
  if mode=='credit':conditions+=" and r->>'receipt_currentness'='saved_assignment_only' and r->>'remaining_coverage'='unavailable' and r->>'source_anchor' ~ '^[0-9a-f]{64}$'"
  else:conditions+=" and r->>'receipt_currentness'='saved_capacity_event_only' and r->>'capacity_state'='local_capacity_proven' and r->'reserved_minor'='50000'::jsonb and r->'retained_aggregate_minor'='50000'::jsonb"
 else:
  conditions="jsonb_typeof(r)='object' and r->>'schema_version'='operations-obligation-original-evidence.v1' and r->>'state'='bound_original' and r->>'authority_scope'='local_project_only' and r->>'source_currentness'='receiver_v1_only' and r->>'remaining_coverage'='unavailable' and r->'eac_minor'='null'::jsonb and r->'shadow_only'='true'::jsonb and r->>'organization_id'='11111111-1111-4111-8111-111111111111' and r->>'project_id'='55555555-5555-4555-8555-555555555555' and r->>'obligation_id'='abababab-abab-4aba-8aba-abababababab' and r->>'currency'='SEK' and r->'amount_minor'='540000'::jsonb and r->'estimate_minor'='1000000'::jsonb and r->'committed_minor'='null'::jsonb and r->'baseline_revision'='1'::jsonb and r->'source_economic_revision'='1'::jsonb and r->>'source_anchor' ~ '^[0-9a-f]{64}$'"
 claims="select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"role\":\"authenticated\"}',true);" if owner else ''
 capture="do $actual_holder$declare r jsonb;begin r:=("+call[:-1]+");if ("+conditions+") is not true then raise exception 'credit_cap_reverse_actual_holder_reply_required' using errcode='55000';end if;perform set_config('test.credit_cap_reverse_holder_reply',r::text,true);end$actual_holder$;select current_setting('test.credit_cap_reverse_holder_reply')::jsonb;"
 return "begin;set local statement_timeout='14s';set local lock_timeout='6s';set local role "+('authenticated' if owner else 'service_role')+';'+claims+capture+"do $$begin perform pg_sleep(8);exception when query_canceled then null;end$$;"+('commit;' if owner else 'rollback;')
def sending_sql(call):return "begin;set local statement_timeout='12s';set local lock_timeout='6s';set local role service_role;"+call+'commit;'
def owner_call(mode,revision,key):
 if type(revision) is not int or revision not in {1,2} or type(key) is not str or re.fullmatch('[a-z0-9_-]{16,64}',key) is None:raise Refusal('state')
 if mode=='credit':return "select public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('expected_assignment_revision',"+str(revision-1)+",'idempotency_key','"+key+"','reason','Actual isolated reverse credit proof')) from public.operations_own_credit_native_fixture where slot='only';"
 if mode=='capacity':return "select public.append_operations_obligation_credit_capacity_v1(command||jsonb_build_object('expected_capacity_revision',"+str(revision-1)+",'idempotency_key','"+key+"','reason','Actual isolated reverse capacity proof')) from public.operations_credit_capacity_native_fixture where slot='first';"
 raise Refusal('state')
def race(h,base,evidence,mode,index,holder_call,variant,both=False,nonconflict=False):
 name='credit_cap_reverse_'+mode+'_'+str(index);writer_name=name+'_writer'
 nonce='credit_cap_reverse_'+mode+'_nonce_'+str(index)
 raw=decoded(h.sql('state','select to_jsonb('+raw_selector(evidence,variant)+');'))
 if type(raw) is not str or len(raw.encode())>262144:raise Refusal('state')
 wanted=source_key(evidence,evidence.CREDIT if variant=='credit' else evidence.ORIGINAL)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  holder=pool.submit(h.sql,'holder',holding_sql(holder_call,both,mode,index-2 if both else None),18,{'PGAPPNAME':name});writer=None;pid=None;writer_result=None
  try:
   pid=h.await_observation(name,'held')
   h.boolean('state','select '+key_predicate(pid,source_key(evidence,evidence.ORIGINAL),True)+';')
   if both:h.boolean('state','select '+key_predicate(pid,source_key(evidence,evidence.CREDIT),True)+';')
   elif nonconflict:h.boolean('state','select not '+key_predicate(pid,source_key(evidence,evidence.CREDIT),True)+';')
   writer=pool.submit(h.sql,'reader',sending_sql(receiver_sql(evidence,variant,nonce)),18,{'PGAPPNAME':writer_name})
   if nonconflict:
    writer_result=h.inspect_future(writer)
    if h.observe(name,'held')!=pid or h.observe(writer_name):raise Refusal('receiver_nonconflict')
   else:
    writer_pid=h.await_observation(writer_name,'lock')
    if h.observe(name,'held')!=pid:raise Refusal('receiver_wait')
    pred=blocker_predicate(pid,writer_pid,wanted);h.boolean('state','select '+pred+';')
    h.boolean('state','select not ('+blocker_predicate(pid+100000,writer_pid,wanted)+');')
    if variant=='original':h.boolean('state','select not ('+blocker_predicate(pid,writer_pid,source_key(evidence,evidence.CREDIT))+');')
    if variant=='counterpart':h.boolean('state',"select not exists(select 1 from public.operations_finance_credit_v2_streams where invoice_id='"+evidence.ORIGINAL+"');")
  finally:h.finish_holder(name,pid,holder,writer)
  if writer is None or h.observe(writer_name):raise Refusal('cleanup')
  if writer_result is None:writer_result=h.inspect_future(writer)
  holder_result=h.inspect_future(holder)
 receipt=evidence.protocol_receipt(receipt_output(writer_result),variant,'accepted' if variant=='counterpart' else 'replayed',hashlib.sha256(raw.encode()).hexdigest())
 if not both:
  original=original_output(holder_result,evidence,decoded(h.sql('state',"select to_jsonb(source_anchor) from public.operations_project_obligation_invoice_bindings where organization_id='"+evidence.ORG+"' and obligation_id='"+evidence.OBLIGATION+"';")))
  saved=h.neutral(mode,variant=='counterpart')
  if original.get('baseline_event_id')!=saved['baseline']['event_id'] or original.get('binding_event_id')!=saved['binding']['event_id'] or original.get('source_snapshot_id')!=saved['binding']['source_snapshot_id'] or original.get('source_raw_body_sha256')!=saved['binding']['source_raw_body_sha256']:raise Refusal('state')
 return receipt,receipt_output(holder_result) if both else None
def state_negative(h,evidence):
 before=h.state();old=h.history()
 state_sql=(HERE/(PREFIX+'-state.sql')).read_text()
 if state_sql.count('begin;set local time zone')!=1 or not state_sql.endswith('rollback;\n'):raise Refusal('source')
 state_sql=state_sql.replace('begin;set local time zone','set local time zone',1)
 actual="begin;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v1('fixture_credit_native_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'credit_cap_reverse_real_head_negative',(select (envelope||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('6',64)))::text from public.operations_finance_invoice_snapshots where invoice_id='"+evidence.ORIGINAL+"' and source_revision=1));reset role;"
 output=h.sql('state_negative',actual+state_sql)
 values=[json.loads(line) for line in output.splitlines() if line.startswith('{')]
 changed=[v for v in values if type(v) is dict and v.get('schema')=='remaining-six-credit-capacity-reverse-state.v1']
 if len(changed)!=1:raise Refusal('state_negative')
 negative=evidence.state(changed[0],list(before));table='public.operations_finance_invoice_streams'
 if negative[table]['count']!=before[table]['count'] or negative[table]['fingerprint']==before[table]['fingerprint']:raise Refusal('state_negative')
 try:evidence.unchanged({table:before[table]},{table:negative[table]})
 except evidence.EvidenceFailure:pass
 else:raise Refusal('state_negative')
 evidence.unchanged(before,h.state());evidence.preserved_history(old,h.history())
 altered=dict(old);key=next((key for key in old if key[0]=='public.operations_project_obligation_baselines'),None)
 if key is None:raise Refusal('state_negative')
 altered[key]='0'*64
 try:evidence.preserved_history(old,altered)
 except evidence.EvidenceFailure:pass
 else:raise Refusal('state_negative')
def run_cases(h,base,evidence,mode):
 baseline=h.neutral(mode);anchor=baseline['binding']['source_anchor'];state_negative(h,evidence);records=[]
 cases=[('original',False,False),('credit',False,True),('original',True,False),('credit',True,False),('counterpart',False,False)]
 for index,(variant,both,nonconflict) in enumerate(cases,1):
  before=h.state();old_history=h.history();key='credit-cap-reverse-'+mode+'-'+str(index)
  call=owner_call(mode,index-2,key) if both else reader_sql(evidence,anchor)
  receiver,command=race(h,base,evidence,mode,index,call,variant,both,nonconflict)
  counts={evidence.RECEIPT_TABLES[variant]:1}
  if both:
   revision=index-2;evidence.owner_receipt(command,mode,revision)
   if mode=='credit':
    counts['public.operations_obligation_credit_assignments']=1;counts['public.operations_obligation_credit_assignment_heads']=1 if revision==1 else 0
    if revision==1:counts['public.operations_project_obligation_source_ownership']=1
   else:counts['public.operations_obligation_credit_capacity_events']=1;counts['public.operations_obligation_credit_capacity_heads']=1 if revision==1 else 0
  if variant=='counterpart':counts.update({'public.operations_finance_credit_v2_snapshots':1,'public.operations_finance_credit_v2_streams':1})
  after=h.state();evidence.delta(before,after,counts);evidence.preserved_history(old_history,h.history());report=h.neutral(mode,variant=='counterpart');evidence.bound_protocol_report(receiver,report,variant)
  if report['baseline']!=baseline['baseline'] or report['binding']!=baseline['binding'] or report['v1_original']!=baseline['v1_original']:raise Refusal('state')
  if both:evidence.accepted_event(report,mode,command,key,revision)
  if variant=='counterpart':
   source=("(select source_anchor from public.operations_own_credit_native_fixture where slot='only')" if mode=='credit' else "(select source_anchor from public.operations_credit_capacity_native_fixture where slot='first')")
   function='read_operations_obligation_own_credit_v1' if mode=='credit' else 'read_operations_obligation_credit_capacity_v1'
   h.boolean('state',"begin;set local role service_role;select (public."+function+"('"+evidence.ORG+"','"+evidence.PROJECT+"','"+evidence.OBLIGATION+"',"+source+")->>'state')='unresolved';rollback;")
  records.append(CASES[index+1])
 return records
def execute(env):
 mode=guard(env);manifest,owner,base,evidence=load_source()
 private=pathlib.Path(tempfile.mkdtemp(prefix='credit-cap-reverse-'));private.chmod(0o700);retain=False;phase='fresh';records=[]
 h=make_harness(base,env,private,manifest,evidence)
 try:
  h.boolean('fresh',"select current_database()='"+env['PGDATABASE']+"' and current_user='postgres' and session_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and current_setting('server_version_num')='150019' and current_setting('standard_conforming_strings')='on' and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p','v','m')) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth'));")
  phase='generator';version=h.run('generator',['deno','--version']).read_text().splitlines()
  if not version or version[0]!='deno 2.8.1 (stable, release, x86_64-unknown-linux-gnu)':raise Refusal('generator')
  phase='schema'
  for path in manifest['ordered_schema_paths']:
   if path.endswith('20261002130228_operations_scope_invoice_compatible_read_entry.sql'):h.sql('schema',(HERE/(PREFIX+'-bootstrap.sql')).read_text())
   h.sql('schema',(ROOT/path).read_text(),60)
  inventory=decoded(h.sql('source',"select json_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\") from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r';"))
  if inventory!=manifest['tables']:raise Refusal('source')
  phase='generator';values=owner.fixtures(h)
  phase='original_fixture';owner.original_sql(h,mode,values);records.append(CASES[0])
  phase='candidate';h.sql('candidate',(ROOT/'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql').read_text(),60)
  phase='candidate_fixture';owner.original_sql(h,mode,values);records.append(CASES[1])
  phase='setup';owner.setup(h,mode,values)
  phase='receiver_wait';records+=run_cases(h,base,evidence,mode)
  phase='cleanup';h.boolean('cleanup',"select not exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend');")
  if tuple(records)!=CASES or len(set(records))!=len(CASES):raise Refusal('proof')
  phase='proof';path=private/'proof.json';fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as stream:json.dump({'mode':mode,'cases':records,'source_commit':SOURCE,'tables':62,'limits':'selected source/owner SQL races only; no fullcatalog/HTTP/EAC/activation'},stream)
 except base.Failure as failure:
  if type(failure) is base.Failure:
   retain=failure.retain is not False;raise NativeFailure(phase,failure.code) from None
  retain=True;raise NativeFailure() from None
 except BaseException:
  retain=True
  raise Refusal(phase) from None
 finally:
  if not retain:shutil.rmtree(private)
 for record in records:print(PREFIX+' PASS '+mode+' '+record)
 print(PREFIX+' PASS '+mode+' registered_sources_immutable_money_checked_cleanup')
def main():
 def interrupted(_signal,_frame):raise Refusal('guard')
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 if len(sys.argv)!=1:print(PREFIX+' FAIL guard');return 1
 try:execute(dict(os.environ))
 except Refusal as failure:
  phase=failure.args[0] if type(failure) is Refusal and len(failure.args)==1 and type(failure.args[0]) is str and failure.args[0] in PHASES else 'unclassified'
  print(PREFIX+' FAIL '+phase);return 1
 except NativeFailure as failure:
  if type(failure) is NativeFailure:print(PREFIX+' FAIL '+failure.phase+' SQLSTATE '+failure.code)
  else:print(PREFIX+' FAIL unclassified')
  return 1
 except BaseException:
  print(PREFIX+' FAIL unclassified');return 1
 return 0
if __name__=='__main__':sys.exit(main())
