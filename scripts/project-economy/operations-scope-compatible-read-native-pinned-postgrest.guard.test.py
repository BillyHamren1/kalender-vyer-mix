#!/usr/bin/env python3
import contextlib,io,unittest.mock,builtins,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,types,unittest
HERE=pathlib.Path(__file__).absolute().parent;STAGE=HERE.parent.parent;CANONICAL=STAGE
BOOT=HERE/'operations-scope-compatible-read-native-pinned-postgrest.py';IMPL=HERE/'operations-scope-compatible-read-native-pinned-postgrest-impl.py';CLOSURE=HERE/'operations-scope-compatible-read-native-pinned-postgrest-closure.json'
WORKFLOW=STAGE/'.github/workflows/operations-project-economy.yml'
RUNTIME_OWN={str(p.relative_to(STAGE)) for p in (IMPL,pathlib.Path(__file__).absolute(),STAGE/'docs/project-economy/operations-scope-compatible-read-native-pinned-postgrest-contract.md')}
def load(path,name,seed=None):
 data=path.read_bytes();module=types.ModuleType(name);module.__file__=str(path);module.__dict__.update(seed or {});exec(compile(data,str(path),'exec'),module.__dict__);return module
def held(module,path):
 fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW);data=os.pread(fd,2097153,0);saved=module.identity(os.fstat(fd));return fd,{'fd':fd,'identity':saved,'bytes':data}
def launcher_open(module,path,expected,maximum):
 fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);data=os.pread(fd,maximum+1,0);after=os.fstat(fd)
  if module.identity(before)!=module.identity(after) or module.identity(after)!=module.identity(os.stat(path,follow_symlinks=False)) or len(data)>maximum or hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('held_authority_refused')
  return fd,{'fd':fd,'identity':module.identity(before),'bytes':data}
 except BaseException:os.close(fd);raise
def assembly(case):
 root=pathlib.Path(case.enterContext(tempfile.TemporaryDirectory()))/'root';value=json.loads(CLOSURE.read_text())
 for relative in value['files']:
  source=(STAGE if relative in RUNTIME_OWN else CANONICAL)/relative;target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);target.chmod(0o400)
 for source in (BOOT,CLOSURE):
  target=root/source.relative_to(STAGE);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);target.chmod(0o400)
 return root
def authorities(case,module,root):
 bfd,ba=held(module,root/module.BOOTSTRAP);cpath=root/'scripts/project-economy/operations-scope-compatible-read-native-pinned-postgrest-closure.json';cfd,ca=held(module,cpath)
 case.addCleanup(lambda: os.close(bfd));case.addCleanup(lambda: os.close(cfd));return cpath,ba,ca
class Tests(unittest.TestCase):
 def setUp(self):self.b=load(BOOT,'bootstrap');self.i=load(IMPL,'implementation')
 def env(self):return {'CI':'true','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1','EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB':'true',self.i.IMAGE_ENV:self.i.POSTGREST_IMAGE,'PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':'eventflow_scope_publication_runtime'}
 def test_selector_exact_and_empty_extra_denied(self):
  self.assertEqual(self.i.validate_environment(self.env()),('deno',self.i.POSTGREST_IMAGE))
  job=WORKFLOW.read_text().split('  compatible-product-reader-native:',1)[1].split('    steps:',1)[0]
  self.assertIn("      EVENTFLOW_SCOPE_COMPATIBLE_READ_POSTGREST_IMAGE: '"+self.i.POSTGREST_IMAGE+"'",job)
  missing=self.env();del missing[self.i.IMAGE_ENV]
  with self.assertRaises(self.i.ClosedFailure):self.i.validate_environment(missing)
  for value in ('','x'):
   changed=self.env();changed['EVENTFLOW_SCOPE_COMPATIBLE_READ_POSTGREST_TAG']=value
   with self.assertRaises(self.i.ClosedFailure):self.i.validate_environment(changed)
 def test_implementation_execute_a_ignores_path_swapped_b(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'impl.py';path.write_text("MARKER='B'\n")
   capability=object();module=self.b.compiled_module(b"globals().pop('__held_effect_capability__')\nMARKER='A'\n",path,'held_a',capability);self.assertEqual(module.MARKER,'A');self.assertEqual(path.read_text(),"MARKER='B'\n")
 def test_v4_closure_exact_and_acyclic(self):
  value=json.loads(CLOSURE.read_text());self.assertEqual(value['schema'],self.b.SCHEMA);self.assertEqual(len(value['files']),87);self.assertIn(self.b.IMPLEMENTATION,value['files']);self.assertEqual(set(RUNTIME_OWN)&set(value['files']),RUNTIME_OWN);self.assertNotIn(self.b.BOOTSTRAP,value['files']);self.assertNotIn(str(WORKFLOW.relative_to(STAGE)),value['files'])
 def test_materialized_implementation_accepts_exact_outer_v4_closure(self):
  root=assembly(self);paths=self.i.closure_paths(root,root/CLOSURE.relative_to(STAGE));self.assertEqual(len(paths),23);self.assertTrue(all(path.is_relative_to(root) for path in paths))
 def test_materialized_implementation_rejects_v2_and_outer_authority_members(self):
  root=assembly(self);manifest=root/CLOSURE.relative_to(STAGE);value=json.loads(manifest.read_text())
  for mutate in (
   lambda item:item.__setitem__('schema','operations-scope-compatible-read-native-pinned-postgrest-closure.v2'),
   lambda item:item['files'].__setitem__(self.b.BOOTSTRAP,{'bytes':0,'sha256':'0'*64,'git_blob':'0'*40}),
   lambda item:item['files'].__setitem__(str(WORKFLOW.relative_to(STAGE)),{'bytes':0,'sha256':'0'*64,'git_blob':'0'*40}),
  ):
   changed=json.loads(json.dumps(value));mutate(changed);manifest.chmod(0o600);manifest.write_text(json.dumps(changed));manifest.chmod(0o400)
   with self.assertRaises(self.i.ClosedFailure) as error:self.i.closure_paths(root,manifest)
   self.assertEqual(error.exception.phase,'source_closure')
  manifest.chmod(0o600);manifest.write_text(json.dumps(value));manifest.chmod(0o400)
 def test_direct_implementation_route_is_fail_closed(self):
  self.assertFalse(hasattr(self.i,'SourceCustody'))
  with self.assertRaises(self.i.ClosedFailure) as error:self.i.execute(self.env())
  self.assertEqual(error.exception.phase,'source_closure');self.assertTrue(error.exception.retain_private)
 def test_private_effect_entry_requires_held_capability_before_paths(self):
  reached=[];self.i.closure_paths=lambda *args:reached.append('paths')
  with self.assertRaises(self.i.ClosedFailure) as error:self.i._execute_materialized({},'deno','attacker/image:mutable')
  self.assertEqual(error.exception.phase,'guard');self.assertTrue(error.exception.retain_private);self.assertEqual(reached,[]);self.assertFalse(hasattr(self.i,'_effect_body'))
 def test_held_capability_binds_validated_values_once(self):
  capability=object();module=load(IMPL,'held_implementation',{'__held_effect_capability__':capability})
  original=self.env();module._install_held_authority(capability,original);original[module.IMAGE_ENV]='attacker/image:mutable'
  payload=module._consume_held_authority(capability,())
  self.assertNotIn(module.IMAGE_ENV,payload[0]);self.assertEqual(payload[1:],('deno',module.POSTGREST_IMAGE))
  with self.assertRaises(module.ClosedFailure):module._execute_materialized(capability)
  with self.assertRaises(module.ClosedFailure):module._install_held_authority(capability,self.env())
  second=object();armed=load(IMPL,'held_effect_entry',{'__held_effect_capability__':second});reached=[]
  armed._install_held_authority(second,self.env());armed.closure_paths=lambda *args:reached.append('paths') or (_ for _ in ()).throw(RuntimeError('sentinel'))
  with self.assertRaisesRegex(RuntimeError,'sentinel'):armed._execute_materialized(second)
  self.assertEqual(reached,['paths'])
 def test_capture_detects_canonical_swap(self):
  root=assembly(self);closure,bootstrap_authority,closure_authority=authorities(self,self.b,root);tree=self.b.HeldTree(root,closure,bootstrap_authority,closure_authority);victim=root/self.b.IMPLEMENTATION;old=victim.with_suffix('.old')
  try:victim.rename(old);shutil.copyfile(old,victim);victim.chmod(0o400);self.assertRaises(self.b.BootstrapFailure,tree.verify)
  finally:tree.close()
 def test_materialized_swap_detected_before_effect(self):
  root=assembly(self);closure,bootstrap_authority,closure_authority=authorities(self,self.b,root);tree=self.b.HeldTree(root,closure,bootstrap_authority,closure_authority)
  try:
   mirror=tree.materialize();victim=mirror/self.b.IMPLEMENTATION;victim.parent.chmod(0o700);victim.chmod(0o600);old=victim.with_suffix('.old');victim.rename(old);shutil.copyfile(old,victim);victim.chmod(0o400);self.assertRaises(self.b.BootstrapFailure,tree.verify)
  finally:tree.close()
 def test_seal_requires_every_file_and_directory_immutable(self):
  root=assembly(self);closure,bootstrap_authority,closure_authority=authorities(self,self.b,root);tree=self.b.HeldTree(root,closure,bootstrap_authority,closure_authority);tree.materialize();state={}
  old_get,old_set=self.b.flags,self.b.set_flags;self.b.flags=lambda fd:state.get(fd,0);self.b.set_flags=lambda fd,value:state.__setitem__(fd,value)
  try:tree.seal();tree.verify(True);state[next(iter(tree.materialized.values()))[0]]=0;self.assertRaises(self.b.BootstrapFailure,tree.verify,True)
  finally:self.b.flags,self.b.set_flags=old_get,old_set;tree.close()
 def test_real_immutable_ioctl_failure_is_pre_effect(self):
  source=BOOT.read_text();self.assertLess(source.index('tree.seal()'),source.index('compiled_module(' ,source.index('def execute')));self.assertLess(source.index('tree.verify(True) # Last pre-effect'),source.index('module._execute_materialized'))
  calls=[]
  class Hostile(BaseException):
   def __str__(self):calls.append('str');raise AssertionError('PRIVATE_TOKEN')
   def __getattribute__(self,name):calls.append('getter');raise AssertionError('PRIVATE_TOKEN')
  for expected in ('capture','materialize','immutable_seal','post_seal_verify','compile','install','pre_effect_verify','effects','final_verify','owned_cleanup'):
   reached=[];module=self.b
   def boundary(name):
    reached.append(name)
    if name==expected:raise Hostile()
   class Tree:
    def __init__(self,*args):boundary('capture')
    def materialize(self):boundary('materialize');return pathlib.Path('/owned/root')
    def seal(self):boundary('immutable_seal')
    def verify(self,*args):boundary(module.ACTIVE_PHASE)
    def bytes(self,*args):return b''
    def clear_and_discard(self):boundary('owned_cleanup')
    def close(self):pass
   def compiled(*args):
    boundary('compile')
    return types.SimpleNamespace(_install_held_authority=lambda *args:boundary('install'),_execute_materialized=lambda *args:boundary('effects'))
   output=io.StringIO()
   with unittest.mock.patch.object(module,'HeldTree',Tree),unittest.mock.patch.object(module,'compiled_module',compiled),contextlib.redirect_stderr(output):
    self.assertEqual(module.main(),1)
   self.assertEqual(output.getvalue(),'operations-scope-compatible-read-native FAIL source_closure PHASE='+expected+'\n')
   self.assertEqual(reached[-1],expected)
   if expected in {'capture','materialize','immutable_seal','post_seal_verify','compile','install','pre_effect_verify'}:self.assertNotIn('effects',reached)
  self.assertEqual(calls,[])
 def test_implementation_paths_are_materialized_and_digest_only(self):
  text=IMPL.read_text();self.assertNotIn('postgrest/postgrest:v12.2.3',text);self.assertNotIn('def _effect_body',text);self.assertIn("postgrest_image],env,private,60)",text);entry=text[text.index('def _execute_materialized'):text.index('def execute(_env)')];self.assertLess(entry.index("env,deno,postgrest_image=_consume_held_authority"),entry.index("ddl=closure_paths();shared=load_shared()"))
 def test_import_loader_cannot_reopen_implementation(self):
  text=BOOT.read_text();self.assertNotIn('spec_from_file_location',text);self.assertIn('compiled_module(tree.bytes(IMPLEMENTATION)',text)
 def test_bootstrap_a_path_swapped_b_fails_before_effect(self):
  root=assembly(self);path=root/self.b.BOOTSTRAP;closure,bootstrap_authority,closure_authority=authorities(self,self.b,root);old=path.with_suffix('.held-a');path.rename(old);path.write_text("raise RuntimeError('B')\n");path.chmod(0o400)
  try:
   with self.assertRaises(self.b.BootstrapFailure):self.b.HeldTree(root,closure,bootstrap_authority,closure_authority)
  finally:pass
 def test_coherent_closure_and_implementation_substitution_is_denied(self):
  root=assembly(self);closure,bootstrap_authority,closure_authority=authorities(self,self.b,root);victim=root/self.b.IMPLEMENTATION;malicious=b"MARKER='coherent-substitution'\n";victim.chmod(0o600);victim.write_bytes(malicious);victim.chmod(0o400)
  changed=json.loads(closure.read_text());changed['files'][self.b.IMPLEMENTATION]={'bytes':len(malicious),'sha256':hashlib.sha256(malicious).hexdigest(),'git_blob':self.b.blob(malicious)};closure.chmod(0o600);closure.write_text(json.dumps(changed,sort_keys=True,separators=(',',':'))+'\n');closure.chmod(0o400)
  with self.assertRaises(self.b.BootstrapFailure):self.b.HeldTree(root,closure,bootstrap_authority,closure_authority)
 def test_launcher_rejects_coherent_preopen_substitution(self):
  root=assembly(self);closure=root/CLOSURE.relative_to(STAGE);victim=root/self.b.IMPLEMENTATION;malicious=b"MARKER='preopen-substitution'\n";victim.chmod(0o600);victim.write_bytes(malicious);victim.chmod(0o400);changed=json.loads(closure.read_text());changed['files'][self.b.IMPLEMENTATION]={'bytes':len(malicious),'sha256':hashlib.sha256(malicious).hexdigest(),'git_blob':self.b.blob(malicious)};closure.chmod(0o600);closure.write_text(json.dumps(changed,sort_keys=True,separators=(',',':'))+'\n');closure.chmod(0o400)
  expected=hashlib.sha256(CLOSURE.read_bytes()).hexdigest()
  with self.assertRaisesRegex(RuntimeError,'held_authority_refused'):launcher_open(self.b,closure,expected,2097152)
 def test_workflow_embedded_launcher_is_fixed_and_held_byte(self):
  text=WORKFLOW.read_text();block=text[text.index('# BEGIN HELD BOOTSTRAP LAUNCHER V2'):text.index('# END HELD BOOTSTRAP LAUNCHER V2')];self.assertIn("open_held(BOOTSTRAP_PATH",block);self.assertIn("open_held(CLOSURE_PATH",block);self.assertIn("hashlib.sha256(data).hexdigest()!=expected",block);self.assertIn("'__held_bootstrap__':authority(bootstrap)",block);self.assertIn("'__held_closure__':authority(closure)",block);self.assertNotIn('operations-scope-compatible-read-native.py\n',block)
  self.assertIn('operations-scope-compatible-read-native-pinned-postgrest.guard.test.py',text.split('  compatible-product-reader-native:',1)[1].split('# BEGIN HELD BOOTSTRAP LAUNCHER V2',1)[0])
  code='\n'.join(line[10:] for line in block.splitlines()[1:])+'\n'
  prefix,dispatch=code.split("outer_phase='outer_bootstrap_open'",1)
  calls=[]
  class Hostile(BaseException):
   def __str__(self):calls.append('str');raise AssertionError('PRIVATE_TOKEN')
   def __getattribute__(self,name):calls.append('getter');raise AssertionError('PRIVATE_TOKEN')
  for expected in ('outer_bootstrap_open','outer_closure_open','outer_compile','outer_execute'):
   scope={};exec(compile(prefix,'<owned-launcher-prefix>','exec'),scope)
   def opened(path,*args):
    current='outer_bootstrap_open' if path==scope['BOOTSTRAP_PATH'] else 'outer_closure_open'
    if current==expected:raise Hostile()
    return (91,(),b'pass')
   scope['open_held']=opened
   scope['compile']=lambda *args,**kwargs:(_ for _ in ()).throw(Hostile()) if expected=='outer_compile' else compile('pass','<owned-sentinel>','exec')
   scope['exec']=lambda *args:(_ for _ in ()).throw(Hostile())
   out=io.StringIO()
   with unittest.mock.patch.object(os,'close',lambda *_:None),contextlib.redirect_stderr(out):
    with self.assertRaises(SystemExit) as denial:exec(compile("outer_phase='outer_bootstrap_open'"+dispatch,'<owned-launcher-dispatch>','exec'),scope)
   self.assertEqual(denial.exception.code,1)
   self.assertEqual(out.getvalue(),'operations-scope-compatible-read-native FAIL source_closure PHASE='+expected+'\n')
  scope={};exec(compile(prefix,'<owned-launcher-prefix>','exec'),scope)
  scope['open_held']=lambda *args:(91,(),b'pass');scope['exec']=lambda *args:None
  out=io.StringIO()
  with unittest.mock.patch.object(os,'close',side_effect=Hostile()),contextlib.redirect_stderr(out):
   with self.assertRaises(SystemExit) as denial:exec(compile("outer_phase='outer_bootstrap_open'"+dispatch,'<owned-launcher-close>','exec'),scope)
  self.assertEqual(denial.exception.code,1)
  self.assertEqual(out.getvalue(),'operations-scope-compatible-read-native FAIL source_closure PHASE=outer_close\n')
  self.assertEqual(calls,[])
 def test_original_guard_suite_green(self):
  path=CANONICAL/'scripts/project-economy/operations-scope-compatible-read-native.guard.test.py';r=subprocess.run([sys.executable,'-B',str(path)],cwd=CANONICAL,env={'PATH':os.environ['PATH'],'PYTHONDONTWRITEBYTECODE':'1'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30);self.assertEqual(r.returncode,0);self.assertIn(b'Ran 13 tests',r.stderr)
 def test_no_docker_in_tests(self):self.assertNotIn("subprocess.run(["+"'docker'",pathlib.Path(__file__).read_text())
if __name__=='__main__':unittest.main()
