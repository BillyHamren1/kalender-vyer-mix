#!/usr/bin/env python3
"""Hostile source/metadata/environment boundary controls; no child or remote capability."""
import contextlib,hashlib,importlib.util,io,json,os,pathlib,tempfile,unittest
from unittest import mock
HERE=pathlib.Path(__file__).absolute().parent
s=importlib.util.spec_from_file_location('renderer_guard',HERE/'whole-scope-granted-product-renderer-pure-guard.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_actual_complete_current_source_seal(self):
  d=m.validate();self.assertEqual(len(d['files']),11);self.assertEqual(sum(r['origin']=='genuine_operations_40ce' for r in d['files'].values()),7)
 def test_environment_hostile_zero_source_capability(self):
  env=m.FIXED.copy();m.environment(env)
  for mutation in ({'CI':'false'},{'GITHUB_REPOSITORY':'foreign/repo'},{'EVENTFLOW_WHOLE_SCOPE_RENDERER_PURE_ISOLATED':'false'},*({k:'PRIVATE_SENTINEL'} for k in ('PGHOST','PGRST_DB_URI','SUPABASE_URL','DATABASE_URL','GITHUB_TOKEN','DOCKER_HOST','COMPOSE_FILE','HTTP_PROXY','https_proxy','LD_PRELOAD','DYLD_INSERT_LIBRARIES','BASH_ENV','BASH_FUNC_private%%','OPENSSL_CONF','OPENSSL_MODULES','GCONV_PATH','LOCPATH','NODE_OPTIONS','DENO_DIR','PYTHONPATH','PYTHONINSPECT'))):
   with self.subTest(keys=tuple(mutation)),mock.patch.object(m,'validate') as capability,mock.patch.object(m.os,'environ',env|mutation),mock.patch.object(m.sys,'argv',['guard']),contextlib.redirect_stderr(io.StringIO()):
    self.assertEqual(m.main(),1);capability.assert_not_called()
 def test_source_nofollow_mode_hardlink_and_traversal(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);p=root/'source.ts';p.write_bytes(b'synthetic-source');p.chmod(0o600)
   self.assertEqual(m.read_owned(root,'source.ts',100,16),b'synthetic-source')
   for relative in ('../source.ts','/source.ts','./source.ts'):
    with self.assertRaises(m.Failure):m.read_owned(root,relative,100)
   p.chmod(0o666)
   with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100)
   p.chmod(0o600);os.link(p,root/'hard.ts')
   with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100)
   (root/'hard.ts').unlink();(root/'link.ts').symlink_to(p)
   with self.assertRaises(m.Failure):m.read_owned(root,'link.ts',100)
   (root/'directory-link').symlink_to(root,target_is_directory=True)
   with self.assertRaises(m.Failure):m.read_owned(root,'directory-link/source.ts',100)
 def test_fifo_rejected_without_blocking_or_read(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);os.mkfifo(root/'source.ts')
   with mock.patch.object(m.os,'read',side_effect=AssertionError('read_called')) as reader:
    with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100)
    reader.assert_not_called()
 def test_source_growth_replacement_and_expected_size(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);p=root/'source.ts';p.write_bytes(b'synthetic-source');p.chmod(0o600)
   with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100,17)
   with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',10)
   original=m.os.read;changed=False
   def replace(fd,size):
    nonlocal changed
    value=original(fd,size)
    if not changed:
     changed=True;q=root/'new.ts';q.write_bytes(b'synthetic-source');q.chmod(0o600);q.replace(p)
    return value
   with mock.patch.object(m.os,'read',side_effect=replace):
    with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100)
 def test_late_completed_read_is_denied(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);p=root/'source.ts';p.write_bytes(b'synthetic-source');p.chmod(0o600);original=m.os.read;clock=[0]
   def late(fd,size):value=original(fd,size);clock[0]=6;return value
   with mock.patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),mock.patch.object(m.os,'read',side_effect=late):
    with self.assertRaises(m.Failure):m.read_owned(root,'source.ts',100)
 def test_duplicate_manifest_and_foreign_source_slot(self):
  with self.assertRaises(m.Failure):json.loads('{"schema_version":1,"schema_version":2}',object_pairs_hook=m.unique)
  raw=(m.ROOT/m.MANIFEST).read_bytes();d=json.loads(raw);d['files']['../private-secret']={}
  with mock.patch.object(m,'read_owned',return_value=json.dumps(d).encode()) as reader:
   with self.assertRaises(m.Failure):m.validate()
   self.assertEqual(reader.call_count,1)
 def test_main_hostile_error_properties_never_reflected(self):
  touched=[]
  class Hostile(Exception):
   def __getattribute__(self,key):
    if key in {'phase','__dict__'}:touched.append(key);raise RuntimeError('PRIVATE_SENTINEL')
    return super().__getattribute__(key)
   def __str__(self):touched.append('str');raise RuntimeError('PRIVATE_SENTINEL')
  output=io.StringIO()
  with mock.patch.object(m,'environment',side_effect=Hostile()),mock.patch.object(m.sys,'argv',['guard']),contextlib.redirect_stderr(output):self.assertEqual(m.main(),1)
  self.assertEqual(output.getvalue(),'renderer-pure FAIL source\n');self.assertEqual(touched,[])
if __name__=='__main__':unittest.main()
