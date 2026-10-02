"""No-Docker hostile guard and private protocol tests. Not native evidence."""
import importlib.util
import http.server
import json
import pathlib
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('scope_product_guard_target',HERE/'operations-whole-scope-product-publication-native.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
spec=importlib.util.spec_from_file_location('scope_product_cases_target',HERE/'operations-whole-scope-product-publication-native-cases.py')
cases=importlib.util.module_from_spec(spec);spec.loader.exec_module(cases)


class Guards(unittest.TestCase):
    def env(self):
        return dict(module.FIXED,PGPASSWORD='isolated_native_only_12345',GITHUB_RUN_ID='123456')

    def test_exact_identity_and_namespace(self):
        self.assertEqual(module.guard(self.env()),'scope-product-123456')
        for key,value in {'CI':'false','PGHOST':'localhost','PGPORT':'5433','PGUSER':'service_role',
                          'PGDATABASE':'postgres','GITHUB_REPOSITORY':'foreign/repo',
                          'GITHUB_RUN_ID':'123;docker rm other','PGPASSWORD':'x\nPGRST_DB_URI=foreign'}.items():
            with self.subTest(key=key):
                env=self.env();env[key]=value
                with self.assertRaises(module.Failure):module.guard(env)

    def test_ambient_capabilities_denied_before_process(self):
        hostile=['PGSERVICE','PGOPTIONS','PGPASSFILE','PGSSLROOTCERT','PGRST_DB_URI',
                 'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','COMPOSE_PROJECT_NAME','DOCKER_HOST',
                 'HTTP_PROXY','https_proxy','All_Proxy','NO_PROXY','DATABASE_URL','DB_URL',
                 'TMPDIR','NODE_OPTIONS','PYTHONPATH','PYTHONHOME','DENO_NO_PACKAGE_JSON',
                 'LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','BASH_FUNC_injected%%',
                 'BASH_ENV','ENV','SHELLOPTS','BASHOPTS','PS4','PYTHONINSPECT',
                 'EVENTFLOW_WHOLE_SCOPE_PRODUCT_SOURCE_APPROVED']
        with patch.object(module.subprocess,'Popen',side_effect=AssertionError('capability_reached')):
            for key in hostile:
                with self.subTest(key=key):
                    env=self.env();env[key]='private value'
                    with self.assertRaises(module.Failure):module.execute(env)

    def test_no_source_closure_can_reach_sql_or_docker(self):
        with patch.object(module,'closure',side_effect=module.Failure('closure')),patch.object(module.subprocess,'Popen',side_effect=AssertionError('capability_reached')):
            with self.assertRaises(module.Failure):module.execute(self.env())

    def test_unknown_private_sqlstates_never_public(self):
        for code in ['SECRT','ABCDE','12345','password=secret','23505\nprivate']:
            failure=module.Failure('private contextual exception',code)
            self.assertEqual((failure.phase,failure.code,str(failure)),('guard','unclassified','closed_product_native_failure'))
        for code in module.SQLSTATES:
            self.assertEqual(module.Failure('case',code).code,code)

    def test_manifest_drop_reorder_and_symlink_refused(self):
        source=json.loads((HERE/'operations-whole-scope-product-publication-native-closure.json').read_text())
        for mutate in ['drop','reorder','database','symlink']:
            with self.subTest(mutate=mutate),tempfile.TemporaryDirectory() as tmp:
                root=pathlib.Path(tmp);directory=root/'scripts'/'project-economy';directory.mkdir(parents=True)
                value=json.loads(json.dumps(source))
                if mutate=='drop':value['files'].pop(next(iter(value['files'])))
                if mutate=='reorder':value['ordered_schema_paths'].reverse()
                if mutate=='database':value['database']='another_customer_database'
                path=directory/'operations-whole-scope-product-publication-native-closure.json'
                if mutate=='symlink':
                    actual=root/'unowned.json';actual.write_text(json.dumps(value));path.symlink_to(actual)
                else:path.write_text(json.dumps(value))
                with patch.object(module,'HERE',directory),patch.object(module,'ROOT',root),patch.object(module,'load',side_effect=AssertionError('source_execution_reached')):
                    with self.assertRaises(module.Failure):module.closure()

    def test_real_case_lock_order_is_not_test_fault_switch(self):
        subject=cases.Cases(None,None,None,None,None)
        command={'idempotency_key':'private controlled command'}
        sql=subject.publisher_sql(command,before_sleep=True)
        self.assertLess(sql.index('isolation level repeatable read'),sql.index('select current_revision'))
        self.assertLess(sql.index('select current_revision'),sql.index('pg_sleep'))
        self.assertLess(sql.index('pg_sleep'),sql.index('set local role authenticated'))
        self.assertIn('public.publish_operations_whole_scope_product_v1(',sql)
        sql=subject.publisher_sql(command,after_sleep=True)
        self.assertLess(sql.index('public.publish_operations_whole_scope_product_v1('),sql.index('pg_sleep'))
        sql=subject.producer_sql(2,pause=True)
        self.assertLess(sql.index('insert into actual_source'),sql.index('set local role service_role'))
        self.assertIn('public.operations_receive_finance_project_invoice_destination_v1(',sql)
        self.assertLess(sql.index('public.operations_receive_finance_project_invoice_destination_v1('),sql.index('pg_sleep'))
        for revision in [0,1,5,'2',True,None]:
            with self.assertRaises(cases.CaseFailure):subject.producer_sql(revision)

    def test_case_failures_are_fixed_and_partial_is_not_acceptance(self):
        failure=cases.CaseFailure('private recipient proof')
        self.assertEqual((failure.case,str(failure)),(7,'closed_product_native_case_failure'))
        self.assertEqual(len(cases.MARKERS),8)
        self.assertEqual(len(set(cases.MARKERS)),8)
        for line in cases.MARKERS:self.assertRegex(line,r'^scope-product-native PASS [a-z0-9_]+$')

    def test_actual_private_process_failure_has_no_message_surface(self):
        shared=module.load(HERE/module.SHARED)
        with tempfile.TemporaryDirectory() as tmp:
            native=module.Native(dict(__import__('os').environ),pathlib.Path(tmp),shared)
            child=native.start_process([sys.executable,'-c',"import sys;sys.stderr.write('PRIVATE_SOURCE_BODY_SECRET');sys.exit(1)"])
            with self.assertRaises(module.Failure) as error:native.finish(child)
            self.assertEqual((str(error.exception),error.exception.code),('closed_product_native_failure','unclassified'))
            self.assertFalse(native.children)
            self.assertEqual(shared.live_owned_group(child.pid),[])

    def test_actual_owned_timeout_kills_abort_ignoring_descendant(self):
        shared=module.load(HERE/module.SHARED)
        with tempfile.TemporaryDirectory() as tmp:
            native=module.Native(dict(__import__('os').environ),pathlib.Path(tmp),shared)
            ready=pathlib.Path(tmp)/'ready'
            code="import os,signal,time,pathlib;signal.signal(signal.SIGTERM,signal.SIG_IGN);os.fork();pathlib.Path("+repr(str(ready))+").touch();time.sleep(60)"
            child=native.start_process([sys.executable,'-c',code])
            deadline=time.monotonic()+5
            while not ready.exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(ready.exists())
            out,err,_started,name=native.children[child]
            native.children[child]=(out,err,time.monotonic()-40,name)
            with self.assertRaises(module.Failure):native.finish(child)
            self.assertEqual(shared.live_owned_group(child.pid),[])
            self.assertFalse(native.children)

    def test_actual_http_denial_and_accepted_body_reader(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body=b'{"code":"22023"}' if self.path=='/deny' else b'{"safe":true}'
                self.rfile.read(int(self.headers.get('Content-Length','0')))
                self.send_response(400 if self.path=='/deny' else 200)
                self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            def log_message(self,*_args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        original=module.urllib.request.build_opener
        class Remap:
            def __init__(self,path):self.path=path
            def open(self,request,timeout):
                # Test-only ephemeral transport remap: no Docker or PostgreSQL.
                request.full_url='http://127.0.0.1:'+str(server.server_port)+self.path
                return original(module.urllib.request.ProxyHandler({})).open(request,timeout=timeout)
        try:
            native=module.Native({},pathlib.Path('/unused'),None);native.jwt='synthetic-test-only'
            with patch.object(module.urllib.request,'build_opener',return_value=Remap('/deny')):
                self.assertEqual(native.http({},400),{'code':'22023'})
            with patch.object(module.urllib.request,'build_opener',return_value=Remap('/ok')):
                self.assertEqual(native.http({},200),{'safe':True})
        finally:server.shutdown();server.server_close();thread.join(timeout=2)

    def test_actual_http_oversize_and_slow_body_are_bounded(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length','0')))
                self.send_response(200)
                self.send_header('Content-Length','20000');self.end_headers()
                try:
                    if self.path=='/large':self.wfile.write(b'x'*20000)
                    else:
                        for _ in range(8):
                            self.wfile.write(b'x');self.wfile.flush();time.sleep(.1)
                except (BrokenPipeError,ConnectionResetError):pass
            def log_message(self,*_args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        original=module.urllib.request.build_opener
        class Remap:
            def __init__(self,path):self.path=path
            def open(self,request,timeout):
                request.full_url='http://127.0.0.1:'+str(server.server_port)+self.path
                return original(module.urllib.request.ProxyHandler({})).open(request,timeout=timeout)
        try:
            native=module.Native({},pathlib.Path('/unused'),None);native.jwt='synthetic-test-only'
            with patch.object(module.urllib.request,'build_opener',return_value=Remap('/large')):
                with self.assertRaises(module.Failure):native.http({},200)
            before=time.monotonic()
            with patch.object(module.urllib.request,'build_opener',return_value=Remap('/slow')):
                with self.assertRaises((module.Failure,TimeoutError)):native.http({},200,timeout_seconds=.25)
            self.assertLess(time.monotonic()-before,2)
        finally:server.shutdown();server.server_close();thread.join(timeout=2)

    def docker_fixture(self,directory,mode,identifier=None):
        calls=[];counter=[0];owner='a'*64;actual='b'*64;namespace='scope-product-123456'
        class Backend:
            def process(self,command,timeout):
                calls.append(command)
                self_outer.assertEqual(command[:3],['docker','--host','unix:///var/run/docker.sock'])
                args=command[3:]
                if args[0]=='ps' and any(v.startswith('name=') for v in args):result=actual+'\n'
                elif args[0]=='inspect':
                    result=actual+'|/'+namespace+'|'+('foreign-owner' if mode=='foreign' else owner)+'\n'
                elif args[0]=='rm':result=actual+'\n'
                elif args[0]=='ps':result=(actual+'\n') if mode=='leftover' else ''
                else:raise AssertionError('unexpected capability')
                counter[0]+=1;p=pathlib.Path(directory)/str(counter[0]);p.write_text(result);return p
        self_outer=self
        docker=module.OwnedDocker(Backend(),namespace);docker.owner=owner;docker.identifier=identifier;docker.attempted=True
        return docker,calls,actual

    def test_foreign_container_owner_is_never_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            docker,calls,_actual=self.docker_fixture(tmp,'foreign')
            with self.assertRaises(module.Failure):docker.cleanup()
            self.assertFalse(any('rm' in command[3:] for command in calls))

    def test_replaced_name_id_is_never_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            docker,calls,_actual=self.docker_fixture(tmp,'replaced',identifier='c'*64)
            with self.assertRaises(module.Failure):docker.cleanup()
            self.assertFalse(any('rm' in command[3:] for command in calls))

    def test_partial_create_cleanup_uses_only_verified_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            docker,calls,actual=self.docker_fixture(tmp,'partial')
            docker.cleanup()
            removes=[command for command in calls if command[3:5]==['rm','--force']]
            self.assertEqual(removes,[['docker','--host','unix:///var/run/docker.sock','rm','--force',actual]])
            self.assertTrue(any('label=eventflow.scope-product-owner='+docker.owner in command for command in calls))

    def test_post_removal_leftover_is_failure_not_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            docker,calls,actual=self.docker_fixture(tmp,'leftover',identifier='b'*64)
            with self.assertRaises(module.Failure) as failure:docker.cleanup()
            self.assertEqual(failure.exception.phase,'cleanup')
            self.assertTrue(failure.exception.retain)
            self.assertEqual([command[-1] for command in calls if command[3:5]==['rm','--force']],[actual])


if __name__=='__main__':unittest.main()
