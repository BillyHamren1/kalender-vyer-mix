"""Native runner boundary tests: no PostgreSQL/Docker/source mutation capability."""
import contextlib
import csv
import importlib.util
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

PATH=pathlib.Path(__file__).with_name('operations-whole-scope-projection-native.py')
spec=importlib.util.spec_from_file_location('projection_native_guard',PATH)
wrapper=importlib.util.module_from_spec(spec);spec.loader.exec_module(wrapper)
BASE={**wrapper.FIXED_ENV,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234','PATH':os.environ['PATH']}

class ProjectionNativeBoundary(unittest.TestCase):
    def test_hostile_environment_never_gets_child_capability(self):
        hostile=[{'CI':'false'},{'EVENTFLOW_SCOPE_PROJECTION_ISOLATED_DB':'false'},{'PGHOST':'remote.example'}, {'PGHOST':'localhost'},{'PGPORT':'6543'},{'PGUSER':'service_role'},{'PGDATABASE':'postgres'},{'PGDATABASE':wrapper.DATABASE+'_other'}, {'PGOPTIONS':'PRIVATE_OPTIONS'},{'PGSERVICE':'private'},{'PGPASSFILE':'/private'},{'PGHOSTADDR':'127.0.0.1'},{'PGCONNECT_TIMEOUT':'99'},{'SUPABASE_URL':'PRIVATE_URL'},{'DATABASE_URL':'PRIVATE_URL'},{'PGRST_DB_URI':'PRIVATE_URI'},{'DOCKER_HOST':'PRIVATE_HOST'},{'COMPOSE_FILE':'PRIVATE_FILE'},{'TMPDIR':'/private'},{'EVENTFLOW_SCOPE_PROJECTION_DENO_BIN':'relative/deno'},{'EVENTFLOW_SCOPE_PROJECTION_DB_URL':'PRIVATE_URL'},{'GITHUB_REPOSITORY':'wrong/repo'},{'GITHUB_RUN_ID':'1;command'}]
        with mock.patch.object(wrapper,'private_run',side_effect=AssertionError('child forbidden')) as child:
            for change in hostile:
                with self.subTest(keys=list(change)):
                    with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.execute({**BASE,**change})
                    self.assertEqual(result.exception.phase,'guard')
            child.assert_not_called()

    def test_source_closure_hash_order_and_symlink_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=pathlib.Path(temporary)/'owned';root.mkdir()
            closure=json.loads(wrapper.CLOSURE.read_text())
            for name in closure['files']:
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(wrapper.ROOT/name,p)
            manifest=root/'closure.json';manifest.write_text(json.dumps(closure))
            self.assertEqual(len(wrapper.closure_paths(root,manifest)),23)
            file=root/closure['ordered_schema_paths'][0];original=file.read_bytes();file.write_bytes(original+b'\n')
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            file.write_bytes(original);file.unlink();file.symlink_to(wrapper.ROOT/closure['ordered_schema_paths'][0])
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            file.unlink();file.write_bytes(original)
            changed=json.loads(json.dumps(closure));changed['ordered_schema_paths'].reverse();manifest.write_text(json.dumps(changed))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            changed=json.loads(json.dumps(closure));changed['files']['../outside']='a'*64;manifest.write_text(json.dumps(changed))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)

    def test_nonfresh_database_cannot_reach_schema_or_fixture(self):
        phases=[]
        def fake(shared,phase,command,env,private,timeout,stdin=None):
            phases.append(phase);self.assertEqual(phase,'fresh_database')
            self.assertNotIn(b'create ',stdin.lower());self.assertNotIn(b'insert ',stdin.lower())
            file=private/'fresh.result';file.write_text('f\n');return file
        with mock.patch.object(wrapper,'private_run',side_effect=fake), mock.patch.object(wrapper.load_shared().subprocess,'Popen',side_effect=AssertionError('real child forbidden')):
            with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.execute(BASE)
        self.assertEqual(phases,['fresh_database']);self.assertEqual(result.exception.phase,'fresh_database')

    def test_bound_copy_data_never_becomes_sql_or_command(self):
        data={'text':"'\\.\nDROP TABLE public.customer;\n\\! private_command 😀\n\"",'nested':{'null':None}}
        sql=wrapper.copy_json(data,'fixture_input');parts=sql.splitlines()
        self.assertEqual(parts[0],'create temporary table fixture_input(data jsonb not null);')
        self.assertEqual(parts[-1],'\\.')
        parsed=list(csv.reader(io.StringIO('\n'.join(parts[2:-1])+'\n')))
        self.assertEqual(len(parsed),1);self.assertEqual(json.loads(parsed[0][0]),data)
        with self.assertRaises(wrapper.ClosedFailure):wrapper.copy_json(data,'public.customer')
        source=(wrapper.HERE/'operations-invoice-obligation-kernel-postgres-test.sql').read_text()
        prepared=wrapper.fixture_sql(source,data,'invoice_catalog')
        self.assertNotIn(":'fixture'",prepared);self.assertIn('(select data from pg_temp.fixture_input)',prepared)
        self.assertIn('rollback;',prepared);self.assertIn('jsonb_agg(jsonb_build_object',prepared)
        with self.assertRaises(wrapper.ClosedFailure):wrapper.fixture_sql(source+"\nselect :\'fixture\';",data,'invoice_catalog')

    def test_catalog_labels_counts_and_functions_closed(self):
        base,actual=wrapper.fixed_labels()
        def catalog(labels):return {'schema':'whole-scope-projection-prototype-vectors.v1','vectors':[{'label':label,'function':'obligation','input':{},'expected':None,'error':None}for label in sorted(labels)],'ts_only_source_version_denials':5}
        value=catalog(base);wrapper.validate_vectors(value);wrapper.validate_vectors(catalog(base|actual),True)
        for mutate in [lambda e:e['vectors'].pop(),lambda e:e['vectors'][0].update(label='PRIVATE_LABEL'),lambda e:e['vectors'][0].update(function='private_sql'),lambda e:e['vectors'][1].update(label=e['vectors'][0]['label']),lambda e:e.update(ts_only_source_version_denials=4)]:
            e=json.loads(json.dumps(value));mutate(e)
            with self.assertRaises(wrapper.ClosedFailure):wrapper.validate_vectors(e)
        sql=wrapper.parity_sql(value,'synthetic41')
        self.assertIn('COPY pg_temp.prototype_vectors(data)',sql);self.assertNotIn('execute ',sql.lower())
        self.assertIn("actual is distinct from vector->'expected'",sql);self.assertIn("actual_error is distinct from vector->>'error'",sql)
        self.assertNotIn('schema_version',sql.split('do $$declare vector')[1])
        with self.assertRaises(wrapper.ClosedFailure):wrapper.parity_sql(value,'invented')

    def test_actual_private_child_failure_redacts_and_reaps(self):
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);private.chmod(0o700);shared=wrapper.load_shared();capture=io.StringIO()
            with contextlib.redirect_stdout(capture),contextlib.redirect_stderr(capture):
                with self.assertRaises(wrapper.ClosedFailure) as result:
                    wrapper.private_run(shared,'combined_parity',[sys.executable,'-c',"import sys;print('PRIVATE_COST_BODY');print('ERROR: 22023: PRIVATE_SQL_CONTEXT',file=sys.stderr);sys.exit(1)"],dict(os.environ),private,3)
            self.assertEqual(capture.getvalue(),'');self.assertEqual(result.exception.phase,'combined_parity');self.assertEqual(result.exception.code,'22023')
            for p in (private/'combined_parity').iterdir():self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)
            self.assertEqual(stat.S_IMODE((private/'combined_parity').stat().st_mode),0o700)

    def test_actual_owned_timeout_and_no_public_error_body(self):
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);shared=wrapper.load_shared();pidfile=private/'pid'
            command=[sys.executable,'-c',"import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pidfile)]
            with self.assertRaises(wrapper.ClosedFailure):wrapper.private_run(shared,'synthetic_parity',command,dict(os.environ),private,0.3)
            with self.assertRaises(ProcessLookupError):os.kill(int(pidfile.read_text()),0)
            output=io.StringIO()
            with mock.patch.object(wrapper,'execute',side_effect=wrapper.ClosedFailure('combined_parity','22023')),contextlib.redirect_stderr(output):self.assertEqual(wrapper.main(),1)
            self.assertEqual(output.getvalue(),'whole-scope-projection-native FAIL combined_parity SQLSTATE=22023\n')
            for private_code in ['SECRT','ABCDE','12345']:
                output=io.StringIO()
                with mock.patch.object(wrapper,'execute',side_effect=wrapper.ClosedFailure('proof',private_code)),contextlib.redirect_stderr(output):self.assertEqual(wrapper.main(),1)
                self.assertEqual(output.getvalue(),'whole-scope-projection-native FAIL proof SQLSTATE=unclassified\n')
                self.assertNotIn(private_code,output.getvalue())

    def test_private_json_nonfinite_oversize_and_symlink_denied(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=pathlib.Path(temporary)/'value.json';path.write_text('{"value":NaN}')
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(path,'proof')
            path.write_text('x'*(8*1024*1024+1))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(path,'proof')
            path.unlink();path.symlink_to(wrapper.CLOSURE)
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(path,'proof')

if __name__=='__main__':unittest.main()
