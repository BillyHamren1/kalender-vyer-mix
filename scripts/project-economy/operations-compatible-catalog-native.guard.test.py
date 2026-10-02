"""Selected catalog boundaries; no real PostgreSQL connection or dispatch."""
import ast
import contextlib
import hashlib
import importlib.util
import inspect
import io
import json
import os
import pathlib
import shutil
import stat
import sys
import tempfile
import unittest
from unittest import mock

PATH=pathlib.Path(__file__).with_name('operations-compatible-catalog-native.py')
spec=importlib.util.spec_from_file_location('selected_catalog_guard',PATH)
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
BASE={**w.FIXED_ENV,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234','PATH':os.environ['PATH']}

class CatalogBoundary(unittest.TestCase):
 def test_hostile_environment_cannot_launch_child(self):
  changes=[{'CI':'false'},{'PGHOST':'remote'},{'PGHOST':'localhost'},{'PGHOSTADDR':'127.0.0.1'},{'PGPORT':'6543'},{'PGUSER':'service_role'},{'PGDATABASE':'postgres'},{'PGOPTIONS':'PRIVATE'},{'PGSERVICE':'PRIVATE'},{'PGSERVICEFILE':'/private'},{'PGPASSFILE':'/private'},{'PGCONNECT_TIMEOUT':'99'},{'EVENTFLOW_COMPATIBLE_CATALOG_ISOLATED_DB':'false'},{'EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB':'true'},{'EVENTFLOW_COMPATIBLE_CATALOG_DENO_BIN':'relative/deno'},{'HTTP_PROXY':'PRIVATE'},{'http_proxy':'PRIVATE'},{'HTTPS_PROXY':'PRIVATE'},{'all_proxy':'PRIVATE'},{'NO_PROXY':'PRIVATE'},{'BASH_ENV':'/private'},{'ENV':'/private'},{'PYTHONPATH':'/private'},{'PYTHONHOME':'/private'},{'NODE_OPTIONS':'PRIVATE'},{'LD_PRELOAD':'/private'},{'LD_LIBRARY_PATH':'/private'},{'LD_AUDIT':'/private'},{'LD_DEBUG':'PRIVATE'},{'LD_DEBUG_OUTPUT':'/private'},{'LD_BIND_NOW':'1'},{'GCONV_PATH':'/private'},{'LOCPATH':'/private'},{'OPENSSL_CONF':'/private'},{'OPENSSL_MODULES':'/private'},{'DYLD_INSERT_LIBRARIES':'/private'},{'BASH_FUNC_psql%%':'PRIVATE'},{'SHELLOPTS':'PRIVATE'},{'BASHOPTS':'PRIVATE'},{'PS4':'PRIVATE'},{'PYTHONSTARTUP':'/private'},{'PYTHONINSPECT':'1'},{'TMPDIR':'/private'},{'TMP':'/private'},{'TEMP':'/private'},{'DOCKER_HOST':'PRIVATE'},{'SUPABASE_URL':'PRIVATE'},{'PGRST_DB_URI':'PRIVATE'},{'DATABASE_URL':'PRIVATE'},{'DB_URL':'PRIVATE'},{'DENO_NO_PACKAGE_JSON':'0'},{'PYTHONDONTWRITEBYTECODE':'0'},{'GITHUB_RUN_ID':'1;PRIVATE'},{'GITHUB_REPOSITORY':'foreign/repo'}]
  with mock.patch.object(w,'run_private',side_effect=AssertionError('child forbidden')) as child:
   for delta in changes:
    with self.subTest(keys=list(delta)),self.assertRaises(w.ClosedFailure) as result:w.execute({**BASE,**delta})
    self.assertEqual(result.exception.phase,'guard')
   child.assert_not_called()

 def test_exact_source_closure_and_no_source_order_escape(self):
  base=w.load_base()
  with tempfile.TemporaryDirectory() as temporary:
   root=pathlib.Path(temporary)/'owned';root.mkdir();v=json.loads(w.CLOSURE.read_text())
   for name in v['files']:
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(w.ROOT/name,p)
   manifest=root/'closure.json';manifest.write_text(json.dumps(v))
   self.assertEqual(len(w.closure_paths(base,root,manifest)),23)
   p=root/v['ordered_schema_paths'][0];original=p.read_bytes();p.write_bytes(original+b'\n')
   with self.assertRaises(w.ClosedFailure):w.closure_paths(base,root,manifest)
   p.write_bytes(original);p.unlink();p.symlink_to(w.ROOT/v['ordered_schema_paths'][0])
   with self.assertRaises(w.ClosedFailure):w.closure_paths(base,root,manifest)
   p.unlink();p.write_bytes(original)
   bad=json.loads(json.dumps(v));bad['ordered_schema_paths'].reverse();manifest.write_text(json.dumps(bad))
   with self.assertRaises(w.ClosedFailure):w.closure_paths(base,root,manifest)
   bad=json.loads(json.dumps(v));bad['files']['../private']='a'*64;manifest.write_text(json.dumps(bad))
   with self.assertRaises(w.ClosedFailure):w.closure_paths(base,root,manifest)

 def test_nonfresh_database_refuses_before_application_ddl(self):
  seen=[]
  def fake(shared,phase,command,env,private,timeout,stdin=None):
   seen.append(phase);self.assertEqual(phase,'fresh_database');self.assertNotIn(b'create ',stdin.lower());self.assertNotIn(b'insert ',stdin.lower());p=private/'f';p.write_text('f\n');return p
  with mock.patch.object(w,'run_private',side_effect=fake),self.assertRaises(w.ClosedFailure) as result:w.execute(BASE)
  self.assertEqual(seen,['fresh_database']);self.assertEqual(result.exception.phase,'fresh_database')

 def test_complete_owned_invocation_signature_binding(self):
  signature=inspect.signature(w.run_private);tree=ast.parse(PATH.read_text());count=0
  for node in ast.walk(tree):
   if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='run_private':
    self.assertFalse(any(isinstance(x,ast.Starred) for x in node.args));self.assertFalse(any(k.arg is None for k in node.keywords))
    signature.bind(*[object() for _ in node.args],**{k.arg:object() for k in node.keywords});count+=1
  self.assertGreaterEqual(count,10)
  with self.assertRaises(TypeError):signature.bind(*[object() for _ in range(5)])

 def test_fixed_mutation_map_no_unknown_or_duplicate_selector(self):
  s=(w.HERE/'operations-compatible-catalog-negativecases.sql').read_text();v=w.cases_sql(s);self.assertEqual(tuple(v),w.CASES)
  for bad in (s+s,s.replace('owner_drift','PRIVATE',1),s.replace('-- END CASE owner_drift','-- END CASE other',1)):
   with self.assertRaises(w.ClosedFailure):w.cases_sql(bad)
  q=(w.HERE/'operations-compatible-catalog-read.sql').read_text();p=w.projection_sql(q)
  self.assertTrue(p.startswith('with catalog as ('));self.assertNotIn('begin read',p.lower());self.assertNotIn('rollback;',p.lower())
  self.assertIn("'transaction_read_only',current_setting('transaction_read_only')='on'",p)
  with self.assertRaises(w.ClosedFailure):w.projection_sql(q+'PRIVATE')

 def test_private_child_sql_error_and_unknown_failure_are_redacted(self):
  shared=w.load_base().load_shared()
  with tempfile.TemporaryDirectory() as temporary:
   private=pathlib.Path(temporary);private.chmod(0o700);output=io.StringIO()
   command=[sys.executable,'-c',"import sys;print('PRIVATE_ROWS');print('ERROR: 42501: PRIVATE_SQL_CONTEXT',file=sys.stderr);sys.exit(1)"]
   with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output),self.assertRaises(w.ClosedFailure) as result:w.run_private(shared,'case_owner_drift',command,dict(os.environ),private,2)
   self.assertEqual(output.getvalue(),'');self.assertEqual(result.exception.phase,'case_owner_drift');self.assertEqual(result.exception.code,'42501')
   for p in (private/'case_owner_drift').iterdir():self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)
   self.assertEqual(stat.S_IMODE((private/'case_owner_drift').stat().st_mode),0o700)
  class HostileException(Exception):
   @property
   def __class__(self):raise RuntimeError('PRIVATE_CLASS')
  output=io.StringIO()
  with mock.patch.object(w,'execute',side_effect=HostileException('PRIVATE_BODY')),contextlib.redirect_stderr(output):self.assertEqual(w.main(),1)
  self.assertEqual(output.getvalue(),'operations-compatible-catalog-native FAIL guard SQLSTATE=unclassified\n')
  self.assertEqual(w.ClosedFailure('PRIVATE_PHASE','PRIVATE_CODE').phase,'guard');self.assertEqual(w.ClosedFailure('guard','PRIVATE_CODE').code,'unclassified')

 def test_private_json_duplicate_nonfinite_oversized_and_symlink_denied(self):
  with tempfile.TemporaryDirectory() as temporary:
   p=pathlib.Path(temporary)/'rows'
   for value in ('{"a":1,"a":2}\n','{"a":NaN}\n','x'*(8*1024*1024+1)):
    p.write_text(value)
    with self.assertRaises(w.ClosedFailure):w.json_rows(p,'baseline')
   p.unlink();p.symlink_to(w.CLOSURE)
   with self.assertRaises(w.ClosedFailure):w.json_rows(p,'baseline')

 def test_metadata_never_promotes_complete_authority(self):
  for v in ({'schema':'operations-compatible-catalog-selected-incomplete.v1'},{'full_certificate':True},{'transaction_read_only':True}):
   with self.assertRaises(w.ClosedFailure):w.read_doc(v,True)
  good={'full_seed_sha256':'a'*64,'service_direct_core_execute':False,'temporary_roles':0};self.assertEqual(w.validate_controls(good),good)
  for delta in ({'full_seed_sha256':'PRIVATE'},{'service_direct_core_execute':0},{'temporary_roles':True},{'temporary_roles':2},{'PRIVATE':'BODY'}):
   with self.assertRaises(w.ClosedFailure):w.validate_controls({**good,**delta})

 def test_owned_timeout_kills_and_reaps_private_child(self):
  shared=w.load_base().load_shared()
  with tempfile.TemporaryDirectory() as temporary:
   private=pathlib.Path(temporary);pid=private/'pid'
   command=[sys.executable,'-c',"import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pid)]
   with self.assertRaises(w.ClosedFailure):w.run_private(shared,'baseline',command,dict(os.environ),private,.3)
   with self.assertRaises(ProcessLookupError):os.kill(int(pid.read_text()),0)

if __name__=='__main__':unittest.main()
