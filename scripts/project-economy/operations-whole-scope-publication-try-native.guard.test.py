"""Disposable runner boundaries; no real DB connection or source mutation."""
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

PATH=pathlib.Path(__file__).with_name('operations-whole-scope-publication-try-native.py')
spec=importlib.util.spec_from_file_location('publication_native_guard',PATH)
wrapper=importlib.util.module_from_spec(spec);spec.loader.exec_module(wrapper)
BASE={**wrapper.FIXED_ENV,'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234','PATH':os.environ['PATH']}

class PublicationNativeBoundary(unittest.TestCase):
    def test_hostile_environment_has_no_child_capability(self):
        hostile=[{'CI':'false'},{'EVENTFLOW_SCOPE_PUBLICATION_TRY_ISOLATED_DB':'false'},{'PGHOST':'remote.example'},{'PGHOST':'localhost'},{'PGPORT':'6543'},{'PGUSER':'service_role'},{'PGDATABASE':'postgres'},{'PGDATABASE':wrapper.DATABASE+'_other'},{'PGOPTIONS':'PRIVATE'},{'PGHOSTADDR':'127.0.0.1'},{'PGSERVICE':'PRIVATE'},{'PGSERVICEFILE':'/private'},{'PGPASSFILE':'/private'},{'PGCONNECT_TIMEOUT':'99'},{'SUPABASE_URL':'PRIVATE'},{'PGRST_DB_URI':'PRIVATE'},{'DOCKER_HOST':'PRIVATE'},{'COMPOSE_FILE':'PRIVATE'},{'BASH_FUNC_psql%%':'() { private_command; }'},{'SHELLOPTS':'xtrace'},{'BASHOPTS':'extdebug'},{'PS4':'PRIVATE'},{'PYTHONSTARTUP':'/private'},{'PYTHONINSPECT':'1'},{'LD_PRELOAD':'/private'},{'LD_LIBRARY_PATH':'/private'},{'DYLD_INSERT_LIBRARIES':'/private'},{'BASH_ENV':'/private'},{'ENV':'/private'},{'PYTHONPATH':'/private'},{'PYTHONHOME':'/private'},{'NODE_OPTIONS':'--require=/private'},{'DATABASE_URL':'PRIVATE'},{'DB_URL':'PRIVATE'},{'TMPDIR':'/private'},{'TMP':'/private'},{'TEMP':'/private'},{'EVENTFLOW_SCOPE_PUBLICATION_TRY_DENO_BIN':'relative/deno'},{'EVENTFLOW_SCOPE_PUBLICATION_DB_URL':'PRIVATE'},{'GITHUB_REPOSITORY':'wrong/repo'},{'GITHUB_RUN_ID':'1;command'}]
        with mock.patch.object(wrapper,'private_run',side_effect=AssertionError('child forbidden')) as child:
            for change in hostile:
                with self.subTest(keys=list(change)),self.assertRaises(wrapper.ClosedFailure) as result:wrapper.execute({**BASE,**change})
                self.assertEqual(result.exception.phase,'guard')
            child.assert_not_called()

    def test_exact_closure_hash_order_and_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=pathlib.Path(temporary)/'owned';root.mkdir();closure=json.loads(wrapper.CLOSURE.read_text())
            for name in closure['files']:
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(wrapper.ROOT/name,p)
            manifest=root/'closure.json';manifest.write_text(json.dumps(closure))
            self.assertEqual(len(wrapper.closure_paths(root,manifest)),23)
            p=root/closure['ordered_schema_paths'][0];original=p.read_bytes();p.write_bytes(original+b'\n')
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            p.write_bytes(original);p.unlink();p.symlink_to(wrapper.ROOT/closure['ordered_schema_paths'][0])
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            p.unlink();p.write_bytes(original)
            changed=json.loads(json.dumps(closure));changed['ordered_schema_paths'].reverse();manifest.write_text(json.dumps(changed))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)
            changed=json.loads(json.dumps(closure));changed['files']['../outside']='a'*64;manifest.write_text(json.dumps(changed))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.closure_paths(root,manifest)

    def test_nonfresh_db_never_reaches_ddl(self):
        phases=[]
        def fake(shared,phase,command,env,private,timeout,stdin=None):
            phases.append(phase);self.assertEqual(phase,'fresh_database');self.assertNotIn(b'create ',stdin.lower());self.assertNotIn(b'insert ',stdin.lower())
            output=private/'fresh.result';output.write_text('f\n');return output
        with mock.patch.object(wrapper,'private_run',side_effect=fake):
            with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.execute(BASE)
        self.assertEqual(phases,['fresh_database']);self.assertEqual(result.exception.phase,'fresh_database')

    def test_fixture_copy_cannot_inject_sql_or_psql(self):
        value={'text':"'\\.\nDROP TABLE public.customer;\n\\! private_command 😀\n\""}
        sql=wrapper.copy_json(value);parts=sql.splitlines();self.assertEqual(parts[-1],'\\.')
        rows=list(csv.reader(io.StringIO('\n'.join(parts[2:-1])+'\n')));self.assertEqual(len(rows),1);self.assertEqual(json.loads(rows[0][0]),value)
        source=(wrapper.HERE/'whole-scope-publication-transaction-native-setup.sql').read_text();prepared=wrapper.setup_sql(source,value)
        self.assertNotIn(":'fixture'",prepared);self.assertIn('(select data from pg_temp.fixture_input)',prepared);self.assertIn('begin;',prepared);self.assertIn('commit;',prepared)
        with self.assertRaises(wrapper.ClosedFailure):wrapper.setup_sql(source+"\nselect :'fixture';",value)
        with self.assertRaises(wrapper.ClosedFailure):wrapper.copy_json({'value':float('nan')})

    def test_private_child_error_is_redacted_and_permissioned(self):
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);private.chmod(0o700);capture=io.StringIO();shared=wrapper.load_shared()
            with contextlib.redirect_stdout(capture),contextlib.redirect_stderr(capture):
                with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.private_run(shared,'native_sessions',[sys.executable,'-c',"import sys;print('PRIVATE_BODY');print('ERROR: 22023: PRIVATE_SQL_CONTEXT',file=sys.stderr);sys.exit(1)"],dict(os.environ),private,3)
            self.assertEqual(capture.getvalue(),'');self.assertEqual(result.exception.code,'22023');self.assertEqual(result.exception.phase,'native_sessions')
            self.assertEqual(stat.S_IMODE((private/'native_sessions').stat().st_mode),0o700)
            for p in (private/'native_sessions').iterdir():self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)

    def test_owned_timeout_and_public_failure_protocol(self):
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);pidfile=private/'pid';shared=wrapper.load_shared()
            command=[sys.executable,'-c',"import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pidfile)]
            with self.assertRaises(wrapper.ClosedFailure):wrapper.private_run(shared,'native_sessions',command,dict(os.environ),private,.3)
            with self.assertRaises(ProcessLookupError):os.kill(int(pidfile.read_text()),0)
            for code,expected in [('22023','22023'),('SECRET','unclassified'),('12345','unclassified')]:
                output=io.StringIO()
                with mock.patch.object(wrapper,'execute',side_effect=wrapper.ClosedFailure('native_sessions',code)),contextlib.redirect_stderr(output):self.assertEqual(wrapper.main(),1)
                self.assertEqual(output.getvalue(),'whole-scope-publication-try-native FAIL native_sessions SQLSTATE='+expected+' CHECKPOINT=none REASON=none\n')

    def test_closed_native_checkpoint_and_sqlstate_never_expose_context(self):
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);shared=wrapper.load_shared()
            output=io.StringIO()
            command=[sys.executable,'-c',"import sys;sys.stderr.write('PRIVATE_BODY\\nTRY_NATIVE_CHECKPOINT baseline_sleep\\nERROR: 42883: PRIVATE_SQL_CONTEXT\\n');sys.exit(1)"]
            with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
                with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.private_run(shared,'native_sessions',command,dict(os.environ),private,3)
            self.assertEqual(output.getvalue(),'');self.assertEqual(result.exception.code,'42883');self.assertEqual(result.exception.checkpoint,'baseline_sleep')
            output=io.StringIO()
            with mock.patch.object(wrapper,'execute',side_effect=result.exception),contextlib.redirect_stderr(output):self.assertEqual(wrapper.main(),1)
            self.assertEqual(output.getvalue(),'whole-scope-publication-try-native FAIL native_sessions SQLSTATE=42883 CHECKPOINT=baseline_sleep REASON=none\n')
            self.assertEqual(wrapper.ClosedFailure('native_sessions',checkpoint='PRIVATE_CONTEXT').checkpoint,'none')
            self.assertEqual(wrapper.ClosedFailure('native_sessions',reason='PRIVATE_CONTEXT').reason,'none')

    def test_finer_checkpoint_and_authored_reason_are_closed(self):
        for checkpoint in ('baseline_busy_denial','baseline_busy_state','baseline_writer','baseline_receipt','baseline_updater'):
            with tempfile.TemporaryDirectory() as temporary:
                private=pathlib.Path(temporary);shared=wrapper.load_shared();output=io.StringIO()
                command=[sys.executable,'-c',"import sys;sys.stderr.write('PRIVATE_BODY\\nTRY_NATIVE_CHECKPOINT '+sys.argv[1]+'\\nTRY_NATIVE_REASON unexpected_success\\nPRIVATE_SQL_CONTEXT\\n');sys.exit(1)",checkpoint]
                with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
                    with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.private_run(shared,'native_sessions',command,dict(os.environ),private,3)
                self.assertEqual(output.getvalue(),'');self.assertEqual(result.exception.checkpoint,checkpoint);self.assertEqual(result.exception.reason,'unexpected_success')
                output=io.StringIO()
                with mock.patch.object(wrapper,'execute',side_effect=result.exception),contextlib.redirect_stderr(output):self.assertEqual(wrapper.main(),1)
                self.assertEqual(output.getvalue(),'whole-scope-publication-try-native FAIL native_sessions SQLSTATE=unclassified CHECKPOINT='+checkpoint+' REASON=unexpected_success\n')
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary);shared=wrapper.load_shared()
            command=[sys.executable,'-c',"import sys;sys.stderr.write('TRY_NATIVE_CHECKPOINT PRIVATE_CONTEXT\\nTRY_NATIVE_REASON PRIVATE_SQL_CONTEXT\\n');sys.exit(1)"]
            with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.private_run(shared,'native_sessions',command,dict(os.environ),private,3)
            self.assertEqual(result.exception.checkpoint,'none');self.assertEqual(result.exception.reason,'none')

    def test_json_nonfinite_oversize_symlink_denied(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=pathlib.Path(temporary)/'value';p.write_text('{"value":NaN}')
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(p,'proof')

            p.write_text('x'*(8*1024*1024+1))
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(p,'proof')
            p.unlink();p.symlink_to(wrapper.CLOSURE)
            with self.assertRaises(wrapper.ClosedFailure):wrapper.read_json(p,'proof')

    def test_terminal_branch_ledger_matches_exact_saved_count(self):
        for baseline,compound in ((0,0),(0,1),(1,0),(1,1)):
            count=4+baseline+compound
            rows=['whole-scope-publication-transaction-vectors PASS '+str(count)+' actual_saved_sql_to_unchanged_kernel','whole-scope-publication-try-branches PASS baseline_as_of='+str(baseline)+' compound_as_of='+str(compound)+' saved='+str(count),wrapper.NATIVE_MARKER]
            self.assertEqual(wrapper.terminal_proof(rows),rows)
            for changed in ([rows[0],rows[1].replace('saved='+str(count),'saved=9'),rows[2]],['PRIVATE_CONTEXT',rows[1],rows[2]],rows+['PRIVATE_BODY'],[rows[0],rows[1],rows[2]+' PRIVATE_CONTEXT']):
                with self.assertRaises(wrapper.ClosedFailure) as result:wrapper.terminal_proof(changed)
                self.assertEqual(result.exception.phase,'proof')
        with self.assertRaises(wrapper.ClosedFailure):wrapper.terminal_proof(['whole-scope-publication-transaction-vectors PASS 6 actual_saved_sql_to_unchanged_kernel','whole-scope-publication-try-branches PASS baseline_as_of=0 compound_as_of=1 saved=6',wrapper.NATIVE_MARKER])

if __name__=='__main__':unittest.main()
