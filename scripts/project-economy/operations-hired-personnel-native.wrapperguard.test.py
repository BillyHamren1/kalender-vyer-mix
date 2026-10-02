"""Wrapper guard/privacy/process tests. No database, Docker or source mutations."""
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import stat
import shutil
import sys
import tempfile
import unittest
from unittest import mock

PATH = pathlib.Path(__file__).with_name('operations-hired-personnel-native.py')
spec = importlib.util.spec_from_file_location('hired_native_wrapper', PATH)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
BASE = {**wrapper.FIXED_ENV, 'GITHUB_REPOSITORY': 'BillyHamren1/kalender-vyer-mix',
        'GITHUB_RUN_ID': '12345', 'PATH': os.environ['PATH']}

class NativeWrapperBoundary(unittest.TestCase):
    def test_hostile_guard_has_no_child_capability(self):
        hostile = [{'CI':'false'}, {'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB':'false'},
                   {'PGHOST':'hosted.example'}, {'PGPORT':'6543'}, {'PGUSER':'service_role'},
                   {'PGDATABASE':'postgres'}, {'PGDATABASE':'operations_hired_authority_runtime_x'},
                   {'PGOPTIONS':'-c search_path=private'}, {'PGHOSTADDR':'127.0.0.1'},
                   {'PGSERVICE':'foreign'}, {'PGPASSFILE':'/tmp/foreign'}, {'PGCONNECT_TIMEOUT':'99'},
                   {'DATABASE_URL':'PRIVATE_CONNECTION'}, {'SUPABASE_URL':'PRIVATE_HOST'},
                   {'PGRST_DB_URI':'PRIVATE_URI'}, {'DOCKER_HOST':'PRIVATE_DOCKER'},
                   {'COMPOSE_FILE':'PRIVATE_COMPOSE'}, {'TMPDIR':'/foreign'},
                   {'GITHUB_REPOSITORY':'foreign/repository'}, {'GITHUB_RUN_ID':'1;command'},
                   {'EVENTFLOW_HIRED_PERSONNEL_DENO_BIN':'relative/deno'}]
        with mock.patch.object(wrapper.subprocess, 'Popen', side_effect=AssertionError('child forbidden')) as child:
            for patch in hostile:
                with self.subTest(keys=list(patch)):
                    with self.assertRaises(wrapper.ClosedFailure) as result:
                        wrapper.execute({**BASE, **patch})
                    self.assertEqual(result.exception.phase, 'guard')
            child.assert_not_called()

    def test_private_failure_only_retains_sqlstate(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            directory.chmod(0o700)
            output = io.StringIO()
            command = [sys.executable, '-c', "import sys;print('PRIVATE_BODY');print('ERROR: 22023: PRIVATE_SQL_CONTEXT',file=sys.stderr);sys.exit(1)"]
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                with self.assertRaises(wrapper.ClosedFailure) as caught:
                    wrapper.run_private('authority_sql', command, dict(os.environ), directory, directory, 3)
            self.assertEqual((caught.exception.phase,caught.exception.code),('authority_sql','22023'))
            self.assertEqual(output.getvalue(), '')
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode),0o700)
            for path in directory.iterdir():
                self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)

    def test_timeout_reaps_owned_child(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=pathlib.Path(temporary)
            pid_file=directory/'child.pid'
            command=[sys.executable,'-c',"import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pid_file)]
            with self.assertRaises(wrapper.ClosedFailure):
                wrapper.run_private('native_fixture',command,dict(os.environ),directory,directory,0.3)
            pid=int(pid_file.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid,0)

    def test_owned_timeout_kills_abort_ignoring_descendant(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=pathlib.Path(temporary)
            pid_file=directory/'descendant.pid'
            grandchild="import os,pathlib,signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text(str(os.getpid())+','+str(os.getpgrp()));time.sleep(30)"
            parent="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]);time.sleep(30)"
            with self.assertRaises(wrapper.ClosedFailure):
                wrapper.run_private('native_fixture',[sys.executable,'-c',parent,grandchild,str(pid_file)],dict(os.environ),directory,directory,0.3)
            pid,group=map(int,pid_file.read_text().split(','))
            self.assertEqual(wrapper.live_owned_group(group),[])
            try:
                os.kill(pid,0)
            except ProcessLookupError:
                pass
            else:
                status=pathlib.Path('/proc')/str(pid)/'stat'
                self.assertTrue(not status.exists() or status.read_text().rsplit(')',1)[1].split()[0]=='Z')

    def test_exact_owned_schema_closure(self):
        root, paths=wrapper.owned_paths()
        manifest=root/'scripts/project-economy/project-evidence-http-runtime/schema-closure.json'
        self.assertEqual(len(wrapper.schema_paths(root,manifest)),23)
        original=json.loads(manifest.read_text())
        with tempfile.TemporaryDirectory() as temporary:
            private=pathlib.Path(temporary)
            fake=private/'closure.json'
            for mutation in [dict(original,database='postgres'),dict(original,ordered_paths=list(reversed(original['ordered_paths']))),dict(original,ordered_paths=['../foreign.sql']+original['ordered_paths'][1:]),dict(original,extra='hostile')]:
                fake.write_text(json.dumps(mutation))
                with self.assertRaises(wrapper.ClosedFailure):wrapper.schema_paths(root,fake)
            link=private/'linked.json';link.symlink_to(manifest)
            with self.assertRaises(wrapper.ClosedFailure):wrapper.schema_paths(root,link)

    def test_exact_complete_ordered_public_proof(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=pathlib.Path(temporary)/'proof'
            path.write_text('\n'.join(wrapper.EXPECTED)+'\n')
            self.assertEqual(wrapper.validate_proof(path),wrapper.EXPECTED)
            for lines in [wrapper.EXPECTED[:-1],list(reversed(wrapper.EXPECTED)),wrapper.EXPECTED+['PRIVATE_BODY'],wrapper.EXPECTED+[wrapper.EXPECTED[-1]]]:
                path.write_text('\n'.join(lines)+'\n')
                with self.assertRaises(wrapper.ClosedFailure):wrapper.validate_proof(path)

    def test_sql_literal_and_private_guc_fidelity(self):
        value={'quote':"x');DROP TABLE arbitrary;--",'unicode':'😀','newline':'a\nb','slash':'a\\b'}
        prefix=wrapper.fixture_prefix(value)
        self.assertTrue(prefix.startswith('set standard_conforming_strings=on;'))
        raw=json.dumps(value,ensure_ascii=False,separators=(',',':'))
        self.assertIn(wrapper.sql_literal(raw),prefix)
        self.assertIn("x'');DROP TABLE",prefix)
        self.assertNotIn("x');DROP TABLE",prefix)

    def test_main_failure_is_closed_even_on_unexpected_error(self):
        stderr=io.StringIO()
        with mock.patch.object(wrapper,'execute',side_effect=ValueError('PRIVATE_TOKEN')),mock.patch.object(wrapper.signal,'signal'),contextlib.redirect_stderr(stderr):
            self.assertEqual(wrapper.main(),1)
        self.assertEqual(stderr.getvalue(),'operations-hired-native FAIL phase=guard SQLSTATE=unclassified\n')
        for retain in (False,True):
            created=[]
            def rejected(phase,command,env,cwd,directory,timeout,stdin=None):
                created.append(directory)
                raise wrapper.ClosedFailure(phase,retain_private=retain)
            with mock.patch.object(wrapper,'run_private',side_effect=rejected):
                with self.assertRaises(wrapper.ClosedFailure):wrapper.execute(BASE)
            self.assertEqual(len(created),1)
            self.assertEqual(created[0].exists(),retain)
            if retain:
                self.assertEqual(stat.S_IMODE(created[0].stat().st_mode),0o700)
                shutil.rmtree(created[0])


if __name__=='__main__':unittest.main()
