"""Pure refusal/proof tests: no Docker, HTTP, PostgreSQL or browser substitution."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('operations-project-cost-mounted-browser-native.py')
spec = importlib.util.spec_from_file_location('mounted_native', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def valid_env():
    return {'CI':'true','ISOLATED_PROJECT_EVIDENCE_HTTP':'true','ISOLATED_OPERATIONS_PROJECT_COST_MOUNTED_BROWSER':'true',
    'GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'37000000001','GITHUB_SHA':'b'*40,
    module.EXPECTED_SOURCE_HEAD:'a'*40}

def proof():
    mode='project_cost_evidence';values=[{'case':case,'result':'PASS'} for case in module.CASES[mode]]
    return values+[{'result':'PASS','cases':8,'gateMode':mode,'scope':module.SCOPE}]

def selectors():
    ident=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
    return {'schema':'operations-project-cost-mounted-selectors.v1','organizationId':ident(1),'actorId':ident(199),'projectId':ident(1017),'knownReportId':ident(7003),'missingReportId':ident(7004)}

def selector_log(value,sequence='23'):
    return 'PROJECT_COST_MOUNTED_SELECTORS='+json.dumps(value)+'\nPROJECT_COST_MOUNTED_GRANT_SEQUENCE='+sequence+'\noperations-project-cost-mounted-browser-fixture SETUP PASS\n'

class BoundaryTests(unittest.TestCase):
    def test_expected_source_head_controls_checkout_while_event_sha_is_identity_only(self):
        merge_event = valid_env()
        self.assertNotEqual(merge_event['GITHUB_SHA'], merge_event[module.EXPECTED_SOURCE_HEAD])
        self.assertEqual(module.isolated(merge_event), 'project-evidence-http-37000000001')
        with patch.object(module, 'checked_head', return_value=merge_event[module.EXPECTED_SOURCE_HEAD]):
            self.assertEqual(module.checkout_authority(merge_event), 'a' * 40)
        equal_event = dict(merge_event, GITHUB_SHA=merge_event[module.EXPECTED_SOURCE_HEAD])
        self.assertEqual(module.isolated(equal_event), 'project-evidence-http-37000000001')
        with patch.object(module, 'checked_head', return_value=equal_event[module.EXPECTED_SOURCE_HEAD]):
            self.assertEqual(module.checkout_authority(equal_event), 'a' * 40)

    def test_expected_source_head_absent_invalid_or_mismatched_refuses_before_child(self):
        variants = [(False, None), (True, ''), (True, None), (True, 'A' * 40),
                    (True, 'g' * 40), (True, 'a' * 39), (True, 'a' * 41), (True, 7)]
        for present, value in variants:
            env = valid_env()
            if present:
                env[module.EXPECTED_SOURCE_HEAD] = value
            else:
                env.pop(module.EXPECTED_SOURCE_HEAD)
            with self.subTest(value=value), patch.object(module.os, 'environ', env), \
                    patch.object(module, 'command') as native, patch.object(module.subprocess, 'Popen') as process:
                with self.assertRaises(module.ClosedFailure):
                    module.main()
                native.assert_not_called()
                process.assert_not_called()
        with patch.dict(module.os.environ, valid_env(), clear=True), \
                patch.object(module, 'checked_head', return_value='c' * 40), \
                patch.object(module, 'command') as native, patch.object(module.subprocess, 'Popen') as process:
            with self.assertRaises(module.ClosedFailure):
                module.main()
            native.assert_not_called()
            process.assert_not_called()

    def test_distinct_guard_precedes_every_process_and_does_not_admit_old_mode_flag(self):
        self.assertEqual(module.isolated(valid_env()),'project-evidence-http-37000000001')
        variants=[{'CI':'false'},{'ISOLATED_PROJECT_EVIDENCE_HTTP':'false'},{'ISOLATED_OPERATIONS_PROJECT_COST_MOUNTED_BROWSER':'','ISOLATED_OPERATIONS_OBLIGATION_MOUNTED_BROWSER':'true'}, {'GITHUB_REPOSITORY':'foreign/repo'},{'GITHUB_RUN_ID':'1;command'},{'GITHUB_SHA':'main'}]
        for change in variants:
            with patch.dict(module.os.environ,dict(valid_env(),**change),clear=True),patch.object(module,'command') as native,patch.object(module.subprocess,'Popen') as process:
                with self.assertRaises(module.ClosedFailure):module.main()
                native.assert_not_called();process.assert_not_called()
    def test_runtime_overrides_and_provided_secrets_never_reach_daemon(self):
        for key,value in {'DOCKER_CONTEXT':'remote','DOCKER_HOST':'tcp://remote','PGSERVICE':'real','PGHOST':'remote','DATABASE_URL':'postgres://remote','SUPABASE_URL':'https://real','NODE_OPTIONS':'--require foreign','HTTP_PROXY':'http://foreign','TMPDIR':'/foreign','PROJECT_EVIDENCE_CONTROL_TOKEN':'secret','PROJECT_EVIDENCE_COMPOSE_NAMESPACE':'foreign','OPERATIONS_PROJECT_COST_MOUNTED_SELECTORS':'PRIVATE','VITE_OPERATIONS_COST_EVIDENCE_ENABLED':'true'}.items():
            with self.assertRaises(module.ClosedFailure):module.isolated(dict(valid_env(),**{key:value}))
    def test_python_dynamic_loader_and_shell_injection_refused_with_zero_children(self):
        hostile=['PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','DYLD_LIBRARY_PATH','BASH_ENV','ENV','SHELLOPTS','BASHOPTS','PS4','BASH_FUNC_python%%','PGRST_DB_URI']
        for name in hostile:
            with self.subTest(name=name),patch.dict(module.os.environ,dict(valid_env(),**{name:'PRIVATE'}),clear=True),patch.object(module,'command') as native,patch.object(module.subprocess,'Popen') as process:
                with self.assertRaises(module.ClosedFailure):module.main()
                native.assert_not_called();process.assert_not_called()
        self.assertEqual(module.isolated(dict(valid_env(),PYTHONDONTWRITEBYTECODE='1')),'project-evidence-http-37000000001')

    def test_only_fixed_complete_eight_actual_cases_accepted(self):
        good=proof();self.assertEqual(module.proof('\n'.join(map(json.dumps,good)),'project_cost_evidence'),good)
        bads=[good[:-1],good[1:],good[:-1]+[{**good[-1],'cases':7}],good[:-1]+[{**good[-1],'gateMode':'enabled'}],[{**good[0],'private':'PRIVATE'},*good[1:]],list(reversed(good))]
        for value in bads:
            with self.assertRaises(module.ClosedFailure):module.proof('\n'.join(map(json.dumps,value)),'project_cost_evidence')
    def test_closed_failure_accepts_only_exact_fixed_prefix_without_private_diagnostics(self):
        values=proof()[:2]+[{'result':'FAIL','gateMode':'project_cost_evidence','accepted_prefix':2,'next_case':module.CASES['project_cost_evidence'][2]}]
        raw='\n'.join(map(json.dumps,values));label=module.failed_browser_phase(raw,'project_cost_evidence','PRIVATE_SECRET')
        self.assertIn('accepted_prefix=2',label);self.assertNotIn('PRIVATE',label)
        values[-1]['private']='PRIVATE';self.assertIn('unclassified',module.failed_browser_phase('\n'.join(map(json.dumps,values)),'project_cost_evidence'))
    def test_saved_selectors_require_actual_separate_report_ids_and_durable_sequence(self):
        good=selectors();self.assertEqual(json.loads(module.selectors(selector_log(good))),good)
        for delta in [{'actorId':'foreign'},{'organizationId':'foreign'},{'projectId':'foreign'},{'knownReportId':good['missingReportId']},{'private':'PRIVATE'}]:
            with self.assertRaises(module.ClosedFailure):module.selectors(selector_log(dict(good,**delta)))
        for sequence in ['0','1.0','9007199254740992','23;SQL']:
            with self.assertRaises(module.ClosedFailure):module.selectors(selector_log(good,sequence))
    def test_only_source_grounded_old_cost_flag_enabled_and_secret_env_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'src').mkdir();(root/'src/App.tsx').write_text('import.meta.env.VITE_OPERATIONS_CATERING_EVIDENCE_ENABLED;')
            incoming=dict(valid_env(),PROJECT_EVIDENCE_JWT_SECRET='secret',GITHUB_TOKEN='secret',OPERATIONS_PROJECT_COST_MOUNTED_SELECTORS='PRIVATE')
            actual=module.build_environment(root,incoming,'project_cost_evidence')
            self.assertEqual(actual['VITE_OPERATIONS_COST_EVIDENCE_ENABLED'],'true')
            for name in ['VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED','VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED','VITE_OPERATIONS_SCOPE_INVOICE_CAPTURE_ENABLED']:self.assertEqual(actual[name],'false')
            self.assertEqual(actual['VITE_OPERATIONS_CATERING_EVIDENCE_ENABLED'],'')
            for key in ['PROJECT_EVIDENCE_JWT_SECRET','GITHUB_TOKEN','OPERATIONS_PROJECT_COST_MOUNTED_SELECTORS']:self.assertNotIn(key,actual)
    def test_reviewed_owned_helpers_byte_equal_original_and_negative_is_rollback_only(self):
        original=Path(__file__).with_name('operations-obligation-mounted-browser-native.py').read_text();new=SOURCE.read_text()
        def block(text):return text[text.index('def live_owned_group'):text.index('class NoRedirect')]
        self.assertEqual(block(original),block(new))
        sql=module.native_state_negative_sql(SOURCE.parents[2]);self.assertIn('idle_in_transaction_session_timeout',sql)
        self.assertEqual(sql.count('update public.operations_personnel_cost_streams'),1)
        self.assertIn('rollback to head_negative',sql);self.assertIn('rollback;',sql)
        self.assertIn("worker_id='00000000-0000-4000-8000-000000007001'",sql)

    def test_normal_leader_exit_still_reaps_term_ignoring_owned_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'child.pid'
            grandchild = "import os,pathlib,signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text(str(os.getpid())+','+str(os.getpgrp()));time.sleep(30)"
            parent = "import pathlib,subprocess,sys,time;subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]);p=pathlib.Path(sys.argv[2]);\nwhile not p.exists():time.sleep(.005)\nprint('done')"
            self.assertEqual(module.command([sys.executable, '-c', parent, grandchild, str(pid_file)], dict(os.environ), 'synthetic_normal', 5), 'done\n')
            _pid, group = map(int, pid_file.read_text().split(','))
            self.assertEqual(module.live_owned_group(group), [])

    def test_timeout_kills_owned_descendants_without_touching_other_session(self):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'child.pid'
            grandchild = "import os,pathlib,signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text(str(os.getpid())+','+str(os.getpgrp()));time.sleep(30)"
            parent = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]);time.sleep(30)"
            unrelated = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'], start_new_session=True)
            try:
                with self.assertRaises(module.ClosedFailure):
                    module.command([sys.executable, '-c', parent, grandchild, str(pid_file)], dict(os.environ), 'synthetic_timeout', 0.5)
                _pid, group = map(int, pid_file.read_text().split(','))
                self.assertEqual(module.live_owned_group(group), [])
                self.assertIsNone(unrelated.poll())
            finally:
                module.stop(unrelated, 'owned_test_cleanup')

    def test_error_exit_cleans_children_and_never_exposes_private_output(self):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'child.pid'
            grandchild = "import os,pathlib,signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text(str(os.getpid())+','+str(os.getpgrp()));time.sleep(30)"
            parent = "import pathlib,subprocess,sys,time;subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]);p=pathlib.Path(sys.argv[2]);\nwhile not p.exists():time.sleep(.005)\nprint('PRIVATE_BODY');print('PRIVATE_SECRET',file=sys.stderr);sys.exit(1)"
            with self.assertRaises(module.ClosedFailure) as failure:
                module.command([sys.executable, '-c', parent, grandchild, str(pid_file)], dict(os.environ), 'synthetic_error', 5)
            self.assertEqual(str(failure.exception), 'synthetic_error')
            _pid, group = map(int, pid_file.read_text().split(','))
            self.assertEqual(module.live_owned_group(group), [])

    def test_logs_explicitly_private_and_retained_if_cleanup_cannot_complete(self):
        created = []
        actual_mkdtemp = module.tempfile.mkdtemp
        def remember(*args, **kwargs):
            value = actual_mkdtemp(*args, **kwargs)
            created.append(Path(value))
            return value
        old_umask = os.umask(0)
        try:
            with patch.object(module.tempfile, 'mkdtemp', side_effect=remember), \
                    patch.object(module, 'stop', side_effect=module.ClosedFailure('owned_command_cleanup', retain_private=True)):
                with self.assertRaises(module.ClosedFailure) as failure:
                    module.command([sys.executable, '-c', "print('PRIVATE_BODY')"], dict(os.environ), 'synthetic_retention', 5)
            self.assertTrue(failure.exception.retain_private)
            self.assertEqual(len(created), 1)
            self.assertEqual(stat.S_IMODE(created[0].stat().st_mode), 0o700)
            for path in created[0].iterdir():
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        finally:
            os.umask(old_umask)
            for path in created:
                shutil.rmtree(path)

    def test_oversized_private_command_output_cannot_become_accepted_proof(self):
        with self.assertRaises(module.ClosedFailure) as failure:
            module.command([sys.executable, '-c', "import sys;sys.stdout.write('x'*(4194304+1))"], dict(os.environ), 'synthetic_output_cap', 5)
        self.assertEqual(str(failure.exception), 'synthetic_output_cap')


if __name__ == '__main__':
    unittest.main()
