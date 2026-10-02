import contextlib,hashlib,importlib.util,io,json,pathlib,shutil,tempfile,types,unittest
from unittest import mock
PATH=pathlib.Path(__file__).with_name('operations-compatible-catalog-http-native.py')
SPEC=importlib.util.spec_from_file_location('catalog_http_runner',PATH);r=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(r)
def environment():return {'CI':'true','EVENTFLOW_COMPATIBLE_CATALOG_HTTP_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':r.DATABASE,'PYTHONDONTWRITEBYTECODE':'1','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1'}
class Guards(unittest.TestCase):
 def test_exact_source_closure_and_frozen_dependencies(self):
  r.validate_environment(environment());v=r.load_source();self.assertEqual(len(v['files']),110);self.assertEqual(len(v['baseline_schema_paths']),24);self.assertEqual(len(v['install_paths']),2)
  base=r.module(r.ROOT/r.BASE_RUNNER,'guard_full_catalog_frozen');self.assertEqual(len(base.load_source()['files']),101)
 def test_hostile_environment_zero_capabilities(self):
  hostile={'CI':'false','PGHOST':'remote','PGDATABASE':'production','PGHOSTADDR':'remote','PGSERVICE':'foreign','PGSERVICEFILE':'foreign','PGOPTIONS':'PRIVATE','HTTPS_PROXY':'PRIVATE','http_proxy':'PRIVATE','NO_PROXY':'PRIVATE','BASH_ENV':'PRIVATE','ENV':'PRIVATE','PYTHONPATH':'PRIVATE','PYTHONHOME':'PRIVATE','NODE_OPTIONS':'PRIVATE','LD_PRELOAD':'PRIVATE','LD_AUDIT':'PRIVATE','DYLD_INSERT_LIBRARIES':'PRIVATE','BASH_FUNC_child%%':'PRIVATE','GCONV_PATH':'PRIVATE','LOCPATH':'PRIVATE','OPENSSL_CONF':'PRIVATE','OPENSSL_MODULES':'PRIVATE','DOCKER_HOST':'remote','DOCKER_CONTEXT':'foreign','PGRST_DB_URI':'PRIVATE','SUPABASE_URL':'PRIVATE','TMPDIR':'foreign','EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET':'PRIVATE'}
  with mock.patch.object(r,'module',side_effect=AssertionError('capability_called')) as module,mock.patch.object(r.socket,'socket',side_effect=AssertionError('network_called')) as network:
   for k,v in hostile.items():
    with self.subTest(k=k):
     e=environment();e[k]=v
     with self.assertRaises(r.ClosedFailure):r.run_native(e)
   module.assert_not_called();network.assert_not_called()
 def test_complete_shadow_drift_and_symlink_refused(self):
  c=r.load_source()
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td)
   for rel in set(c['files'])|{r.PREFIX+'native-closure.json'}:
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(r.ROOT/rel,p)
   r.load_source(root)
   p=root/(r.PREFIX+'journey.ts');original=p.read_bytes();p.write_bytes(original+b'\n')
   with self.assertRaises(r.ClosedFailure):r.load_source(root)
   p.write_bytes(original);p.unlink();p.symlink_to(r.ROOT/(r.PREFIX+'journey.ts'))
   with self.assertRaises(r.ClosedFailure):r.load_source(root)
 def test_order_and_inherited_hash_are_not_baselined_away(self):
  c=r.load_source()
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td)
   for rel in set(c['files'])|{r.PREFIX+'native-closure.json'}:
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(r.ROOT/rel,p)
   p=root/(r.PREFIX+'native-closure.json');changed=json.loads(p.read_text());changed['baseline_schema_paths'][:2]=reversed(changed['baseline_schema_paths'][:2]);p.write_text(json.dumps(changed))
   with self.assertRaises(r.ClosedFailure):r.load_source(root)
 def test_marker_protocol_exact_not_any_pass(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'stdout';p.write_text('\n'.join(r.HTTP_MARKERS)+'\n');r.exact_markers(p,r.HTTP_MARKERS)
   for rows in ([],['PASS'],r.HTTP_MARKERS*2,r.HTTP_MARKERS+['PRIVATE'],list(reversed(r.HTTP_MARKERS))):
    p.write_text('\n'.join(rows)+'\n')
    with self.assertRaises(r.ClosedFailure):r.exact_markers(p,r.HTTP_MARKERS)
 def test_exception_subclasses_have_no_getter_or_string_reflection(self):
  calls=[]
  class Hostile(r.ClosedFailure):
   def __init__(self):Exception.__init__(self,'PRIVATE_EXCEPTION')
   @property
   def phase(self):calls.append('phase');raise RuntimeError('PRIVATE_PHASE')
   @property
   def code(self):calls.append('code');raise RuntimeError('PRIVATE_CODE')
   @property
   def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_CLASS')
   def __str__(self):calls.append('str');raise RuntimeError('PRIVATE_TEXT')
  for e in (Hostile(),FileExistsError('PRIVATE_PATH')):
   out=io.StringIO()
   with mock.patch.object(r,'run_native',side_effect=e),contextlib.redirect_stdout(out):self.assertEqual(r.main(environment()),1)
   self.assertEqual(out.getvalue(),'operations-compatible-catalog-http-native FAIL guard SQLSTATE=unclassified CHECKPOINT=none REASON=unclassified\n')
  self.assertEqual(calls,[])
 def test_setup_retains_actual_null_command_and_authenticator_restrictions(self):
  text=(r.ROOT/(r.PREFIX+'setup.sql')).read_text()
  self.assertLess(text.index('catalog_http_fresh_fixture_required'),text.index('create schema operations_catalog_http_fixture'))
  self.assertIn("eventflow.compatible_install_isolated",text);self.assertIn("eventflow.compatible_catalog_http_isolated",text)
  self.assertIn('set local role authenticated;',text);self.assertIn("'estimate_minor',null,'committed_minor',null",text)
  self.assertIn('public.append_operations_manual_obligation_baseline_v1',text);self.assertIn('public.enroll_operations_project_scope_v1',text);self.assertIn('public.compose_operations_scope_obligations_v1',text)
  self.assertIn('login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls',text)
  self.assertNotIn('create function',text.lower());self.assertNotIn('insert into public.operations_finance_invoice',text)
 def test_health_uses_fixed_direct_connection_and_no_redirect_proxy_stack(self):
  calls=[]
  connection=types.SimpleNamespace(request=lambda *a,**k:calls.append(('request',a,k)),getresponse=lambda:types.SimpleNamespace(status=200),close=lambda:calls.append(('close',)))
  with mock.patch.object(r.http.client,'HTTPConnection',return_value=connection) as create:r.health()
  self.assertEqual(create.call_args.args,('127.0.0.1',r.PORT));self.assertGreater(create.call_args.kwargs['timeout'],0);self.assertEqual(calls[0][1],('GET','/'));self.assertEqual(calls[-1],('close',))
 def test_health_redirect_not_accepted(self):
  connection=types.SimpleNamespace(request=lambda *a,**k:None,getresponse=lambda:types.SimpleNamespace(status=302),close=lambda:None)
  with mock.patch.object(r.http.client,'HTTPConnection',return_value=connection),mock.patch.object(r.time,'monotonic',side_effect=[0,0,0,16,16]),mock.patch.object(r.time,'sleep'):
   with self.assertRaises(r.ClosedFailure):r.health()
 def test_successful_late_health_headers_do_not_pass_deadline(self):
  connection=types.SimpleNamespace(request=lambda *a,**k:None,getresponse=lambda:types.SimpleNamespace(status=200),close=lambda:None)
  with mock.patch.object(r.http.client,'HTTPConnection',return_value=connection),mock.patch.object(r.time,'monotonic',side_effect=[0,0,0,16,16,16]),mock.patch.object(r.time,'sleep'):
   with self.assertRaises(r.ClosedFailure):r.health()
 def test_exact_name_label_and_immutable_id_before_any_mutation(self):
  name='operations-catalog-http-synthetic';label='a'*64;actual='b'*64
  self.assertEqual(r.owned_inspection(json.dumps(actual)+' '+json.dumps('/'+name)+' '+json.dumps({'eventflow.catalog-http-owner':label}),name,label),actual)
  for n,l,identity in [('/foreign',label,actual),('/'+name,'foreign',actual),('/'+name,label,'not-container-id')]:
   mutate=mock.Mock()
   with self.assertRaises(r.ClosedFailure):
    found=r.owned_inspection(json.dumps(identity)+' '+json.dumps(n)+' '+json.dumps({'eventflow.catalog-http-owner':l}),name,label);mutate(found)
   mutate.assert_not_called()
 def test_cleanup_noop_or_recreated_private_path_blocks_all_pass_and_keeps_recovery(self):
  real=r.shutil.rmtree
  for scenario in ('noop','recreated'):
   with tempfile.TemporaryDirectory() as td:
    private=pathlib.Path(td)/'owned';private.mkdir();(private/'recovery').write_text('PRIVATE_RECOVERY')
    def mutate(path):
     if scenario=='recreated':real(path);path.mkdir();(path/'recovery').write_text('PRIVATE_REPLACED_RECOVERY')
    out=io.StringIO()
    with mock.patch.object(r.shutil,'rmtree',side_effect=mutate),mock.patch.object(r,'run_native',side_effect=lambda env:r.remove_private(private)),contextlib.redirect_stdout(out):self.assertEqual(r.main(environment()),1)
    self.assertEqual(out.getvalue(),'operations-compatible-catalog-http-native FAIL cleanup SQLSTATE=unclassified CHECKPOINT=none REASON=unclassified\n');self.assertTrue((private/'recovery').exists());self.assertNotIn('PRIVATE',out.getvalue())
 def lifecycle(self,fault=None):
  calls=[];owner={};table='operations_catalog_http_fixture.capture'
  class ChildFailure(Exception):
   def __init__(self,code):self.code=code
  def child(phase,command,env,root,where,timeout,stdin=None):
   self.assertEqual(phase,'authority_sql');self.assertTrue(where.is_dir());self.assertGreater(timeout,0);calls.append((command,dict(env),stdin));out=where/'stdout';value=''
   if command[0]=='psql' or command==[r.sys.executable,'-I','-B',str(r.ROOT/(r.PREFIX+'wire.py'))]:
    text=stdin.decode()
    if text.startswith("set statement_timeout='10s';select current_database()"):value='t\n'
    elif "'session',session_user" in text:value=json.dumps({'session':r.AUTHENTICATOR,'current':r.AUTHENTICATOR,'unsafe':False,'memberships':['anon','authenticated','service_role']})+'\n'
    elif text.startswith("set statement_timeout='5s';set role ") and ('set role postgres;' in text or 'select * from public.operations_project_obligation_baselines' in text or 'select operations_economy_private.' in text or 'insert into public.operations_scope_obligation_composition_heads' in text):raise ChildFailure('42501')
    elif "select session_user||':'||current_user" in text:value=r.AUTHENTICATOR+':'+next(role for role in ('anon','authenticated','service_role') if 'set role '+role+';' in text)+'\n'
    elif 'select jsonb_agg(jsonb_build_object(\'slot\'' in text:value='[]\n'
    elif text.startswith(r.options()+'begin isolation level repeatable read read only;'):
     if fault in ('snapshot_cap','snapshot_below_cap'):
      p=where/'authority_sql.stdout';p.touch();p.chmod(0o600)
      with p.open('r+b') as output:output.truncate(8388608 if fault=='snapshot_cap' else 8388607)
      raise ChildFailure('unclassified')
     value=json.dumps([table])+'\n{}\n'+json.dumps({'identity':table,'count':0,'sha256':'a'*64})+'\n'
    elif 'jsonb_agg(n.nspname' in text:
     if fault=='tablelist_cap':
      p=where/'authority_sql.stdout';p.touch();p.chmod(0o600)
      with p.open('r+b') as output:output.truncate(8388608)
      raise ChildFailure('unclassified')
     value=json.dumps([table])+'\n'
    elif 'select to_jsonb(r)' in text:value='{}\n'
   elif command[:2]==['deno','test']:value='ok | 8 passed | 0 failed\n'
   elif command[:2]==['deno','run']:
    self.assertIn('--allow-net=127.0.0.1:55783',command);self.assertIn('--allow-read='+env['EVENTFLOW_COMPATIBLE_CATALOG_HTTP_FIXTURE_FILE'],command);self.assertEqual(pathlib.Path(env['EVENTFLOW_COMPATIBLE_CATALOG_HTTP_FIXTURE_FILE']).parent,where.parent);self.assertGreaterEqual(len(env['EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET']),32)
    control=env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_CONTROL');value=(r.CONTROL_MARKERS[control]+'\n') if control else '\n'.join(r.HTTP_MARKERS)+'\n'
   elif command[:4]==r.DOCKER+['create']:
    owner['name']=command[command.index('--name')+1];owner['label']=command[command.index('--label')+1].split('=',1)[1];owner['id']='b'*64
    file=pathlib.Path(command[command.index('--env-file')+1]);self.assertEqual(file.stat().st_mode&0o777,0o600);self.assertIn('PGRST_DB_URI=postgresql://'+r.AUTHENTICATOR+':',file.read_text());value=owner['id']+'\n'
   elif command[:4]==r.DOCKER+['inspect']:value=json.dumps('c'*64 if fault=='replaced_id' else owner['id'])+' '+json.dumps('/foreign' if fault=='foreign_name' else '/'+owner['name'])+' '+json.dumps({'eventflow.catalog-http-owner':owner['label']})+'\n'
   elif command[:4]==r.DOCKER+['exec']:self.assertEqual(command[-3:],[owner['id'],'postgrest','--version']);value='PostgREST 12.2.4\n' if fault=='wrong_version' else 'PostgREST 12.2.3 (abcdef0)\n'
   elif command[:4]==r.DOCKER+['rm']:self.assertEqual(command[-1],owner['id'])
   elif command[:4]==r.DOCKER+['ps']:self.assertIn('label=eventflow.catalog-http-owner='+owner['label'],command)
   if command[0]=='docker':self.assertEqual(command[:3],['docker','--host','unix:///var/run/docker.sock'])
   out.write_text(value);return out
  shared=types.SimpleNamespace(ClosedFailure=ChildFailure,run_private=child)
  full=r.module(r.ROOT/r.BASE_RUNNER,'http_guard_frozen_base');atomic=full.module(r.ROOT/full.RUNNER,'http_guard_frozen_atomic')
  fake_atomic=types.SimpleNamespace(shared_module=lambda:shared,sql_string=atomic.sql_string)
  verifier=types.SimpleNamespace(parse=lambda s:json.loads(s),unchanged=lambda a,b:self.assertEqual(a,b))
  fake_base=types.SimpleNamespace(RUNNER=full.RUNNER,PREFIX=full.PREFIX,module=mock.Mock(side_effect=[fake_atomic,verifier]))
  with tempfile.TemporaryDirectory() as td:
   private=pathlib.Path(td)/'owned';private.mkdir(mode=0o700)
   with mock.patch.object(r,'module',return_value=fake_base),mock.patch.object(r,'health'),mock.patch.object(r.socket,'socket'),mock.patch.object(r.tempfile,'mkdtemp',return_value=str(private)):
    if fault:
     with self.assertRaises(r.ClosedFailure) as denied:r.run_native(environment())
     if fault in ('snapshot_cap','snapshot_below_cap','tablelist_cap'):
      self.assertEqual(denied.exception.phase,'capture');self.assertEqual(denied.exception.code,'unclassified');self.assertEqual(denied.exception.checkpoint,'capture_tablelist' if fault=='tablelist_cap' else 'capture_snapshot');self.assertEqual(denied.exception.reason,'unclassified' if fault=='snapshot_below_cap' else 'owned_output_at_cap')
     else:self.assertEqual(denied.exception.phase,'docker_verify' if fault=='wrong_version' else 'cleanup')
     return calls
    result=r.run_native(environment())
  self.assertEqual(sum(command==[r.sys.executable,'-I','-B',str(r.ROOT/(r.PREFIX+'wire.py'))] for command,env,stdin in calls),6)
  for command,env,stdin in calls:
   if command==[r.sys.executable,'-I','-B',str(r.ROOT/(r.PREFIX+'wire.py'))]:self.assertTrue(stdin.decode().startswith(r.options()+'begin isolation level repeatable read read only;'));self.assertTrue(stdin.endswith(b'commit;'))
  self.assertEqual(len(result),3);self.assertEqual(sum(c[0][:2]==['deno','run'] for c in calls),5);self.assertEqual(sum(c[0][:4]==r.DOCKER+['rm'] for c in calls),1)
  self.assertEqual(sum(command[0]=='psql' and stdin is not None and stdin.decode().startswith("set statement_timeout='5s';set role ") and 'select operations_economy_private.' in stdin.decode() for command,env,stdin in calls),8)
  for command,env,stdin in calls:
   self.assertNotIn(env.get('EVENTFLOW_COMPATIBLE_CATALOG_HTTP_JWT_SECRET','PRIVATE_NEVER_MATCH'),command)
  return calls
 def test_actual_owned_failed_child_cap_checkpoints_do_not_reach_docker_or_http(self):
  for fault in ('tablelist_cap','snapshot_cap','snapshot_below_cap'):
   calls=self.lifecycle(fault);self.assertFalse(any(command[0] in ('docker','deno') for command,env,stdin in calls))
 def test_closed_output_metadata_refuses_symlink_missing_and_near_cap(self):
  with tempfile.TemporaryDirectory() as td:
   where=pathlib.Path(td);where.chmod(0o700);info=where.lstat();identity=(info.st_dev,info.st_ino);p=where/'authority_sql.stdout'
   self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified')
   for size in (0,8388607,8388608,8388609):
    with p.open('wb') as output:output.truncate(size)
    p.chmod(0o600)
    self.assertEqual(r.failed_child_output_reason(where,identity),'owned_output_at_cap' if size==8388608 else 'unclassified')
   p.unlink();target=where/'PRIVATE_FOREIGN';target.touch()
   with target.open('r+b') as output:output.truncate(8388608)
   p.symlink_to(target);self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified')
 def test_output_cap_rejects_foreign_metadata_hardlinks_and_replaced_identity(self):
  with tempfile.TemporaryDirectory() as td:
   where=pathlib.Path(td);where.chmod(0o700);parent=where.lstat();identity=(parent.st_dev,parent.st_ino);p=where/'authority_sql.stdout'
   with p.open('wb') as output:output.truncate(8388608)
   p.chmod(0o600);self.assertEqual(r.failed_child_output_reason(where,identity),'owned_output_at_cap')
   p.chmod(0o644);self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified');p.chmod(0o600)
   where.chmod(0o755);self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified');where.chmod(0o700)
   with mock.patch.object(r.os,'geteuid',return_value=p.lstat().st_uid+1):self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified')
   q=where/'PRIVATE_HARDLINK';r.os.link(p,q);self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified');q.unlink()
   self.assertEqual(r.failed_child_output_reason(where,(identity[0],identity[1]+1)),'unclassified')
   original=r.os.fstat
   def replace(fd):
    info=original(fd);p.unlink()
    with p.open('wb') as output:output.truncate(8388608)
    p.chmod(0o600);return info
   with mock.patch.object(r.os,'fstat',side_effect=replace):self.assertEqual(r.failed_child_output_reason(where,identity),'unclassified')
 def test_fixed_diagnostics_never_emit_unknown_private_values(self):
  e=r.ClosedFailure('capture','unclassified','PRIVATE_CHECKPOINT','PRIVATE_REASON');out=io.StringIO()
  with mock.patch.object(r,'run_native',side_effect=e),contextlib.redirect_stdout(out):self.assertEqual(r.main(environment()),1)
  self.assertEqual(out.getvalue(),'operations-compatible-catalog-http-native FAIL capture SQLSTATE=unclassified CHECKPOINT=none REASON=unclassified\n')
 def test_restricted_no_password_in_child_arguments_and_full_lifecycle(self):self.lifecycle()
 def test_foreign_name_or_replaced_id_never_started_or_removed(self):
  for fault in ('foreign_name','replaced_id'):
   calls=self.lifecycle(fault)
   self.assertFalse(any(command[:4] in (r.DOCKER+['start'],r.DOCKER+['rm']) for command,env,stdin in calls))
 def test_wrong_actual_binary_version_never_reaches_http(self):
  calls=self.lifecycle('wrong_version');self.assertFalse(any(command[:2]==['deno','run'] for command,env,stdin in calls));self.assertEqual(sum(command[:4]==r.DOCKER+['rm'] for command,env,stdin in calls),1)
if __name__=='__main__':unittest.main()
