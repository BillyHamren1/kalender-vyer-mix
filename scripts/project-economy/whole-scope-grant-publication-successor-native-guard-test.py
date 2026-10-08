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
spec=importlib.util.spec_from_file_location('grant_runner',HERE/'whole-scope-grant-publication-successor-native-runner.py')
subject=importlib.util.module_from_spec(spec);spec.loader.exec_module(subject)
ENV=subject.FIXED|{'GITHUB_RUN_ID':'123456','PGPASSWORD':'synthetic_native_password'}

class GuardTests(unittest.TestCase):
 def test_closed_status_and_checkpoint_diagnostics(self):
  resource,_=self.resource();cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py')
  for value in ('PRIVATE_SENTINEL',True,999,None):
   self.assertIsNone(subject.Failure('case',http_status=value).http_status)
  error=subject.Failure('case',http_status=503)
  mapped=subject.closed_case(error,0,resource.Failure,cases.CaseFailure,'case_0_http_receipt')
  self.assertEqual((mapped.phase,mapped.code,mapped.http_status),('case_0_http_receipt','unclassified',503))
  output=io.StringIO()
  with mock.patch.object(subject,'execute',side_effect=mapped),mock.patch.object(subject.signal,'signal'),contextlib.redirect_stderr(output):
   self.assertEqual(subject.main(),1)
  self.assertEqual(output.getvalue(),'scope-successor-native FAIL case_0_http_receipt SQLSTATE=unclassified HTTP_STATUS=503\n')
  mapped=subject.closed_case(cases.CaseFailure(0),0,resource.Failure,cases.CaseFailure,'case_0_saved_receipt')
  self.assertEqual(mapped.phase,'case_0_saved_receipt')
  self.assertEqual(subject.closed_case(error,1,resource.Failure,cases.CaseFailure,'case_0_http_receipt').phase,'case_1')
 def test_case0_history_failure_has_state_checkpoint(self):
  resource,_=self.resource();cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py')
  c=cases.Cases(lambda *args:None,None,None,None,None)
  c.state=lambda:{'publication_head':1,'grant_head':1,'publications':1,'receipts':1,'bindings':0,'events':1,'owners':1}
  c.command=lambda label:{}
  c.history=lambda revision:(_ for _ in ()).throw(RuntimeError('PRIVATE_SENTINEL'))
  with self.assertRaises(RuntimeError):c.run_all()
  self.assertEqual(c.checkpoint,'case_0_state')
  mapped=subject.closed_case(RuntimeError('PRIVATE_SENTINEL'),0,resource.Failure,cases.CaseFailure,c.checkpoint)
  self.assertEqual((mapped.phase,mapped.code),('case_0_state','unclassified'))
 def test_actual_valid_fixed_environment(self):
  self.assertEqual(subject.guard(ENV),'scope-successor-123456')
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
   self.assertEqual(output.getvalue(),'scope-successor-native FAIL case SQLSTATE=unclassified\n')
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
  resource,_shared=self.resource();cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py')
  value=subject.closed(resource.Failure('fixture','55P03',True),'schema',resource.Failure)
  self.assertEqual((value.phase,value.code,value.retain),('schema','55P03',True))
  value=subject.closed(cases.CaseFailure(4),'case',resource.Failure,cases.CaseFailure)
  self.assertEqual((value.phase,value.code,value.retain),('case_4','unclassified',False))
 def test_known_http_case_failure_keeps_exact_case_and_cleanup_phase(self):
  resource,_shared=self.resource();cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py')
  failure=subject.closed_case(subject.Failure('case'),6,resource.Failure,cases.CaseFailure)
  self.assertEqual((failure.phase,failure.code,failure.retain),('case_6','unclassified',False))
  failure=subject.closed_case(subject.Failure('cleanup',retain=True),6,resource.Failure,cases.CaseFailure)
  self.assertEqual((failure.phase,failure.retain),('cleanup',True))
 def test_revocation_denial_uses_fresh_command_key(self):
  cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py');packets=[]
  for kind in ('gate','issuer','project'):
   c=cases.Cases(lambda *_args:None,lambda *_args:object(),lambda *_args:None,lambda *_args:None,lambda command,status:packets.append((kind,command,status)) or {'code':'42501'})
   c.command=lambda label:{'idempotency_key':'successor-native-'+label}
   c.writer=lambda command,after=False:command;c.state=lambda:{'unchanged':True}
   c.revoke_queue(kind,'fixed update;','fixed restore;')
  self.assertEqual(len(packets),3)
  for kind,command,status in packets:self.assertEqual(command,{'idempotency_key':'successor-native-deny_'+kind});self.assertEqual(status,403)
 def test_symlink_closure_rejected_before_source_import(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);here=root/'scripts'/'project-economy';here.mkdir(parents=True)
   foreign=root/'foreign.json';foreign.write_text('{}');(here/'whole-scope-grant-publication-successor-native-closure.json').symlink_to(foreign)
   with mock.patch.object(subject,'ROOT',root),mock.patch.object(subject,'HERE',here),mock.patch.object(subject,'load',side_effect=AssertionError('unsealed_import')) as loader:
    with self.assertRaises(subject.Failure):subject.closure()
    loader.assert_not_called()
 def test_unpublished_source_closure_is_failclosed_before_import(self):
  manifest=json.loads((HERE/'whole-scope-grant-publication-successor-native-closure.json').read_text())
  with mock.patch.object(subject.json,'loads',return_value=manifest|{'status':'staged_unpublished_source_failclosed'}),mock.patch.object(subject,'load',side_effect=AssertionError('unsealed_import')) as loader:
   with self.assertRaises(subject.Failure):subject.closure()
   loader.assert_not_called()
 def test_shared_helper_symlink_rejected_before_any_source_import(self):
  import shutil
  manifest=json.loads((HERE/'whole-scope-grant-publication-successor-native-closure.json').read_text())
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);here=root/'scripts'/'project-economy';here.mkdir(parents=True)
   for relative in manifest['files']|manifest['owned_paths']:
    target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(subject.ROOT/relative,target)
    if relative in manifest['owned_paths']:
     data=target.read_bytes();manifest['owned_paths'][relative]['sha256']=hashlib.sha256(data).hexdigest();manifest['owned_paths'][relative]['size']=len(data)
   helper=here/'operations-hired-personnel-native.py';shutil.copyfile(HERE/helper.name,helper)
   (here/'whole-scope-grant-publication-successor-native-closure.json').write_text(json.dumps(manifest))
   from types import SimpleNamespace
   fake_resource=SimpleNamespace(Native=object,Failure=Exception);fake_adapter=SimpleNamespace(guarded_native=lambda *args:object)
   with mock.patch.object(subject,'ROOT',root),mock.patch.object(subject,'HERE',here),mock.patch.object(subject,'load',side_effect=[fake_resource,object(),fake_adapter]) as loader:
    subject.closure();self.assertEqual(loader.call_count,3)
    loader.reset_mock();helper.unlink();helper.symlink_to(HERE/helper.name)
    with self.assertRaises(subject.Failure):subject.closure()
    loader.assert_not_called()
 def resource(self):
  path=subject.ROOT/subject.RESOURCE_PATH
  self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),subject.RESOURCE_SHA)
  helper=HERE/'operations-hired-personnel-native.py';self.assertEqual(hashlib.sha256(helper.read_bytes()).hexdigest(),subject.SHARED_SHA)
  resource=subject.load(path);adapter=subject.load(HERE/'whole-scope-grant-publication-successor-native-owned-processes.py')
  resource.Native=adapter.guarded_native(resource.Native,resource.Failure)
  return resource,subject.load(helper)
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
 def test_exited_unreaped_leader_closed_stdio_descendant_drained(self):
  import time
  resource,shared=self.resource();adapter=subject.load(HERE/'whole-scope-grant-publication-successor-native-owned-processes.py')
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   script="import os,signal,time;pid=os.fork();\nif pid==0:\n signal.signal(signal.SIGTERM,signal.SIG_IGN);[os.close(fd) for fd in (0,1,2)];time.sleep(60);os._exit(0)\nelse:\n print(pid,flush=True);time.sleep(.2);os._exit(0)"
   child=native.start_process([sys.executable,'-I','-B','-c',script])
   try:
    deadline=time.monotonic()+3
    while native._exit(child) is None:
     self.assertLess(time.monotonic(),deadline);time.sleep(.02)
    self.assertEqual(adapter.snapshot(child.pid)[5],b'Z')
    descendant=int(native.children[child][0].read_text().strip())
    self.assertNotEqual(adapter.snapshot(descendant)[5],b'Z')
    native.finish(child)
    state=adapter.snapshot(descendant);self.assertTrue(state is None or state[5]==b'Z')
    self.assertIsNone(adapter.snapshot(child.pid));self.assertEqual(native.children,{})
   finally:native.cleanup()
 def test_post_reap_interruption_refuses_all_numeric_operations(self):
  import time
  resource,shared=self.resource()
  # Class globals reference the exact adapter module dictionary loaded above.
  globals_=resource.Native.terminate.__globals__;actual_waitpid=globals_['os'].waitpid
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   child=native.start_process([sys.executable,'-I','-B','-c','pass'])
   def interrupted(pid,flags):
    result=actual_waitpid(pid,flags)
    self.assertEqual(result[0],child.pid)
    raise KeyboardInterrupt('PRIVATE_SENTINEL')
   with mock.patch.object(globals_['os'],'waitpid',side_effect=interrupted):
    with self.assertRaises(resource.Failure) as failure:native.finish(child)
   self.assertTrue(failure.exception.retain);self.assertEqual(native.custody[child]['stage'],'reaping_started')
   with mock.patch.dict(globals_,{'snapshot':mock.Mock(side_effect=AssertionError('numeric'))}),mock.patch.object(os,'getpgid',side_effect=AssertionError('numeric')) as group,mock.patch.object(os,'getsid',side_effect=AssertionError('numeric')) as session,mock.patch.object(os,'waitpid',side_effect=AssertionError('numeric')) as wait,mock.patch.object(os,'pidfd_open',side_effect=AssertionError('numeric')) as pidfd,mock.patch.object(signal,'pidfd_send_signal',side_effect=AssertionError('numeric')) as send:
    with self.assertRaises(resource.Failure):native.cleanup()
    globals_['snapshot'].assert_not_called()
    for operation in (group,session,wait,pidfd,send):operation.assert_not_called()
   self.assertIsNotNone(child.returncode)
 def test_proc_namespace_mismatch_denies_before_spawn(self):
  resource,shared=self.resource();globals_=resource.Native.start_process.__globals__
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   with mock.patch.dict(globals_,{'snapshot':lambda _pid:None}),mock.patch('subprocess.Popen',side_effect=AssertionError('spawn')) as spawn:
    with self.assertRaises(resource.Failure):native.start_process([sys.executable,'-c','pass'])
    spawn.assert_not_called();self.assertEqual(list(private.iterdir()),[])
 def test_late_wnowait_observation_cannot_accept_action(self):
  resource,shared=self.resource()
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   child=mock.Mock();out=private/'out';err=private/'err';out.write_bytes(b'');err.write_bytes(b'')
   native.children[child]=(out,err,0,None);native.custody[child]={'stage':'owned','leader':(123,0,123,123,1),'status':0};clock=[0]
   def late_exit(_child):clock[0]=2;return object()
   def drained(_child):native.custody[child]['stage']='reaped'
   with mock.patch.object(native,'_exit',side_effect=late_exit),mock.patch.object(native,'terminate',side_effect=drained),mock.patch.object(native.finish.__globals__['time'],'monotonic',side_effect=lambda:clock[0]):
    with self.assertRaises(resource.Failure):native.finish(child,timeout=1)
   self.assertEqual(native.children,{})
 def test_late_direct_reap_retains_without_numeric_retry(self):
  resource,shared=self.resource()
  with tempfile.TemporaryDirectory() as temp:
   private=pathlib.Path(temp);private.chmod(0o700);native=resource.Native(dict(os.environ),private,shared)
   child=mock.Mock();child.pid=123;native.children[child]=(private/'out',private/'err',0,None);native.custody[child]={'stage':'owned','leader':(123,0,123,123,1),'status':0};clock=[0]
   def late_reap(_pid,_flags):clock[0]=9;return (123,0)
   with mock.patch.object(native,'_bound'),mock.patch.object(native,'_members',return_value=[]),mock.patch.object(native,'_exit',return_value=object()),mock.patch.object(native.terminate.__globals__['time'],'monotonic',side_effect=lambda:clock[0]),mock.patch.object(os,'waitpid',side_effect=late_reap) as reap:
    with self.assertRaises(resource.Failure) as failure:native.terminate(child)
    self.assertTrue(failure.exception.retain);self.assertEqual(native.custody[child]['stage'],'reaping_started');self.assertEqual(reap.call_count,1)
   with mock.patch.object(native,'_bound',side_effect=AssertionError('numeric')) as bound,mock.patch.object(os,'waitpid',side_effect=AssertionError('numeric')) as reap:
    with self.assertRaises(resource.Failure):native.cleanup()
    bound.assert_not_called();reap.assert_not_called()
 def test_docker_foreign_and_replaced_names_never_removed(self):
  resource,_shared=self.resource()
  class Fake:
   def __init__(self):self.commands=[]
   def process(self,args,timeout=0):self.commands.append(args);return self.path
  for kind in ('foreign','replaced'):
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
    native=Fake();native.path=pathlib.Path(temp)/'response';docker=resource.OwnedDocker(native,'scope-successor-123456');docker.identifier='a'*64;docker.attempted=True
    def call(args,timeout=0):
     native.commands.append(args)
     value='a'*64 if args[0]=='ps' else ('b'*64 if kind=='replaced' else 'a'*64)+'|/scope-successor-123456|'+('foreign' if kind=='foreign' else docker.owner)
     native.path.write_text(value+'\n');return native.path
    docker.call=call
    with self.assertRaises(resource.Failure):docker.cleanup()
    self.assertFalse(any(args[0]=='rm' for args in native.commands))
 def test_docker_removes_only_verified_id_and_requires_final_absence(self):
  resource,_shared=self.resource()
  for residual in (False,True):
   with self.subTest(residual=residual),tempfile.TemporaryDirectory() as temp:
    class Fake:pass
    native=Fake();native.commands=[];path=pathlib.Path(temp)/'response';docker=resource.OwnedDocker(native,'scope-successor-123456');docker.identifier='a'*64;docker.attempted=True
    def call(args,timeout=0):
     native.commands.append(args)
     if args[0]=='inspect':text='a'*64+'|/scope-successor-123456|'+docker.owner
     elif args[0]=='rm':text='a'*64
     elif 'label=eventflow.scope-product-owner='+docker.owner in args:text='a'*64 if residual else ''
     else:text='a'*64
     path.write_text(text+'\n');return path
    docker.call=call
    if residual:
     with self.assertRaises(resource.Failure):docker.cleanup()
    else:docker.cleanup()
    self.assertIn(['rm','--force','a'*64],native.commands)
    self.assertFalse(any(args[0]=='rm' and 'scope-successor-123456' in args for args in native.commands))
 def test_resource_docker_uses_explicit_local_socket(self):
  resource,_shared=self.resource()
  class Fake:
   def process(self,command,timeout=0):self.command=command;return None
  native=Fake();resource.OwnedDocker(native,'scope-successor-123456').call(['ps'])
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
      self.assertEqual(request.full_url,'http://127.0.0.1:55652/rpc/publish_operations_whole_scope_granted_product_v2');self.assertEqual(request.get_method(),'POST');self.assertEqual(json.loads(request.data),{'p_command':{}})
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
  cases=subject.load(HERE/'whole-scope-grant-publication-successor-native-cases.py')
  subject_cases=cases.Cases(lambda *_args:(_ for _ in ()).throw(AssertionError('SQL capability')),None,None,None,None)
  for value in ({},{'schema_version':'private'},{'event_id':'private','fingerprint':['private']}):
   with self.assertRaises(cases.CaseFailure):subject_cases.saved(value,0)

if __name__=='__main__':unittest.main()
