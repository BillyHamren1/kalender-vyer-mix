"""Fresh owned Docker/PostgREST + genuine App builds; never reuse HTTP18's revoked actor.

Run in a separate CI job/daemon. The unchanged controller owns the established
project-evidence-http-${GITHUB_RUN_ID} namespace; preexisting labels are refused.
Only this runner's processes, temporary output and exact compose project are cleaned.
"""
import json
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

DATABASE = 'eventflow_project_evidence_http_runtime'
RELATIVE = 'scripts/project-economy/project-evidence-http-runtime'
ROOT = Path(__file__).absolute().parents[2]
SCRIPT = 'scripts/project-economy/operations-obligation-mounted-browser.mjs'
BOOTSTRAP = 'scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql'
SCOPE = 'actual product route browser with native signed fixture JWT/PostgREST; received evidence only'
COMMON = 'actual route journey sends no financial writes and preserves saved evidence'
CASES = {
    'disabled': ('mounted default-off gates make no economic evidence request', COMMON),
    'scope_only': ('actual mounted route reads genuine saved manual scope',
                   'independent leaf gate hides controls and never reads invoice details', COMMON),
    'enabled': ('actual mounted route reads genuine saved manual scope',
                'displayed saved row opens genuine copied invoice without changing legacy total',
                'actual App persistence excludes loaded protected scope and leaf',
                'collapse removes selected saved details',
                'unknown actual invoice source remains unavailable rather than zero',
                'live native scope poll clears selection and requires reopening',
                'live profile organization change denies real API and hides copied private money',
                'foreign actual actor never mounts another tenant evidence',
                'actual project user cannot elevate the mounted scope to administrator',
                'native admin role revocation denies fresh mounted scope read', COMMON),
}
FIXED = {'PROJECT_EVIDENCE_DATABASE_NAME': DATABASE,
         'PROJECT_EVIDENCE_POSTGREST_URL': 'http://127.0.0.1:55610/',
         'PROJECT_EVIDENCE_CONTROL_URL': 'http://127.0.0.1:55611/'}
WRITE_KINDS = ('auth_post', 'rpc_post', 'function_post', 'rest_write',
               'browser_origin_write', 'foreign_write', 'other_source_write')
FORWARD_STAGES = ('headers', 'authorization', 'rpc_shape', 'native_fetch', 'native_body', 'native_fulfill')
READ_KINDS = ('profiles', 'user_roles', 'projects', 'bookings', 'large_projects',
              'project_budget', 'project_purchases', 'project_labor_costs',
              'project_staff_time_cost_lines', 'product_cost_overrides', 'project_billing',
              'project_tasks', 'project_files', 'project_activity_log',
              'scope', 'leaf', 'unknown_leaf', 'preflight')


class ClosedFailure(RuntimeError):
    """Only an audited local phase, never raw subprocess/HTTP/SQL/body diagnostics."""
    def __init__(self, phase, retain_private=False):
        self.retain_private = retain_private
        super().__init__(phase)


def require(value, phase):
    if not value:
        raise ClosedFailure(phase)


def isolated(env):
    require(env.get('CI') == 'true' and env.get('ISOLATED_PROJECT_EVIDENCE_HTTP') == 'true'
            and env.get('ISOLATED_OPERATIONS_OBLIGATION_MOUNTED_BROWSER') == 'true', 'explicit_isolated_ci')
    require(env.get('GITHUB_REPOSITORY') == 'BillyHamren1/kalender-vyer-mix', 'canonical_repository')
    run = env.get('GITHUB_RUN_ID', '')
    require(isinstance(run, str) and re.fullmatch(r'[0-9]{1,20}', run), 'canonical_run')
    require(isinstance(env.get('GITHUB_SHA'), str) and re.fullmatch(r'[a-f0-9]{40}', env['GITHUB_SHA']), 'canonical_candidate')
    for key, value in env.items():
        if not value:
            continue
        require(not key.startswith(('DOCKER_', 'COMPOSE_', 'PG', 'SUPABASE_', 'OPERATIONS_MOUNTED_', 'VITE_'))
                and key not in ('DATABASE_URL', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_USE_ENV_PROXY', 'BUN_OPTIONS',
                                    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy',
                                    'TMPDIR', 'TMP', 'TEMP'), 'foreign_runtime_override')
        if key.startswith('PROJECT_EVIDENCE_'):
            require(key in FIXED and value == FIXED[key], 'foreign_fixture_override')
    return 'project-evidence-http-' + run


def paths(root):
    require(root.is_absolute() and root.resolve() == root, 'canonical_root_path')
    runtime = root / RELATIVE
    for name in ('compose.yml', 'control.ts', 'isolation.py', 'verify-sources.py',
                 'schema-closure.json', 'source-manifest.json', 'proof.py', 'postgrest-role.sql'):
        target = runtime / name
        require(target.is_file() and target.resolve() == target, 'canonical_runtime_paths')
    for name in (SCRIPT, BOOTSTRAP, 'package.json', 'index.html', 'vite.config.ts', 'src/App.tsx',
                 'src/components/project/OperationsScopeObligationEvidencePanel.tsx',
                 'src/components/project/OperationsObligationDrilldownPanel.tsx'):
        target = root / name
        require(target.is_file() and target.resolve() == target, 'canonical_app_paths')
    return runtime


def proof(raw, mode):
    require(mode in CASES and isinstance(raw, str) and len(raw.encode()) <= 16384, 'bounded_browser_proof')
    try:
        values = [json.loads(row) for row in raw.splitlines()]
    except (ValueError, TypeError):
        raise ClosedFailure('browser_proof_json') from None
    expected = [{'case': case, 'result': 'PASS'} for case in CASES[mode]]
    expected.append({'result': 'PASS', 'cases': len(CASES[mode]), 'gateMode': mode, 'scope': SCOPE})
    require(values == expected, 'complete_ordered_browser_proof')
    return values


def failed_browser_phase(raw, mode, diagnostic_raw=''):
    """Only an exact accepted prefix count/fixed next label; never print raw errors."""
    try:
        require(len(raw.encode()) <= 16384, 'bounded_failure_prefix')
        values = [json.loads(line) for line in raw.splitlines()]
        require(len(values) <= len(CASES[mode]), 'bounded_failure_prefix')
        require(values == [{'case': case, 'result': 'PASS'} for case in CASES[mode][:len(values)]],
                'exact_failure_prefix')
        next_case = CASES[mode][len(values)] if len(values) < len(CASES[mode]) else 'terminal completion'
        label = 'actual_mounted_browser_' + mode + '; accepted_prefix=' + str(len(values)) + '; next=' + next_case
        if not diagnostic_raw:
            return label
        try:
            require(len(diagnostic_raw.encode()) <= 8192, 'bounded_failure_diagnostic')
            diagnostic = json.loads(diagnostic_raw)
            require(isinstance(diagnostic, dict) and set(diagnostic) ==
                    {'result', 'case', 'reason', 'boundary', 'writeCounts', 'forwardCounts', 'forwardKinds'}, 'exact_failure_diagnostic')
            require(diagnostic['result'] == 'FAIL' and diagnostic['reason'] == 'mounted browser proof failed'
                    and diagnostic['case'] in (*CASES[mode], 'isolated mounted guard')
                    and diagnostic['boundary'] in ('unknown', 'writes', 'forward', 'evidence_state'), 'fixed_failure_diagnostic')
            for field, keys in (('writeCounts', WRITE_KINDS), ('forwardCounts', FORWARD_STAGES), ('forwardKinds', READ_KINDS)):
                counts = diagnostic[field]
                require(isinstance(counts, dict) and set(counts) == set(keys)
                        and all(type(counts[key]) is int and 0 <= counts[key] <= 1000 for key in keys), 'fixed_diagnostic_counts')
            label += '; boundary=' + diagnostic['boundary']
            for field, keys in (('writeCounts', WRITE_KINDS), ('forwardCounts', FORWARD_STAGES), ('forwardKinds', READ_KINDS)):
                entries = [key + ':' + str(diagnostic[field][key]) for key in keys if diagnostic[field][key]]
                label += '; ' + field + '=' + (','.join(entries) if entries else 'none')
            return label
        except Exception:
            return label + '; boundary=unclassified'
    except Exception:
        return 'actual_mounted_browser_' + mode + '; accepted_prefix=unclassified'


def selectors(raw):
    prefix = 'MOUNTED_BROWSER_SELECTORS='
    require(isinstance(raw, str) and len(raw.encode()) <= 1048576, 'bounded_selector_output')
    rows = [line.strip()[len(prefix):] for line in raw.splitlines() if line.strip().startswith(prefix)]
    require(len(rows) == 1 and len(rows[0].encode()) < 16384
            and 'operations-obligation-mounted-browser-bootstrap SETUP PASS' in raw, 'complete_guarded_browser_fixture')
    try:
        value = json.loads(rows[0])
    except ValueError:
        raise ClosedFailure('fixture_selector_json') from None
    expected = {'schema', 'organizationId', 'actorId', 'projectId', 'compositionSnapshotId',
                'baselineEventId', 'obligationId', 'unknownBaselineEventId', 'unknownObligationId',
                'baselineRowIndex', 'unknownBaselineRowIndex'}
    require(isinstance(value, dict) and set(value) == expected, 'exact_fixture_selector_keys')
    ident = lambda n: '00000000-0000-4000-8000-' + str(n).zfill(12)
    require(value['schema'] == 'operations-obligation-mounted-browser-selectors.v1'
            and value['organizationId'] == ident(1) and value['actorId'] == ident(199)
            and value['projectId'] == ident(1017) and value['obligationId'] == ident(1018)
            and value['unknownObligationId'] == ident(1028), 'actual_fixture_identity')
    require(all(isinstance(value[k], str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value[k])
                for k in ('compositionSnapshotId', 'baselineEventId', 'unknownBaselineEventId'))
            and value['baselineEventId'] != value['unknownBaselineEventId'], 'actual_saved_selector_ids')
    require(type(value['baselineRowIndex']) is int and type(value['unknownBaselineRowIndex']) is int
            and {value['baselineRowIndex'], value['unknownBaselineRowIndex']} == {1, 2}, 'actual_saved_row_order')
    return json.dumps(value, separators=(',', ':'))


def live_owned_group(group_id):
    """Revalidate the created group AND session with kernel syscalls, not proc alone."""
    live = []
    entries = {p.name for p in Path('/proc').iterdir() if p.name.isdecimal()}
    entries.add(str(group_id))
    for name in entries:
        pid = int(name)
        try:
            if os.getpgid(pid) != group_id or os.getsid(pid) != group_id:
                continue
            fields = (Path('/proc') / name / 'stat').read_text().rsplit(')', 1)[1].split()
            terminal = int(fields[2]) == group_id and int(fields[3]) == group_id and fields[0] in {'Z', 'X'}
            if not terminal:
                live.append(pid)
        except (FileNotFoundError, ProcessLookupError):
            continue
    return live


def signal_owned(group_id, requested):
    for pid in live_owned_group(group_id):
        try:
            if os.getpgid(pid) == group_id and os.getsid(pid) == group_id:
                os.kill(pid, requested)
        except ProcessLookupError:
            pass


def terminate_owned(child, phase):
    if child is None:
        return
    group_id = child.pid
    if child.poll() is not None and not live_owned_group(group_id):
        return
    signal_owned(group_id, signal.SIGTERM)
    if child.poll() is None:
        child.terminate()
    try:
        child.communicate(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    # Leader exit is not descendant cleanup. Kill TERM-ignoring members too.
    signal_owned(group_id, signal.SIGKILL)
    if child.poll() is None:
        child.kill()
    deadline = time.monotonic() + 3
    while live_owned_group(group_id):
        if time.monotonic() >= deadline:
            raise ClosedFailure(phase, retain_private=True)
        signal_owned(group_id, signal.SIGKILL)
        time.sleep(0.02)
    try:
        child.communicate(timeout=3)
    except subprocess.TimeoutExpired:
        raise ClosedFailure(phase, retain_private=True) from None


def stop(child, phase):
    try:
        terminate_owned(child, phase)
    except ClosedFailure:
        raise
    except Exception:
        raise ClosedFailure(phase, retain_private=True) from None


def restrict_child():
    # Logs cannot grow without bound. This also bounds individual generated files.
    resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))


def private_file(path, text=False):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    return os.fdopen(fd, 'w' if text else 'wb')


def command(args, env, phase, timeout=30, data=None):
    child = None
    directory = Path(tempfile.mkdtemp(prefix='operations-mounted-command-', dir='/tmp'))
    directory.chmod(0o700)
    retain_private = False
    try:
        out, err = directory / 'stdout', directory / 'stderr'
        with private_file(out) as stdout, private_file(err) as stderr:
            child = subprocess.Popen(args, cwd=ROOT, env=env, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, start_new_session=True, preexec_fn=restrict_child)
            try:
                child.communicate(data.encode() if data is not None else None, timeout=timeout)
            except subprocess.TimeoutExpired:
                raise ClosedFailure(phase) from None
        require(out.stat().st_size <= 4194304 and err.stat().st_size <= 4194304, phase)
        if child.returncode != 0:
            mode = next((mode for mode in CASES if phase == 'actual_mounted_browser_' + mode), None)
            label = failed_browser_phase(out.read_text(), mode, err.read_text()) if mode is not None else phase
            raise ClosedFailure(label)
        return out.read_text()
    except (OSError, ValueError):
        raise ClosedFailure(phase) from None
    finally:
        try:
            stop(child, 'owned_command_cleanup')
        except ClosedFailure:
            retain_private = True
            raise
        finally:
            # Never delete a file while a failed owned cleanup can still write it.
            if not retain_private:
                shutil.rmtree(directory)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ClosedFailure('health_redirect_denied')


def healthy(url, phase, child=None, token=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        require(child is None or child.poll() is None, phase)
        try:
            req = urllib.request.Request(url, headers={'x-project-evidence-control-token': token} if token else {})
            with opener.open(req, timeout=1) as response:
                require(response.status == 200, phase)
                if token:
                    body = response.read(8193)
                    require(len(body) <= 8192 and json.loads(body)['databaseName'] == DATABASE, phase)
                return
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)
    raise ClosedFailure(phase)


def build_environment(root, env, mode):
    """Neutralize all candidate VITE settings; activate only the two audited gates."""
    result = {k: v for k, v in env.items() if not k.startswith(('PROJECT_EVIDENCE_', 'OPERATIONS_MOUNTED_', 'VITE_'))
              and not k.endswith(('_TOKEN', '_SECRET', '_PASSWORD'))}
    names = set()
    # Source bytes are already the clean candidate, not a main/Lovable substitute.
    for file in (root / 'src').rglob('*'):
        if file.is_file() and file.suffix in ('.ts', '.tsx', '.js', '.jsx'):
            names.update(re.findall(r'\bVITE_[A-Z0-9_]+\b', file.read_text()))
    for file in root.glob('.env*'):
        require(file.is_file() and file.resolve() == file, 'redirected_build_settings')
        names.update(re.findall(r'(?m)^\s*(VITE_[A-Z0-9_]+)\s*=', file.read_text()))
    result.update({name: '' for name in names})
    result.update({'NODE_ENV': 'production',
                   'VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED': 'false' if mode == 'disabled' else 'true',
                   'VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED': 'true' if mode == 'enabled' else 'false'})
    return result


def main():
    env = dict(os.environ)
    namespace = isolated(env)
    runtime = paths(ROOT)
    # The root-owned exact source manifest and clean candidate are checked before Docker.
    head = command(['git', 'rev-parse', 'HEAD'], env, 'candidate_sha').strip()
    require(head == env['GITHUB_SHA'], 'candidate_sha_match')
    require(command(['git', 'status', '--porcelain', '--untracked-files=normal'], env, 'candidate_clean') == '', 'candidate_clean')
    command([sys.executable, str(runtime / 'verify-sources.py')], env, 'canonical21_source_bytes')
    closure = json.loads((runtime / 'schema-closure.json').read_text())['ordered_paths']
    require(len(closure) == 21 and len(set(closure)) == 21, 'canonical21_order')
    require(command(['node', '--version'], env, 'node_version').startswith('v24.'), 'node24')
    require(command(['deno', '--version'], env, 'deno_version').splitlines()[0].startswith('deno 2.8.1 '), 'deno281')
    require(command(['node', '-e', "console.log(require('@playwright/test/package.json').version)"], env, 'playwright_version').strip() == '1.55.0', 'playwright155')
    require(command(['docker', 'context', 'show'], env, 'local_docker_context').strip() == 'default', 'local_default_docker_context')
    require(command(['docker', 'context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}'], env, 'local_docker_endpoint').strip() == 'unix:///var/run/docker.sock', 'local_docker_socket')
    compose = ['docker', 'compose', '--project-directory', str(runtime), '-p', namespace, '-f', str(runtime / 'compose.yml')]
    label = 'label=com.docker.compose.project=' + namespace
    require(not command(['docker', 'ps', '--all', '--quiet', '--filter', label], env, 'owned_container_inventory').strip()
            and not command(['docker', 'volume', 'ls', '--quiet', '--filter', label], env, 'owned_volume_inventory').strip(), 'preexisting_namespace_denied')
    for port in (55610, 55611, 55612):
        with socket.socket() as check:
            check.bind(('127.0.0.1', port))
    created = False
    controller = preview = None
    accepted = {}
    private = Path(tempfile.mkdtemp(prefix='operations-mounted-native-', dir='/tmp'))
    private.chmod(0o700)
    retain_private = False
    try:
        controller_log = private_file(private / 'controller.log', text=True)
        preview_log = private_file(private / 'preview.log', text=True)
        jwt, token = secrets.token_hex(32), secrets.token_hex(32)
        child_env = dict(env, **FIXED, PROJECT_EVIDENCE_JWT_SECRET=jwt, PROJECT_EVIDENCE_CONTROL_TOKEN=token,
                         PROJECT_EVIDENCE_COMPOSE_NAMESPACE=namespace, PROJECT_EVIDENCE_COMPOSE_PATH=str(runtime / 'compose.yml'))
        def sql(text, phase):
            return command(compose + ['exec', '-T', '-e', 'PGOPTIONS=-c statement_timeout=30000 -c lock_timeout=10000 -c test.project_evidence_fixture=true',
                                      'database', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', DATABASE,
                                      '-v', 'ON_ERROR_STOP=1'], child_env, phase, 90, text)
        try:
            created = True  # Also clean a partially-created owned stack if `up` fails.
            command(compose + ['up', '-d', '--wait', 'database'], child_env, 'owned_database_start', 120)
            sql("do $$begin if current_database()<>'" + DATABASE + "' or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth')) or exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')) then raise exception 'fresh_owned_cluster_required' using errcode='55000';end if;end;$$;", 'fresh_before_any_ddl')
            for relative in closure:
                sql((ROOT / relative).read_text(), 'canonical_selected_ddl')
            sql("do $$begin if (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3 or (select count(*) from public.projects)<>3 or (select count(*) from public.bookings)<>1 or (select count(*) from public.large_projects)<>1 or (select count(*) from public.packing_projects)<>1 or (select count(*) from public.large_project_bookings)<>1 or (select count(*) from public.packing_project_bookings)<>1 then raise exception 'exact_canonical_seed_required' using errcode='55000';end if;end;$$;", 'canonical_seed_counts')
            fixture = command(['deno', 'run', '--cached-only', 'scripts/project-economy/operations-obligation-fixture.ts'], child_env, 'actual_fixture_generator')
            # psql variable substitutions use its own quoted :'fixture', never a shell.
            def fixture_sql(relative, phase):
                return command(compose + ['exec', '-T', '-e', 'PGOPTIONS=-c statement_timeout=30000 -c lock_timeout=10000 -c test.project_evidence_fixture=true',
                                          'database', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', DATABASE,
                                          '-v', 'ON_ERROR_STOP=1', '-v', 'fixture=' + fixture.strip()], child_env, phase, 90, (ROOT / relative).read_text())
            require('project-evidence-http-fixture SETUP PASS' in fixture_sql('scripts/project-economy/operations-project-evidence-http-fixture.sql', 'original_fixture'), 'actual_original_fixture')
            sql((runtime / 'postgrest-role.sql').read_text(), 'rest_role')
            command(compose + ['up', '-d', 'rest', 'gateway'], child_env, 'rest_gateway_start', 90)
            healthy(FIXED['PROJECT_EVIDENCE_POSTGREST_URL'], 'native_rest_health')
            controller = subprocess.Popen(['deno', 'run', '--cached-only', '--allow-env', '--allow-run=docker', '--allow-net=127.0.0.1:55611', str(runtime / 'control.ts')], cwd=ROOT, env=child_env,
                                          stdout=controller_log, stderr=controller_log, start_new_session=True, preexec_fn=restrict_child)
            healthy(FIXED['PROJECT_EVIDENCE_CONTROL_URL'] + 'state', 'fixed_controller_health', controller, token)
            old_proof = command(['deno', 'run', '--unstable-sloppy-imports', '--cached-only', '--allow-env', '--allow-net=127.0.0.1:55610,127.0.0.1:55611',
                                 'scripts/project-economy/operations-project-evidence-http-journey.ts'], child_env, 'genuine_original15_journey', 240)
            original = private / 'original15.jsonl'
            with private_file(original, text=True) as output_file:
                output_file.write(old_proof)
            command([sys.executable, str(runtime / 'proof.py'), str(original)], child_env, 'complete_original15_proof')
            # Seed the extension only; its HTTP18 end deliberately revokes actor199.
            require('operations-obligation-drilldown-http-fixture SETUP PASS' in fixture_sql('scripts/project-economy/operations-obligation-drilldown-http-fixture.sql', 'drilldown_fixture_only'), 'actual_drilldown_fixture')
            saved = selectors(fixture_sql(BOOTSTRAP, 'guarded_mounted_ui_fixture'))
            command(compose + ['restart', 'rest'], child_env, 'actual_ui_schema_cache_restart', 30)
            healthy(FIXED['PROJECT_EVIDENCE_POSTGREST_URL'], 'native_ui_schema_health')
            require(sql('select current_setting(\'server_version_num\');', 'postgres_version').strip() == '150019', 'postgres1519')
            require(re.search(r'\b12\.2\.3\b', command(compose + ['exec', '-T', 'rest', '/bin/postgrest', '--version'], child_env, 'postgrest_version')), 'postgrest1223')
            vite = ROOT / 'node_modules/vite/bin/vite.js'
            require(vite.is_file(), 'candidate_vite_dependency')
            for mode in CASES:
                build_env = build_environment(ROOT, child_env, mode)
                output = private / mode
                command(['node', str(vite), 'build', '--mode', 'production', '--outDir', str(output), '--emptyOutDir'], build_env, 'candidate_build_' + mode, 600)
                require((output / 'index.html').is_file(), 'actual_built_app_' + mode)
                preview = subprocess.Popen(['node', str(vite), 'preview', '--outDir', str(output), '--host', '127.0.0.1', '--port', '55612', '--strictPort'], cwd=ROOT, env=build_env,
                                           stdout=preview_log, stderr=preview_log, start_new_session=True, preexec_fn=restrict_child)
                healthy('http://127.0.0.1:55612/', 'candidate_preview_' + mode, preview)
                journey_env = dict(child_env, OPERATIONS_MOUNTED_BROWSER_URL='http://127.0.0.1:55612/',
                                   OPERATIONS_MOUNTED_BROWSER_GATE_MODE=mode, OPERATIONS_MOUNTED_BROWSER_SELECTORS=saved)
                accepted[mode] = proof(command(['node', str(ROOT / SCRIPT)], journey_env, 'actual_mounted_browser_' + mode, 300), mode)
                stop(preview, 'owned_preview_cleanup')
                preview = None
            require(command(['git', 'rev-parse', 'HEAD'], env, 'final_candidate_sha').strip() == head
                    and command(['git', 'status', '--porcelain', '--untracked-files=normal'], env, 'final_candidate_clean') == '', 'same_exact_candidate_after_builds')
        finally:
            # The two owned process groups are bounded; other servers are never killed.
            try:
                stop(preview, 'owned_preview_cleanup')
            finally:
                try:
                    stop(controller, 'owned_controller_cleanup')
                finally:
                    controller_log.close()
                    preview_log.close()
                    if created:
                        try:
                            command(compose + ['down', '--volumes', '--remove-orphans'], child_env, 'owned_stack_cleanup', 40)
                            require(not command(['docker', 'ps', '--all', '--quiet', '--filter', label], env, 'cleanup_container_inventory').strip()
                                    and not command(['docker', 'volume', 'ls', '--quiet', '--filter', label], env, 'cleanup_volume_inventory').strip(), 'owned_stack_cleanup_complete')
                        except ClosedFailure as failure:
                            raise ClosedFailure(str(failure), retain_private=True) from None
    except ClosedFailure as failure:
        retain_private = failure.retain_private
        raise
    finally:
        if not retain_private:
            shutil.rmtree(private)
    require(set(accepted) == set(CASES), 'all_three_mounted_builds')
    print('operations-obligation-mounted-browser-native PASS candidate ' + head)
    print('operations-obligation-mounted-browser-native PASS Pg15.19 PostgREST12.2.3 Deno2.8.1 Node24 Playwright1.55.0')
    print('operations-obligation-mounted-browser-native PASS original15 authenticated cases')
    for mode in CASES:
        for value in accepted[mode][:-1]:
            print(json.dumps({'mode': mode, **value}, separators=(',', ':')))
    print('operations-obligation-mounted-browser-native PASS TOTAL disabled2 scope_only3 enabled11')
    print('operations-obligation-mounted-browser-native PASS owned cleanup; synthetic JWT; received evidence only; no GoTrue/provider/hosted acceptance')


def interrupted(_signal, _frame):
    raise ClosedFailure('owned_interrupted')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except ClosedFailure as error:
        raise SystemExit('Mounted native proof rejected phase=' + str(error)) from None
    except Exception:
        raise SystemExit('Mounted native proof rejected phase=unexpected_private_failure') from None
