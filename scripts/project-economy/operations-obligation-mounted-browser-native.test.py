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

SOURCE = Path(__file__).with_name('operations-obligation-mounted-browser-native.py')
spec = importlib.util.spec_from_file_location('mounted_native', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def valid_env():
    return {'CI': 'true', 'ISOLATED_PROJECT_EVIDENCE_HTTP': 'true',
            'ISOLATED_OPERATIONS_OBLIGATION_MOUNTED_BROWSER': 'true',
            'GITHUB_REPOSITORY': 'BillyHamren1/kalender-vyer-mix',
            'GITHUB_RUN_ID': '36979824134', 'GITHUB_SHA': 'b4272d1d' + 'a' * 32}


def proof(mode):
    values = [{'case': case, 'result': 'PASS'} for case in module.CASES[mode]]
    values.append({'result': 'PASS', 'cases': len(module.CASES[mode]), 'gateMode': mode, 'scope': module.SCOPE})
    return values


def selector():
    ident = lambda n: '00000000-0000-4000-8000-' + str(n).zfill(12)
    return {'schema': 'operations-obligation-mounted-browser-selectors.v1',
            'organizationId': ident(1), 'actorId': ident(199), 'projectId': ident(1017),
            'compositionSnapshotId': ident(3001), 'baselineEventId': ident(3002),
            'obligationId': ident(1018), 'unknownBaselineEventId': ident(3003),
            'unknownObligationId': ident(1028), 'baselineRowIndex': 2, 'unknownBaselineRowIndex': 1}


def selector_log(value):
    return 'MOUNTED_BROWSER_SELECTORS=' + json.dumps(value) + '\noperations-obligation-mounted-browser-bootstrap SETUP PASS\n'


class BoundaryTests(unittest.TestCase):
    def test_exact_separate_job_namespace_and_fixed_optional_endpoints(self):
        env = valid_env()
        self.assertEqual(module.isolated(env), 'project-evidence-http-36979824134')
        env.update(module.FIXED)
        self.assertEqual(module.isolated(env), 'project-evidence-http-36979824134')

    def test_noninteractive_isolation_failure_precedes_any_native_process(self):
        variants = [{'CI': 'false'}, {'ISOLATED_PROJECT_EVIDENCE_HTTP': 'false'},
                    {'ISOLATED_OPERATIONS_OBLIGATION_MOUNTED_BROWSER': 'false'},
                    {'GITHUB_REPOSITORY': 'foreign/repo'}, {'GITHUB_RUN_ID': '123;command'},
                    {'GITHUB_RUN_ID': '1' * 21}, {'GITHUB_SHA': 'main'},
                    {'GITHUB_SHA': 'B' * 40}]
        for change in variants:
            with self.subTest(change=change), patch.dict(module.os.environ, dict(valid_env(), **change), clear=True), \
                    patch.object(module, 'command') as native, patch.object(module.subprocess, 'Popen') as process:
                with self.assertRaises(module.ClosedFailure):
                    module.main()
                native.assert_not_called()
                process.assert_not_called()

    def test_foreign_connections_secrets_feature_and_scope_overrides_refused(self):
        overrides = {'PGHOST': 'remote', 'PGHOSTADDR': '127.0.0.1', 'PGSERVICE': 'production',
                     'DOCKER_CONTEXT': 'production', 'DOCKER_HOST': 'unix://other',
                     'COMPOSE_FILE': '/tmp/foreign', 'DATABASE_URL': 'postgres://foreign',
                     'SUPABASE_URL': 'https://production', 'PROJECT_EVIDENCE_JWT_SECRET': 'provided',
                     'PROJECT_EVIDENCE_CONTROL_TOKEN': 'provided', 'PROJECT_EVIDENCE_COMPOSE_NAMESPACE': 'foreign',
                     'PROJECT_EVIDENCE_DATABASE_NAME': 'postgres',
                     'PROJECT_EVIDENCE_POSTGREST_URL': 'http://127.0.0.1:55610/redirect',
                     'PROJECT_EVIDENCE_CONTROL_URL': 'http://127.0.0.1:55610/',
                     'OPERATIONS_MOUNTED_BROWSER_GATE_MODE': 'enabled',
                     'VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED': 'true',
                     'NODE_OPTIONS': '--require foreign', 'NODE_PATH': '/tmp/foreign', 'BUN_OPTIONS': 'foreign',
                     'NODE_USE_ENV_PROXY': '1', 'HTTP_PROXY': 'http://foreign', 'HTTPS_PROXY': 'http://foreign',
                     'ALL_PROXY': 'http://foreign', 'http_proxy': 'http://foreign', 'TMPDIR': '/foreign'}
        for key, value in overrides.items():
            with self.subTest(key=key):
                with self.assertRaises(module.ClosedFailure):
                    module.isolated(dict(valid_env(), **{key: value}))

    def test_exact_complete_three_mode_proofs_only(self):
        for mode, cases in module.CASES.items():
            values = proof(mode)
            self.assertEqual(module.proof('\n'.join(map(json.dumps, values)), mode), values)
            variants = [values[:-1], values[1:], values + [{'result': 'PASS'}], list(reversed(values))]
            bad = copy.deepcopy(values)
            bad[0]['result'] = 'FAIL'
            variants.append(bad)
            bad = copy.deepcopy(values)
            bad[0]['body'] = 'private payload'
            variants.append(bad)
            bad = copy.deepcopy(values)
            bad[-1]['cases'] = len(cases) - 1
            variants.append(bad)
            bad = copy.deepcopy(values)
            bad[-1]['gateMode'] = 'different'
            variants.append(bad)
            for wrong in variants:
                with self.subTest(mode=mode, wrong=wrong):
                    with self.assertRaises(module.ClosedFailure):
                        module.proof('\n'.join(map(json.dumps, wrong)), mode)
        with self.assertRaises(module.ClosedFailure):
            module.proof('not JSON', 'enabled')
        with self.assertRaises(module.ClosedFailure):
            module.proof('x' * 16385, 'enabled')

    def test_actual_native_selectors_and_row_order_never_guessed(self):
        value = selector()
        self.assertEqual(json.loads(module.selectors(selector_log(value))), value)
        variants = [{'actorId': value['projectId']}, {'organizationId': value['projectId']},
                    {'projectId': value['organizationId']}, {'baselineEventId': value['unknownBaselineEventId']},
                    {'compositionSnapshotId': 'guessed'}, {'baselineRowIndex': True},
                    {'unknownBaselineRowIndex': 2}, {'rawInvoice': {'amount': 0}}]
        for change in variants:
            with self.subTest(change=change), self.assertRaises(module.ClosedFailure):
                module.selectors(selector_log(dict(value, **change)))
        for bad in (selector_log(value) + selector_log(value), selector_log(value).splitlines()[0],
                    'MOUNTED_BROWSER_SELECTORS={invalid}\noperations-obligation-mounted-browser-bootstrap SETUP PASS'):
            with self.assertRaises(module.ClosedFailure):
                module.selectors(bad)

    def test_failed_browser_diagnostic_is_only_verified_prefix_and_fixed_next_case(self):
        values = proof('enabled')[:4]
        label = module.failed_browser_phase('\n'.join(map(json.dumps, values)), 'enabled')
        self.assertIn('accepted_prefix=4', label)
        self.assertTrue(label.endswith(module.CASES['enabled'][4]))
        for raw in ('PRIVATE_SECRET', '{"case":"PRIVATE_PERSON","result":"PASS"}',
                    json.dumps({'case': module.CASES['enabled'][0], 'result': 'PASS', 'invoice': 'PRIVATE_BODY'})):
            self.assertEqual(module.failed_browser_phase(raw, 'enabled'), 'actual_mounted_browser_enabled; accepted_prefix=unclassified')

    def test_build_settings_independent_gates_no_secrets_or_other_cost_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'src').mkdir()
            (root / 'src/App.tsx').write_text('import.meta.env.VITE_OPERATIONS_CATERING_EVIDENCE_ENABLED; import.meta.env.VITE_OTHER_SERVER;')
            (root / '.env').write_text('VITE_PROVIDER_SECRET=synthetic\nVITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED=true\n')
            incoming = dict(valid_env(), PROJECT_EVIDENCE_JWT_SECRET='synthetic', GITHUB_TOKEN='synthetic',
                            PATH='safe-local-path')
            for mode in module.CASES:
                actual = module.build_environment(root, incoming, mode)
                self.assertNotIn('PROJECT_EVIDENCE_JWT_SECRET', actual)
                self.assertNotIn('GITHUB_TOKEN', actual)
                self.assertEqual(actual['VITE_OPERATIONS_CATERING_EVIDENCE_ENABLED'], '')
                self.assertEqual(actual['VITE_PROVIDER_SECRET'], '')
                self.assertEqual(actual['VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED'], 'false' if mode == 'disabled' else 'true')
                self.assertEqual(actual['VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED'], 'true' if mode == 'enabled' else 'false')
                self.assertEqual(actual['PATH'], 'safe-local-path')

    def test_missing_or_redirected_candidate_paths_fail_before_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(module.ClosedFailure):
                module.paths(Path(directory))
            alias = Path(directory) / 'alias'
            alias.symlink_to(Path(directory), target_is_directory=True)
            with self.assertRaises(module.ClosedFailure):
                module.paths(alias)

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
