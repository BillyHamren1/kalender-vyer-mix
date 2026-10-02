#!/usr/bin/env python3
"""NEW strict source-only guards; native owner/queue execution remains separate."""
import copy
import contextlib
import io
import importlib.util
import pathlib
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('owner_candidate',HERE/'remaining-six-containing-owner-native.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Guards(unittest.TestCase):
 def env(self,db='operations_hired_authority_runtime'):
  return {'CI':'true',m.FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':db,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234'}
 def snapshot(self):
  names=['auth.users']+['public.table_'+str(i).zfill(2) for i in range(61)]
  v={'schema':'remaining-six-owner-state.v1','tables':[{'name':n,'count':1,'fingerprint':'a'*64} for n in names]}
  return v,names
 def test_exact_three_database_modes(self):
  for db,mode in m.DATABASES.items():self.assertEqual(m.guard(self.env(db)),mode)
 def test_host_and_database_refuse_before_child(self):
  for k,v in [('PGHOST','localhost'),('PGHOST','example.com'),('PGDATABASE','operations_remaining_six_read_runtime'),('PGDATABASE','eventflow_own_credit_foreign'),('PGPORT','55409'),('PGUSER','service_role'),('CI','false')]:
   e=self.env();e[k]=v
   with patch.object(m,'load_source',side_effect=AssertionError('must not load')):
    with self.assertRaises(m.Refusal):m.execute(e)
 def test_injection_zero_source_and_child(self):
  for key in ['LD_AUDIT','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','NODE_USE_ENV_PROXY','HTTP_PROXY','https_proxy','ALL_PROXY','NO_PROXY','PGOPTIONS','PGHOSTADDR','PGSERVICE','DOCKER_HOST','COMPOSE_FILE','TMPDIR','BASH_ENV','EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB']:
   e=self.env();e[key]='hostile'
   with patch.object(m,'load_source',side_effect=AssertionError('must not load')):
    with self.assertRaises(m.Refusal):m.execute(e)
 def test_missing_explicit_flag(self):
  e=self.env();e.pop(m.FLAG)
  with self.assertRaises(m.Refusal):m.guard(e)
 def test_invalid_run_or_repository(self):
  for k,v in [('GITHUB_RUN_ID','../1'),('GITHUB_RUN_ID','1'*21),('GITHUB_REPOSITORY','BillyHamren1/eventflow-finance')]:
   e=self.env();e[k]=v
   with self.assertRaises(m.Refusal):m.guard(e)
 def test_exact_state(self):
  v,n=self.snapshot();self.assertEqual(len(m.state(v,n)),62)
 def test_same_count_changed_head_fingerprint_rejected(self):
  v,n=self.snapshot();before=m.state(v,n);v['tables'][7]['fingerprint']='b'*64
  after=m.state(v,n)
  with self.assertRaises(m.Refusal):m.unchanged(before,after)
 def test_allowed_metadata_never_exempts_other_table(self):
  v,n=self.snapshot();before=m.state(v,n);v['tables'][1]['fingerprint']='b'*64;after=m.state(v,n)
  m.unchanged(before,after,{n[1]})
  v['tables'][2]['fingerprint']='c'*64
  with self.assertRaises(m.Refusal):m.unchanged(before,m.state(v,n),{n[1]})
 def test_state_inventory_identity_required(self):
  v,n=self.snapshot();v['tables'][-1]['name']='public.unexpected'
  with self.assertRaises(m.Refusal):m.state(v,n)
 def test_state_duplicate_or_missing_table(self):
  for which in ['duplicate','missing']:
   v,n=self.snapshot()
   if which=='duplicate':v['tables'][1]=copy.deepcopy(v['tables'][0])
   else:v['tables'].pop()
   with self.assertRaises(m.Refusal):m.state(v,n)
 def test_state_strict_count_and_fingerprint(self):
  for key,value in [('count',True),('count','1'),('count',1001),('count',-1),('fingerprint',['a'*64]),('fingerprint','a'*63)]:
   v,n=self.snapshot();v['tables'][0][key]=value
   with self.assertRaises(m.Refusal):m.state(v,n)
 def test_unknown_output_fields_rejected(self):
  v,n=self.snapshot();v['actor']='supplied'
  with self.assertRaises(m.Refusal):m.state(v,n)
  v,n=self.snapshot();v['tables'][0]['amount_minor']=0
  with self.assertRaises(m.Refusal):m.state(v,n)
 def test_old_script_markers_exact_all_modes(self):
  for mode,expected in m.EXPECTED.items():
   prefix='operations-'+{'hired':'hired','credit':'own-credit','capacity':'credit-capacity'}[mode]+'-native PASS '
   self.assertEqual(m.script_markers(mode,'\n'.join(prefix+x for x in expected)),list(expected))
 def test_partial_duplicate_or_extra_script_marker_refuses(self):
  mode='hired';prefix='operations-hired-native PASS ';expected=m.EXPECTED[mode]
  for values in [expected[:-1],expected+(expected[-1],),expected+('unapproved',),tuple(reversed(expected))]:
   with self.assertRaises(m.Refusal):m.script_markers(mode,'\n'.join(prefix+x for x in values))
 def test_unknown_exception_diagnostic_never_reflects_private_properties(self):
  for parent in [Exception,m.Refusal,m.NativeFailure]:
   calls=[]
   class Hostile(parent):
    def __init__(self):Exception.__init__(self)
    @property
    def owner_phase(self):calls.append('owner_phase');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def phase(self):calls.append('phase');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def code(self):calls.append('code');raise RuntimeError('PRIVATE_SENTINEL')
    @property
    def __class__(self):calls.append('__class__');raise RuntimeError('PRIVATE_SENTINEL')
    def __str__(self):calls.append('__str__');raise RuntimeError('PRIVATE_SENTINEL')
   def raise_hostile(_env):raise Hostile()
   out=io.StringIO()
   with patch.object(m,'execute',new=raise_hostile),patch.object(m.sys,'argv',['owner']),patch.object(m.signal,'signal'),contextlib.redirect_stdout(out):
    self.assertEqual(m.main(),1)
   self.assertEqual(calls,[])
   self.assertEqual(out.getvalue(),'remaining-six-containing-owner-native FAIL unclassified\n')
 def test_owned_closed_failure_uses_only_fixed_phase_and_sqlstate(self):
  def fail(_env):raise m.NativeFailure('reverse','55P03')
  out=io.StringIO()
  with patch.object(m,'execute',new=fail),patch.object(m.sys,'argv',['owner']),patch.object(m.signal,'signal'),contextlib.redirect_stdout(out):self.assertEqual(m.main(),1)
  self.assertEqual(out.getvalue(),'remaining-six-containing-owner-native FAIL reverse SQLSTATE 55P03\n')
  self.assertEqual(m.NativeFailure('PRIVATE_SENTINEL','PRIVATE_SENTINEL').phase,'unclassified')
 def test_real_scope_metadata_delta_three_and_money_neutral(self):
  names=['auth.users']+list(m.OWNER_DELTAS)+['public.other_'+str(i) for i in range(62-len(m.OWNER_DELTAS)-1)]
  before={name:{'count':0,'fingerprint':'a'*64} for name in names};after=copy.deepcopy(before)
  for name,delta in m.OWNER_DELTAS.items():after[name]={'count':delta,'fingerprint':'b'*64}
  m.owner_metadata(before,after)
  after['public.operations_project_scope_member_ownership']['count']=2
  with self.assertRaises(m.Refusal):m.owner_metadata(before,after)
  after['public.operations_project_scope_member_ownership']['count']=3
  after['auth.users']['fingerprint']='c'*64
  with self.assertRaises(m.Refusal):m.owner_metadata(before,after)
 def test_owned_child_has_server_and_security_budgets(self):
  seen=[]
  class BaseHarness:
   def __init__(self,env,private,shared):
    self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock()
  shared=SimpleNamespace(run_private=lambda *args:seen.append(args),ClosedFailure=RuntimeError)
  base=SimpleNamespace(Harness=BaseHarness,shared_module=lambda:shared,Failure=RuntimeError)
  with tempfile.TemporaryDirectory() as d:
   h=m.make_harness(base,self.env(),pathlib.Path(d),{})
   h.run('observer',['psql','-X'],seconds=5)
   env=seen[0][2]
   self.assertEqual(env['PGCONNECT_TIMEOUT'],'3')
   self.assertIn('-c idle_in_transaction_session_timeout=18000',env['PGOPTIONS'])
   self.assertIn('-c test.remaining_six_owner_isolated=synthetic-disposable',env['PGOPTIONS'])
   self.assertEqual(seen[0][5],5)
 def test_only_captured_legacy_shell_gets_ambient_options_removed(self):
  seen=[]
  class BaseHarness:
   def __init__(self,env,private,shared):
    self.env=env;self.private=private;self.shared=shared;self.index=0;self.index_lock=threading.Lock()
  shared=SimpleNamespace(run_private=lambda *args:seen.append(args),ClosedFailure=RuntimeError)
  base=SimpleNamespace(Harness=BaseHarness,shared_module=lambda:shared,Failure=RuntimeError)
  with tempfile.TemporaryDirectory() as d:
   h=m.make_harness(base,self.env(),pathlib.Path(d),{})
   h.run('holder',['bash',str(m.HERE/'operations-hired-personnel-native-concurrency.sh')])
   self.assertNotIn('PGOPTIONS',seen[-1][2])
   h.run('holder',['bash','/tmp/unapproved.sh'])
   self.assertIn('PGOPTIONS',seen[-1][2])
 def test_same_count_money_reference_change_is_never_metadata(self):
  v,n=self.snapshot();before=m.state(v,n);v['tables'][40]['fingerprint']='d'*64
  with self.assertRaises(m.Refusal):m.unchanged(before,m.state(v,n),{n[4],n[5]})
 def test_sql_literal_preserves_quotes_and_backslashes(self):
  value={'a':"x'\\y"};out=m.literal(value)
  self.assertTrue(out.startswith("'"));self.assertTrue(out.endswith("'::jsonb"));self.assertIn("x''",out)

if __name__=='__main__':unittest.main()
