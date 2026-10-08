#!/usr/bin/env python3
"""Pure refusals and owned-future inspection; actual database races are separate."""
import contextlib
import importlib.util
import io
import pathlib
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch
HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('reverse_candidate',HERE/'remaining-six-credit-capacity-reverse-native.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
e=m.module('reverse_guard_evidence',HERE/'remaining-six-credit-capacity-reverse-native-evidence.py')
class Guards(unittest.TestCase):
 def env(self,db='eventflow_own_credit_reverse_remaining_six'):
  return {'CI':'true',m.FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':db,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234'}
 def test_two_exact_fresh_modes(self):
  for db,mode in m.DATABASES.items():self.assertEqual(m.guard(self.env(db)),mode)
 def test_old_foreign_host_authority_denied_before_source_or_child(self):
  for k,v in [('PGHOST','localhost'),('PGHOST','example.com'),('PGDATABASE','eventflow_own_credit_remaining_six'),('PGDATABASE','eventflow_own_credit_capacity_remaining_six'),('PGPORT','55409'),('PGUSER','service_role'),('CI','false'),('GITHUB_RUN_ID','../1'),('GITHUB_REPOSITORY','BillyHamren1/eventflow-finance')]:
   env=self.env();env[k]=v
   with patch.object(m,'load_source',side_effect=AssertionError('must not load')):
    with self.assertRaises(m.Refusal):m.execute(env)
 def test_injection_environment_zero_source_or_child(self):
  for key in ['LD_AUDIT','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','NODE_USE_ENV_PROXY','HTTP_PROXY','https_proxy','ALL_PROXY','NO_PROXY','PGOPTIONS','PGHOSTADDR','PGSERVICE','DOCKER_HOST','COMPOSE_FILE','TMPDIR','BASH_ENV','EVENTFLOW_REMAINING_SIX_OWNER_ISOLATED_DB','PGRST_JWT_SECRET','SUPABASE_URL']:
   env=self.env();env[key]='hostile'
   with patch.object(m,'load_source',side_effect=AssertionError('must not load')):
    with self.assertRaises(m.Refusal):m.execute(env)
 def test_missing_flag_or_nonprimitive_environment(self):
  env=self.env();env.pop(m.FLAG)
  with self.assertRaises(m.Refusal):m.guard(env)
  for key,value in [('PGDATABASE',[]),('GITHUB_RUN_ID',True),('PRIVATE',object())]:
   env=self.env();env[key]=value
   with self.assertRaises(m.Refusal):m.guard(env)
 def test_unknown_main_exception_does_not_reflect_private_properties(self):
  for parent in [Exception,m.Refusal,m.NativeFailure]:
   calls=[]
   class Hostile(parent):
    def __init__(self):Exception.__init__(self)
    @property
    def phase(self):calls.append('phase');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def code(self):calls.append('code');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_SENTINEL')
    def __str__(self):calls.append('str');raise RuntimeError('PRIVATE_SENTINEL')
   def fail(_env):raise Hostile()
   out=io.StringIO()
   with patch.object(m,'execute',new=fail),patch.object(m.sys,'argv',['reverse']),patch.object(m.signal,'signal'),contextlib.redirect_stdout(out):self.assertEqual(m.main(),1)
   self.assertEqual(calls,[]);self.assertEqual(out.getvalue(),m.PREFIX+' FAIL unclassified\n')
 def test_closed_failure_only_fixed_phase_and_code(self):
  def fail(_env):raise m.NativeFailure('counterpart','55P03')
  out=io.StringIO()
  with patch.object(m,'execute',new=fail),patch.object(m.sys,'argv',['reverse']),patch.object(m.signal,'signal'),contextlib.redirect_stdout(out):self.assertEqual(m.main(),1)
  self.assertEqual(out.getvalue(),m.PREFIX+' FAIL counterpart SQLSTATE 55P03\n')
  self.assertEqual(m.NativeFailure('private','private').phase,'unclassified')
 def test_source_key_exact_original_credit_not_scope_or_different_invoice(self):
  self.assertNotEqual(m.source_key(e,e.ORIGINAL),m.source_key(e,e.CREDIT))
  self.assertEqual(m.source_key(e,e.ORIGINAL),'invoice-economic-source-v1:'+e.ORG+':'+e.FINANCE+':'+e.ORIGINAL)
  for value in ['00000000-0000-0000-0000-000000000000','private',None]:
   with self.assertRaises(m.Refusal):m.source_key(e,value)
 def test_lock_observation_binds_database_pid_key_and_requested_state(self):
  original=m.source_key(e,e.ORIGINAL);credit=m.source_key(e,e.CREDIT)
  sql=m.blocker_predicate(123,456,original)
  for exact in ['l.pid=123','l.pid=456','l.granted=true','l.granted=false','current_database()','l.objsubid=1','123=any(pg_blocking_pids(456))',original]:self.assertIn(exact,sql)
  self.assertNotIn(credit,sql);self.assertNotEqual(sql,m.blocker_predicate(124,456,original))
  for pid,key,granted in [(True,original,True),(0,original,True),(123,original,1),(123,'private',True),(2147483648,original,True)]:
   with self.assertRaises(m.Refusal):m.key_predicate(pid,key,granted)
 def test_receiver_only_real_selected_raw_rows_and_fixed_roles(self):
  for variant in ['original','credit','counterpart']:
   sql=m.receiver_sql(e,variant,'reverse_guard_nonce_1');self.assertIn('public.operations_receive_finance_project_invoice_destination_',sql)
   self.assertIn(m.raw_selector(e,variant),sql)
   self.assertNotIn('amount_minor',sql)
  with self.assertRaises(m.Refusal):m.receiver_sql(e,'other','reverse_guard_nonce_1')
  with self.assertRaises(m.Refusal):m.receiver_sql(e,'original',"injected');")
  self.assertIn('set local role service_role;',m.holding_sql('select 1;'))
  self.assertIn('set local role authenticated;',m.holding_sql('select 1;',True,'credit',1))
 def test_owner_actual_command_CAS_immutable_inputs_not_rebuilt_amounts(self):
  for mode in ['credit','capacity']:
   for revision in [1,2]:
    sql=m.owner_call(mode,revision,'reverse-guard-owner-key')
    self.assertIn("'expected_"+('assignment' if mode=='credit' else 'capacity')+"_revision',"+str(revision-1),sql)
    self.assertIn('command||jsonb_build_object',sql);self.assertNotIn('amount_minor',sql)
  for mode,rev,key in [('other',1,'reverse-guard-owner-key'),('credit',0,'reverse-guard-owner-key'),('credit',True,'reverse-guard-owner-key'),('credit',1,"bad');")]:
   with self.assertRaises(m.Refusal):m.owner_call(mode,rev,key)
 def test_owned_child_actual_bounded_resource_executor_and_server_budgets(self):
  seen=[]
  class BaseHarness:
   def __init__(self,env,private,shared):self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock()
  shared=SimpleNamespace(run_private=lambda *args:seen.append(args),ClosedFailure=RuntimeError)
  base=SimpleNamespace(Harness=BaseHarness,shared_module=lambda:shared,Failure=RuntimeError)
  with tempfile.TemporaryDirectory() as d:
   h=m.make_harness(base,self.env(),pathlib.Path(d),{},e);h.run('state',['psql','-X'],seconds=5)
   args=seen[0];self.assertEqual(args[0],'authority_sql');self.assertEqual(args[5],5);self.assertEqual(args[2]['PGCONNECT_TIMEOUT'],'3')
   for bound in ['statement_timeout=15000','lock_timeout=6000','idle_in_transaction_session_timeout=18000','standard_conforming_strings=on','test.remaining_six_credit_cap_reverse_isolated=synthetic-disposable']:self.assertIn(bound,args[2]['PGOPTIONS'])
   self.assertEqual(args[4].stat().st_mode&0o777,0o700)
 def test_race_failed_observation_still_inspects_owned_holder(self):
  inspected=[]
  class H:
   def sql(self,phase,sql,*args):return '"raw"' if phase=='state' else 'holder completed'
   def await_observation(self,*args):raise m.Refusal('receiver_wait')
   def finish_holder(self,name,pid,holder,writer):
    inspected.append(holder.result(timeout=2));self.writer=writer
  h=H()
  with self.assertRaises(m.Refusal):m.race(h,None,e,'credit',1,'select 1;','original')
  self.assertEqual(inspected,['holder completed']);self.assertIsNone(h.writer)
 def test_race_cleanup_failure_prevents_receipt_and_case_success(self):
  inspected=[]
  class H:
   def sql(self,phase,sql,*args):return '"raw"' if phase=='state' else 'holder completed'
   def await_observation(self,*args):raise m.Refusal('receiver_wait')
   def finish_holder(self,name,pid,holder,writer):inspected.append(holder.result(timeout=2));raise m.Refusal('cleanup')
  with self.assertRaises(m.Refusal) as failure:m.race(H(),None,e,'credit',1,'select 1;','original')
  self.assertEqual(failure.exception.args,('cleanup',));self.assertEqual(inspected,['holder completed'])
 def test_race_writer_observation_failure_inspects_both_owned_futures(self):
  inspected=[]
  class H:
   def sql(self,phase,sql,*args):return '"raw"' if phase=='state' else phase+' completed'
   def await_observation(self,name,*args):
    if name.endswith('_writer'):raise m.Refusal('receiver_wait')
    return 123
   def boolean(self,*args):return None
   def finish_holder(self,name,pid,holder,writer):
    for future in [holder,writer]:inspected.append(future.result(timeout=2))
  with self.assertRaises(m.Refusal):m.race(H(),None,e,'capacity',1,'select 1;','original')
  self.assertEqual(inspected,['holder completed','reader completed'])
 def test_untrusted_receipt_extra_or_duplicate_record_refuses(self):
  self.assertEqual(m.receipt_output('noise\n{"outcome":"replayed"}\n'),{'outcome':'replayed'})
  for raw in ['no receipt','{"outcome":"replayed"}\n{"outcome":"accepted"}',None,'x'*262145]:
   with self.assertRaises(m.Refusal):m.receipt_output(raw)
 def test_reader_observed_money_null_and_source_identity_required(self):
  anchor='a'*64
  value={'schema_version':'operations-obligation-original-evidence.v1','state':'bound_original','authority_scope':'local_project_only','source_currentness':'receiver_v1_only','remaining_coverage':'unavailable','eac_minor':None,'shadow_only':True,'organization_id':e.ORG,'project_id':e.PROJECT,'obligation_id':e.OBLIGATION,'source_anchor':anchor,'currency':'SEK','estimate_minor':1000000,'committed_minor':None,'amount_minor':540000,'baseline_revision':1,'source_economic_revision':1}
  import json
  self.assertEqual(m.original_output(json.dumps(value),e,anchor)['committed_minor'],None)
  for key,v in [('committed_minor',0),('amount_minor',540001),('currency','EUR'),('state','unresolved'),('source_currentness','complete'),('eac_minor',0),('baseline_revision',True)]:
   changed=dict(value);changed[key]=v
   with self.assertRaises(m.Refusal):m.original_output(json.dumps(changed),e,anchor)
 def test_holder_reply_validation_precedes_pause_with_one_real_call(self):
  for mode in ['credit','capacity']:
   call=m.owner_call(mode,1,'reverse-guard-owner-key');sql=m.holding_sql(call,True,mode,1)
   function='public.assign_operations_obligation_own_credit_v1' if mode=='credit' else 'public.append_operations_obligation_credit_capacity_v1'
   self.assertEqual(sql.count(function),1)
   self.assertLess(sql.index('credit_cap_reverse_actual_holder_reply_required'),sql.index('perform pg_sleep(8)'))
   self.assertIn("r->'revision'=to_jsonb(1)",sql);self.assertIn("r->'eac_minor'='null'::jsonb",sql)
   self.assertIn("select current_setting('test.credit_cap_reverse_holder_reply')::jsonb",sql)
  sql=m.holding_sql(m.reader_sql(e,'a'*64))
  self.assertEqual(sql.count('public.read_operations_obligation_original_v1'),1)
  for check in ["r->'amount_minor'='540000'::jsonb","r->'committed_minor'='null'::jsonb","r->>'state'='bound_original'"]:self.assertIn(check,sql)
  self.assertLess(sql.index('credit_cap_reverse_actual_holder_reply_required'),sql.index('perform pg_sleep(8)'))
 def test_holder_invalid_shape_mode_revision_or_multiple_statement_refuses(self):
  for args in [("select 1; select 2;",False),('select 1;',True,'other',1),('select 1;',True,'credit',0),('select 1;',True,'capacity',True),(None,False)]:
   with self.assertRaises(m.Refusal):m.holding_sql(*args)
 def test_real_harness_unknown_shared_failure_subclasses_never_reflect(self):
  class ClosedFailure(Exception):
   def __init__(self,code='55P03',retain_private=False):self.code=code;self.retain_private=retain_private
  class Failure(Exception):
   def __init__(self,phase='cleanup',code='unclassified',retain=False):self.phase=phase;self.code=code;self.retain=retain
  class BaseHarness:
   def __init__(self,env,private,shared):self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock()
  for parent in [ClosedFailure,Exception]:
   calls=[]
   class Hostile(parent):
    def __init__(self):Exception.__init__(self)
    @property
    def code(self):calls.append('code');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def retain_private(self):calls.append('retain');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_SENTINEL')
    def __str__(self):calls.append('str');raise RuntimeError('PRIVATE_SENTINEL')
   def fail(*args):raise Hostile()
   shared=SimpleNamespace(run_private=fail,ClosedFailure=ClosedFailure)
   base=SimpleNamespace(Harness=BaseHarness,shared_module=lambda:shared,Failure=Failure)
   with tempfile.TemporaryDirectory() as d:
    h=m.make_harness(base,self.env(),pathlib.Path(d),{},e)
    with self.assertRaises(Failure) as result:h.run('state',['psql','-X'])
    self.assertEqual(result.exception.phase,'cleanup');self.assertEqual(result.exception.code,'unclassified');self.assertTrue(result.exception.retain)
    # Exercise the actual main diagnostic after the real h.run conversion.
    def run_failure(_env):h.run('state',['psql','-X'])
    out=io.StringIO()
    with patch.object(m,'execute',new=run_failure),patch.object(m.sys,'argv',['reverse']),patch.object(m.signal,'signal'),contextlib.redirect_stdout(out):self.assertEqual(m.main(),1)
    self.assertEqual(out.getvalue(),m.PREFIX+' FAIL unclassified\n');self.assertEqual(calls,[])
 def test_real_harness_exact_shared_failure_keeps_owned_code_and_retention(self):
  class ClosedFailure(Exception):
   def __init__(self,code,retain_private):self.code=code;self.retain_private=retain_private
  class Failure(Exception):
   def __init__(self,phase,code,retain):self.phase=phase;self.code=code;self.retain=retain
  class BaseHarness:
   def __init__(self,env,private,shared):self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock()
  for retain in [False,True]:
   def fail(*args):raise ClosedFailure('55P03',retain)
   shared=SimpleNamespace(run_private=fail,ClosedFailure=ClosedFailure);base=SimpleNamespace(Harness=BaseHarness,shared_module=lambda:shared,Failure=Failure)
   with tempfile.TemporaryDirectory() as d:
    h=m.make_harness(base,self.env(),pathlib.Path(d),{},e)
    with self.assertRaises(Failure) as result:h.run('state',['psql','-X'])
    self.assertEqual(result.exception.phase,'state');self.assertEqual(result.exception.code,'55P03');self.assertIs(result.exception.retain,retain)
if __name__=='__main__':unittest.main()
