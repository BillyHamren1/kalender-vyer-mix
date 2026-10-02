#!/usr/bin/env python3
"""Pure pre-child hostile environment and exact fixed-selector guards."""
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock
HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('remaining_six_native_guard_subject',HERE/'remaining-six-compatible-reader-native.py');native=importlib.util.module_from_spec(spec);sys.modules[spec.name]=native;spec.loader.exec_module(native)
http_spec=importlib.util.spec_from_file_location('remaining_six_http_guard_subject',HERE/'remaining-six-compatible-reader-native-http.py');http=importlib.util.module_from_spec(http_spec);http_spec.loader.exec_module(http)
VALID={'CI':'true',native.FLAG:'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':native.DATABASE,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'123'}
class Guards(unittest.TestCase):
 def test_exact_environment_admitted(self):self.assertEqual(native.guard(VALID),VALID)
 def test_hostile_inputs_rejected_before_child(self):
  bad={'CI':'false',native.FLAG:'false','PGHOST':'remote.example','PGHOSTADDR':'127.0.0.1','PGSERVICE':'inherited','PGDATABASE':'postgres','PGUSER':'root','PGPORT':'5433','HTTP_PROXY':'http://proxy','https_proxy':'http://proxy','ALL_PROXY':'x','NO_PROXY':'*','NODE_OPTIONS':'--require x','NODE_USE_ENV_PROXY':'1','PYTHONPATH':'/x','PYTHONHOME':'/x','PYTHONSTARTUP':'/x','PYTHONINSPECT':'1','LD_PRELOAD':'/x','LD_LIBRARY_PATH':'/x','LD_AUDIT':'/x','LD_DEBUG':'x','GCONV_PATH':'/x','LOCPATH':'/x','OPENSSL_CONF':'/x','OPENSSL_MODULES':'/x','DYLD_LIBRARY_PATH':'/x','TMPDIR':'/x','PGRST_JWT_SECRET':'x','SUPABASE_SERVICE_ROLE_KEY':'x','DOCKER_HOST':'unix:///x','COMPOSE_FILE':'/x','GITHUB_REPOSITORY':'someone/else','GITHUB_RUN_ID':'123/x','EVENTFLOW_REMAINING_SIX_CONTROL':'x'}
  with mock.patch.object(native,'shared_module') as child:
   for key,value in bad.items():
    with self.subTest(key=key),self.assertRaises(native.Failure):native.execute(dict(VALID,**{key:value}))
   child.assert_not_called()
 def test_fixed_calls_exact_six(self):
  calls=native.make_calls({'snapshot':'00000000-0000-4000-8000-000000000201','event':'00000000-0000-4000-8000-000000000202','anchor':'a'*64})
  self.assertEqual(set(calls),set(http.ROUTE));self.assertTrue(all(v.startswith('select public.read_operations_') for v in calls.values()))
  self.assertTrue(all(native.ORG in v or 'drilldown' in v for v in calls.values()))
 def test_no_selector_coercion_or_extra_fields(self):
  base={'snapshot':'00000000-0000-4000-8000-000000000201','event':'00000000-0000-4000-8000-000000000202','anchor':'a'*64}
  for key,value in [('snapshot',[]),('event',{}),('anchor',['a'*64]),('snapshot',base['snapshot']+"');select 1;--"),('actor',native.ACTOR)]:
   with self.subTest(key=key),self.assertRaises(native.Failure):native.make_calls(dict(base,**{key:value}))
 def test_only_fixed_http_paths_zero_network(self):
  with mock.patch.object(http.urllib.request,'build_opener') as network:
   for path in ['../rpc/read_operations_scope_obligation_evidence_v1','write_rpc','https://example.com','operations_economy_private.read_scope_composition_v1']:
    with self.assertRaises(ValueError):http.request(path,{},'synthetic')
   network.assert_not_called()
 def test_exact_root_clock_only(self):
  original={'generatedAt':'2026-10-02T12:00:00+00:00','amount':None,'nested':{'generatedAt':'saved'},'rows':[{'minor':181}]}
  clean=http.comparable('parent',original)
  self.assertEqual(clean,{'amount':None,'nested':{'generatedAt':'saved'},'rows':[{'minor':181}]});self.assertIn('generatedAt',original)
  with self.assertRaises(ValueError):http.comparable('parent',dict(original,generatedAt='2026-02-30T12:00:00Z'))
 def test_http_error_body_uses_actual_response_socket_shape(self):
  response=mock.MagicMock();response.closed=False;response.read1.side_effect=[b'{"code":"55P03"}',b''];error=http.urllib.error.HTTPError(http.URL+'rpc/'+http.ROUTE['parent'],500,'synthetic',{},response)
  opener=mock.MagicMock();opener.open.side_effect=error
  with mock.patch.object(http.urllib.request,'build_opener',return_value=opener):status,value=http.request(http.ROUTE['parent'],{},'synthetic')
  self.assertEqual(status,500);self.assertEqual(value,{'code':'55P03'});response.fp.raw._sock.settimeout.assert_called();response.close.assert_called_once()
 def test_whole_http_deadline_checks_before_body(self):
  from types import SimpleNamespace
  response=mock.MagicMock();response.__enter__.return_value=response;response.geturl.return_value=http.URL+'rpc/'+http.ROUTE['parent']
  opener=mock.MagicMock();opener.open.return_value=response
  with mock.patch.object(http.urllib.request,'build_opener',return_value=opener),mock.patch.object(http.time,'monotonic',side_effect=[0,7]):
   with self.assertRaises(TimeoutError):http.request(http.ROUTE['parent'],{},'synthetic')
  response.read1.assert_not_called();response.__exit__.assert_called_once()
 def test_parsing_after_whole_deadline_is_not_returned(self):
  now=[0.0];response=mock.MagicMock();response.__enter__.return_value=response;response.geturl.return_value=http.URL+'rpc/'+http.ROUTE['parent'];response.read1.side_effect=[b'{"amount":181}',b''];opener=mock.MagicMock();opener.open.return_value=response
  def late_parse(raw):now[0]=7.0;return {'amount':181}
  with mock.patch.object(http.urllib.request,'build_opener',return_value=opener),mock.patch.object(http.time,'monotonic',side_effect=lambda:now[0]),mock.patch.object(http.json,'loads',side_effect=late_parse):
   with self.assertRaises(TimeoutError):http.request(http.ROUTE['parent'],{},'synthetic')
  response.__exit__.assert_called_once()
 def test_redirect_refusal_before_body(self):
  response=mock.MagicMock();response.__enter__.return_value=response;response.geturl.return_value='https://external.example/private'
  opener=mock.MagicMock();opener.open.return_value=response
  with mock.patch.object(http.urllib.request,'build_opener',return_value=opener):
   with self.assertRaises(ValueError):http.request(http.ROUTE['parent'],{},'synthetic')
  response.read1.assert_not_called()
 def test_observation_failure_inspects_owned_holder_failure(self):
  h=native.Harness(VALID,pathlib.Path('/unused'),object());h.state=lambda:'a'*64;h.observe=lambda *args:0;h.boolean=lambda *args:None
  def sql(phase,*args,**kwargs):
   if phase=='holder':raise native.Failure('cleanup',retain=True)
   return ''
  h.sql=sql
  def observe(*args):raise native.Failure('observer')
  h.await_observation=observe
  with self.assertRaises(native.Failure) as caught:h.case('parent_org_try','select public.read_operations_scope_obligation_evidence_v1(null,null,null);','select pg_advisory_xact_lock(1)')
  self.assertTrue(caught.exception.retain);self.assertEqual(h.records,[])
 def test_reader_and_holder_future_cleanup_errors_propagate(self):
  from concurrent.futures import Future
  h=native.Harness(VALID,pathlib.Path('/unused'),object());h.observe=lambda *args:0;h.boolean=lambda *args:None
  good=Future();good.set_result('done');bad=Future();bad.set_exception(native.Failure('reader',retain=True))
  with self.assertRaises(native.Failure) as caught:h.finish_holder('fixed',None,good,bad)
  self.assertTrue(caught.exception.retain)
 def test_foreign_or_replaced_docker_identity_has_no_mutation(self):
  from types import SimpleNamespace
  ident='1'*64;owner='a'*64;name='fixed'
  for bad in [ident+'|/foreign|'+owner+'|true','2'*64+'|/'+name+'|'+owner+'|true',ident+'|/'+name+'|'+'b'*64+'|true']:
   commands=[]
   def run(phase,cmd,**kwargs):
    commands.append(cmd)
    return SimpleNamespace(read_text=lambda:ident+'\n' if 'ps' in cmd else bad)
   h=SimpleNamespace(run=run)
   with self.assertRaises(native.Failure) as caught:http.container_cleanup(h,native,name,owner,ident)
   self.assertTrue(caught.exception.retain);self.assertFalse(any('stop' in c or 'rm' in c for c in commands))
 def test_owned_cleanup_mutates_only_verified_immutable_id(self):
  from types import SimpleNamespace
  ident='1'*64;owner='a'*64;name='fixed';commands=[];inspected=0;listed=0
  def run(phase,cmd,**kwargs):
   nonlocal inspected,listed
   commands.append(cmd)
   if 'ps' in cmd:
    listed+=1;value=ident+'\n' if listed==1 else ''
   elif 'inspect' in cmd:
    inspected+=1;value=ident+'|/'+name+'|'+owner+'|'+('true' if inspected==1 else 'false')
   else:value=''
   return SimpleNamespace(read_text=lambda:value)
  http.container_cleanup(SimpleNamespace(run=run),native,name,owner,ident)
  changes=[c for c in commands if 'stop' in c or 'rm' in c]
  self.assertEqual(len(changes),2);self.assertTrue(all(c[-1]==ident for c in changes));self.assertFalse(any(c[-1]==name for c in changes))
 def test_signature_purpose_role_without_decorative_org(self):
  import base64,json
  jwt=http.token('a'*64,'authenticated',native.ACTOR);parts=jwt.split('.')
  payload=json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
  self.assertEqual(payload['sub'],native.ACTOR);self.assertEqual(payload['role'],'authenticated');self.assertNotIn('organization_id',payload)
  for secret,role in [('a','authenticated'),('a'*64,'postgres')]:
   with self.assertRaises(ValueError):http.token(secret,role,native.ACTOR)
if __name__=='__main__':unittest.main()
