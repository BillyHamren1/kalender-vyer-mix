#!/usr/bin/env python3
"""Meaningful capability-negative/resource tests; no Docker/DB capability."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import signal
import sys
import tempfile
import unittest
from unittest import mock

HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('grant_runner',HERE/'operations-whole-scope-grant-native-runner.py')
subject=importlib.util.module_from_spec(spec);spec.loader.exec_module(subject)
ENV=subject.FIXED|{'GITHUB_RUN_ID':'123456','PGPASSWORD':'synthetic_native_password'}

class GuardTests(unittest.TestCase):
 def test_actual_valid_fixed_environment(self):
  self.assertEqual(subject.guard(ENV),'scope-grant-123456')
 def test_hostile_environment_stops_before_capability(self):
  mutations=[{'CI':'false'},{'GITHUB_REPOSITORY':'foreign/repo'},{'PGDATABASE':'postgres'},{'PGHOST':'localhost'},{'PGPORT':'5433'},{'PGUSER':'service_role'},{'GITHUB_RUN_ID':'1;bad'},{'PGPASSWORD':'abc\nprivate'},
   {'PGOPTIONS':'-c search_path=private'},{'PGSERVICE':'foreign'},{'PGSSLMODE':'disable'},{'DATABASE_URL':'private'},{'DOCKER_HOST':'private'},{'DOCKER_CONTEXT':'private'},{'COMPOSE_FILE':'private'},{'PGRST_DB_URI':'private'},{'SUPABASE_URL':'private'},
   {'HTTP_PROXY':'private'},{'https_proxy':'private'},{'ALL_PROXY':'private'},{'no_proxy':'private'},{'NODE_OPTIONS':'private'},{'PYTHONPATH':'private'},{'PYTHONHOME':'private'},{'PYTHONSTARTUP':'private'},{'PYTHONINSPECT':'1'},
   {'GCONV_PATH':'private'},{'LOCPATH':'private'},{'OPENSSL_CONF':'private'},{'OPENSSL_MODULES':'private'},{'DENO_DIR':'private'},{'LD_PRELOAD':'private'},{'LD_LIBRARY_PATH':'private'},{'DYLD_INSERT_LIBRARIES':'private'},{'BASH_FUNC_private%%':'private'},{'BASH_ENV':'private'},{'ENV':'private'},{'SHELLOPTS':'private'},{'BASHOPTS':'private'},{'PS4':'private'},{'TMPDIR':'private'},{'EVENTFLOW_WHOLE_SCOPE_PRODUCT_PUBLICATION_ISOLATED_DB':'true'}]
  for mutation in mutations:
   with self.subTest(keys=tuple(mutation)),mock.patch.object(subject,'closure',side_effect=AssertionError('capability_called')) as capability:
    with self.assertRaises(subject.Failure):subject.execute(ENV|mutation)
    capability.assert_not_called()
 def test_public_failure_sqlstate_privacy(self):
  for code in ('SECRT','ABCDE','12345','PRIVATE_SENTINEL'):
   failure=subject.Failure('PRIVATE_PHASE',code)
   self.assertEqual((failure.phase,failure.code,str(failure)),('guard','unclassified','closed_grant_native_failure'))
  self.assertEqual(subject.Failure('case_3','55P03').code,'55P03')
 def test_real_main_unknown_exception_properties_never_reflected(self):
  touched=[]
  class Hostile(Exception):
   def __getattribute__(self,name):
    if name in {'code','retain','phase','__dict__'}:touched.append(name);raise RuntimeError('PRIVATE_SENTINEL')
    return super().__getattribute__(name)
   def __str__(self):touched.append('str');raise RuntimeError('PRIVATE_SENTINEL')
  class Subclass(subject.Failure):
   def __getattribute__(self,name):
    if name in {'code','retain','phase','__dict__'}:touched.append(name);raise RuntimeError('PRIVATE_SENTINEL')
    return super().__getattribute__(name)
  for error in (Hostile(),Subclass('case','55P03',True)):
   output=io.StringIO()
   with mock.patch.object(subject,'execute',side_effect=error),mock.patch.object(subject.signal,'signal'),contextlib.redirect_stderr(output):
    self.assertEqual(subject.main(),1)
   self.assertEqual(output.getvalue(),'scope-grant-native FAIL case SQLSTATE=unclassified\n')
  self.assertEqual(touched,[])
 def test_real_execute_unknown_exception_properties_never_reflected(self):
  resource,shared=self.resource();touched=[];cleaned=[]
  class Hostile(Exception):
   def __getattribute__(self,name):
    if name in {'code','retain','phase','__dict__'}:touched.append(name);raise RuntimeError('PRIVATE_SENTINEL')
    return super().__getattribute__(name)
   def __str__(self):touched.append('str');raise RuntimeError('PRIVATE_SENTINEL')
  class Native:
   def __init__(self,*_args):pass
   def process(self,*_args,**_kwargs):raise Hostile()
   def cleanup(self):cleaned.append('native')
  class Docker:
   def __init__(self,*_args):pass
   def cleanup(self):cleaned.append('docker')
  with mock.patch.object(subject,'closure',return_value=({},resource,shared)),mock.patch.object(resource,'Native',Native),mock.patch.object(resource,'OwnedDocker',Docker),mock.patch.object(subject.socket,'socket'):
   with self.assertRaises(subject.Failure) as failure:subject.execute(ENV)
  self.assertEqual((failure.exception.phase,failure.exception.code,failure.exception.retain),('guard','unclassified',False))
  self.assertEqual(touched,[]);self.assertEqual(cleaned,['native','docker'])
 def test_only_exact_pinned_error_types_retain_closed_fields(self):
  resource,_shared=self.resource();cases=subject.load(HERE/'operations-whole-scope-grant-native-cases.py')
  value=subject.closed(resource.Failure('fixture','55P03',True),'schema',resource.Failure)
  self.assertEqual((value.phase,value.code,value.retain),('schema','55P03',True))
  value=subject.closed(cases.CaseFailure(4),'case',resource.Failure,cases.CaseFailure)
  self.assertEqual((value.phase,value.code,value.retain),('case_4','unclassified',False))
 def test_symlink_closure_rejected_before_source_import(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);here=root/'scripts'/'project-economy';here.mkdir(parents=True)
   foreign=root/'foreign.json';foreign.write_text('{}');(here/'operations-whole-scope-grant-native-closure.json').symlink_to(foreign)
   with mock.patch.object(subject,'ROOT',root),mock.patch.object(subject,'HERE',here),mock.patch.object(subject,'load',side_effect=AssertionError('unsealed_import')) as loader:
    with self.assertRaises(subject.Failure):subject.closure()
    loader.assert_not_called()
 def test_shared_helper_symlink_rejected_before_any_source_import(self):
  import shutil
  manifest=json.loads((HERE/'operations-whole-scope-grant-native-closure.json').read_text())
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);here=root/'scripts'/'project-economy';here.mkdir(parents=True)
   for relative in manifest['files']|manifest['owned_paths']:
    target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(subject.ROOT/relative,target)
    if relative in manifest['owned_paths']:
     data=target.read_bytes();manifest['owned_paths'][relative]['sha256']=hashlib.sha256(data).hexdigest();manifest['owned_paths'][relative]['size']=len(data)
   helper=here/'operations-hired-personnel-native.py';shutil.copyfile(HERE/helper.name,helper)
   (here/'operations-whole-scope-grant-native-closure.json').write_text(json.dumps(manifest))
   with mock.patch.object(subject,'ROOT',root),mock.patch.object(subject,'HERE',here),mock.patch.object(subject,'load',return_value=object()) as loader:
    subject.closure();self.assertEqual(loader.call_count,2)
    loader.reset_mock();helper.unlink();helper.symlink_to(HERE/helper.name)
    with self.assertRaises(subject.Failure):subject.closure()
    loader.assert_not_called()
 def resource(self):
  path=subject.ROOT/subject.RESOURCE_PATH
  self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),subject.RESOURCE_SHA)
  helper=HERE/'operations-hired-personnel-native.py';self.assertEqual(hashlib.sha256(helper.read_bytes()).hexdigest(),subject.SHARED_SHA)
  return subject.load(path),subject.load(helper)
 def test_actual_owned_abort_ignoring_descendant_terminated(self):
  resource,shared=self.resource()
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   script="import os,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);os.fork();time.sleep(30)"
   child=native.start_process([sys.executable,'-I','-B','-c',script])
   try:
    import time
    time.sleep(.1)
    with self.assertRaises(resource.Failure):native.finish(child,timeout=.15)
    self.assertFalse(shared.live_owned_group(child.pid));self.assertEqual(native.children,{})
   finally:native.cleanup()
 def test_docker_foreign_and_replaced_names_never_removed(self):
  resource,_shared=self.resource()
  class Fake:
   def __init__(self):self.commands=[]
   def process(self,args,timeout=0):self.commands.append(args);return self.path
  for kind in ('foreign','replaced'):
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
    native=Fake();native.path=pathlib.Path(temp)/'response';docker=resource.OwnedDocker(native,'scope-grant-123456');docker.identifier='a'*64;docker.attempted=True
    def call(args,timeout=0):
     native.commands.append(args)
     value='a'*64 if args[0]=='ps' else ('b'*64 if kind=='replaced' else 'a'*64)+'|/scope-grant-123456|'+('foreign' if kind=='foreign' else docker.owner)
     native.path.write_text(value+'\n');return native.path
    docker.call=call
    with self.assertRaises(resource.Failure):docker.cleanup()
    self.assertFalse(any(args[0]=='rm' for args in native.commands))
 def test_docker_removes_only_verified_id_and_requires_final_absence(self):
  resource,_shared=self.resource()
  for residual in (False,True):
   with self.subTest(residual=residual),tempfile.TemporaryDirectory() as temp:
    class Fake:pass
    native=Fake();native.commands=[];path=pathlib.Path(temp)/'response';docker=resource.OwnedDocker(native,'scope-grant-123456');docker.identifier='a'*64;docker.attempted=True
    def call(args,timeout=0):
     native.commands.append(args)
     if args[0]=='inspect':text='a'*64+'|/scope-grant-123456|'+docker.owner
     elif args[0]=='rm':text='a'*64
     elif 'label=eventflow.scope-product-owner='+docker.owner in args:text='a'*64 if residual else ''
     else:text='a'*64
     path.write_text(text+'\n');return path
    docker.call=call
    if residual:
     with self.assertRaises(resource.Failure):docker.cleanup()
    else:docker.cleanup()
    self.assertIn(['rm','--force','a'*64],native.commands)
    self.assertFalse(any(args[0]=='rm' and 'scope-grant-123456' in args for args in native.commands))
 def test_resource_docker_uses_explicit_local_socket(self):
  resource,_shared=self.resource()
  class Fake:
   def process(self,command,timeout=0):self.command=command;return None
  native=Fake();resource.OwnedDocker(native,'scope-grant-123456').call(['ps'])
  self.assertEqual(native.command[:3],['docker','--host','unix:///var/run/docker.sock'])
 def test_actual_http_error_success_and_body_limit_fixed_route(self):
  import http.client
  import http.server
  import threading
  class Handler(http.server.BaseHTTPRequestHandler):
   def do_POST(self):
    try:
     self.rfile.read(int(self.headers.get('Content-Length','0')))
     payload=b'x'*16385 if self.path=='/oversize' else b'{"code":"42501"}'
     self.send_response(403 if self.path=='/denied' else 200);self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
    except (BrokenPipeError,ConnectionResetError):pass
   def log_message(self,*_args):pass
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   for kind,status in (('denied',403),('success',200),('oversize',200),('lateparse',200)):
    class Opener:
     def open(inner,request,timeout=0):
      self.assertEqual(request.full_url,'http://127.0.0.1:55651/rpc/write_operations_whole_scope_product_export_grant_v1');self.assertEqual(request.get_method(),'POST');self.assertEqual(json.loads(request.data),{'p_command':{}})
      connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=timeout);connection.request('POST','/'+kind,body=b'{}');response=connection.getresponse()
      if kind=='denied':raise subject.urllib.error.HTTPError(request.full_url,status,'fixed',response.headers,response)
      return response
    clock=[0.0];original_loads=json.loads
    def parse(value,*args,**kwargs):
     result=original_loads(value,*args,**kwargs)
     if kind=='lateparse' and type(value) is str:clock[0]=16.0
     return result
    with mock.patch.object(subject.urllib.request,'build_opener',return_value=Opener()),mock.patch.object(subject.time,'monotonic',side_effect=lambda:clock[0]),mock.patch.object(subject.json,'loads',side_effect=parse):
     class Native:jwt='synthetic_token'
     if kind in {'oversize','lateparse'}:
      with self.assertRaises(subject.Failure):subject.native_http(Native(),{},status)
     else:self.assertEqual(subject.native_http(Native(),{},status),{'code':'42501'})
  finally:server.shutdown();server.server_close();thread.join(timeout=2)
 def test_malformed_receipt_denied_before_sql(self):
  cases=subject.load(HERE/'operations-whole-scope-grant-native-cases.py')
  subject_cases=cases.Cases(lambda *_args:(_ for _ in ()).throw(AssertionError('SQL capability')),None,None,None,None)
  for value in ({},{'schema_version':'private'},{'event_id':'private','fingerprint':['private']}):
   with self.assertRaises(cases.CaseFailure):subject_cases.saved(value,0)

if __name__=='__main__':unittest.main()
