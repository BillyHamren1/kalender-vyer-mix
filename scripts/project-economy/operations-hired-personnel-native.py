#!/usr/bin/env python3
"""Native-only isolated hired fixture wrapper. Public output is a closed protocol."""
import json
import os
import pathlib
import re
import resource
import signal
import shutil
import subprocess
import sys
import tempfile
import time

EXPECTED = [
    'operations-hired-native PASS publisher_first_stale_assignment_lock',
    'operations-hired-native PASS permanent_owner_contender_lock',
    'operations-hired-native PASS assignment_first_withdrawal_lock_history',
    'operations-hired-native PASS actual_gate_revoke_lock_denial',
    'operations-hired-native PASS actual_project_revoke_lock_denial',
    'operations-hired-native PASS immutable_source_invoice_history_no_eac',
]
DATABASE = 'operations_hired_authority_runtime'
FIXED_ENV = {'CI': 'true', 'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB': 'true',
             'PGHOST': '127.0.0.1', 'PGPORT': '5432', 'PGUSER': 'postgres',
             'PGDATABASE': DATABASE}
ALLOWED_PG = {'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD'}
SCHEMA_PATHS = ('scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql')
PHASES = {'guard', 'paths', 'fresh_database', 'schema_closure', 'schema_sql', 'personnel_fixture', 'obligation_fixture', 'authority_sql',
          'native_fixture', 'native_setup', 'concurrency', 'proof'}

class ClosedFailure(Exception):
    def __init__(self, phase, code='unclassified', retain_private=False):
        self.retain_private = retain_private
        self.phase = phase if phase in PHASES else 'guard'
        self.code = code if re.fullmatch(r'[A-Z0-9]{5}', code) else 'unclassified'
        super().__init__('closed_native_failure')


def validate_environment(env):
    if any(env.get(k) != v for k, v in FIXED_ENV.items()):
        raise ClosedFailure('guard')
    if env.get('GITHUB_REPOSITORY') != 'BillyHamren1/kalender-vyer-mix':
        raise ClosedFailure('guard')
    if not re.fullmatch(r'[0-9]{1,20}', env.get('GITHUB_RUN_ID', '')):
        raise ClosedFailure('guard')
    for key, value in env.items():
        if not value:
            continue
        if (key.startswith('PG') and key not in ALLOWED_PG) or key.startswith(('SUPABASE_', 'PGRST_', 'COMPOSE_', 'DOCKER_')) or key in {'DATABASE_URL', 'DB_URL', 'TMPDIR', 'TMP', 'TEMP'}:
            raise ClosedFailure('guard')
        if key.startswith('EVENTFLOW_HIRED_PERSONNEL_') and key not in {'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB', 'EVENTFLOW_HIRED_PERSONNEL_DENO_BIN'}:
            raise ClosedFailure('guard')
    deno = env.get('EVENTFLOW_HIRED_PERSONNEL_DENO_BIN', 'deno')
    if deno != 'deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve() != pathlib.Path(deno) or not pathlib.Path(deno).is_file()):
        raise ClosedFailure('guard')
    return deno


def owned_paths():
    current = pathlib.Path(__file__).absolute()
    if current.resolve() != current:
        raise ClosedFailure('paths')
    directory = current.parent
    names = ['operations-fixture.ts', 'operations-obligation-fixture.ts',
             'operations-hired-personnel-authority-postgres-test.sql',
             'operations-hired-personnel-native-fixture.ts',
             'operations-hired-personnel-native-setup.sql',
             'operations-hired-personnel-native-concurrency.sh']
    paths = {name: directory / name for name in names}
    if directory.parts[-2:] != ('scripts', 'project-economy'):
        raise ClosedFailure('paths')
    for path in paths.values():
        if not path.is_file() or path.resolve() != path:
            raise ClosedFailure('paths')
    return directory.parent.parent, paths


def schema_paths(root, manifest):
    try:
        if not manifest.is_file() or manifest.resolve() != manifest:
            raise ValueError('owned_manifest_required')
        closure = json.loads(manifest.read_text(encoding='utf-8'))
        if set(closure) != {'schema', 'database', 'canonical_baseline_commit', 'ordered_paths'} or closure['schema'] != 'operations-project-evidence-http-schema-closure.v1' or closure['database'] != 'eventflow_project_evidence_http_runtime' or not re.fullmatch(r'[0-9a-f]{40}', closure['canonical_baseline_commit']) or closure['ordered_paths'] != list(SCHEMA_PATHS):
            raise ValueError('exact_21_source_closure_required')
        paths = [root / name for name in SCHEMA_PATHS]
        paths += [root / 'supabase/migrations/20261002061659_operations_hired_personnel_authority.sql', root / 'scripts/project-economy/operations-transport-seed.sql']
        for path in paths:
            if not path.is_file() or path.resolve() != path:
                raise ValueError('owned_ddl_required')
        return paths
    except (OSError, ValueError, TypeError, KeyError):
        raise ClosedFailure('schema_closure') from None


def restrict_child():
    resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))


def sqlstate(path):
    # Never report a message or context, even if adversarial output contains one.
    with path.open('rb') as source:
        data = source.read(8 * 1024 * 1024)
    match = re.search(rb'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):', data)
    return match.group(1).decode('ascii') if match else 'unclassified'


def live_owned_group(group_id):
    """Use kernel group/session syscalls; proc group fields can be virtualized."""
    live = []
    entries = {entry.name for entry in pathlib.Path('/proc').iterdir() if entry.name.isdecimal()}
    entries.add(str(group_id))
    for entry_name in entries:
        pid = int(entry_name)
        entry = pathlib.Path('/proc') / entry_name
        try:
            if os.getpgid(pid) != group_id or os.getsid(pid) != group_id:
                continue
            # comm may contain spaces/parentheses; split after its final ')'.
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            # A virtualized proc view can refer to different group/session data.
            # Only trust its terminal state when it agrees with both syscalls.
            terminal = int(fields[2]) == group_id and int(fields[3]) == group_id and fields[0] in {'Z', 'X'}
            if not terminal:
                live.append(pid)
        except (FileNotFoundError, ProcessLookupError):
            continue
    return live


def signal_owned_members(group_id, requested_signal):
    # Direct PID signals work even when a runtime virtualizes killpg semantics.
    # Every target is rechecked against our created session immediately first.
    for pid in live_owned_group(group_id):
        try:
            if os.getpgid(pid) == group_id and os.getsid(pid) == group_id:
                os.kill(pid, requested_signal)
        except ProcessLookupError:
            pass


def terminate_owned(child, phase):
    if child is None:
        return
    group_id = child.pid
    if child.poll() is not None and not live_owned_group(group_id):
        return
    signal_owned_members(group_id, signal.SIGTERM)
    if child.poll() is None:
        child.terminate()
    try:
        child.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    signal_owned_members(group_id, signal.SIGKILL)
    if child.poll() is None:
        child.kill()
    deadline = time.monotonic() + 5
    while live_owned_group(group_id):
        if time.monotonic() >= deadline:
            raise ClosedFailure(phase, retain_private=True)
        # Kill only newly observed members still in this same owned session.
        signal_owned_members(group_id, signal.SIGKILL)
        time.sleep(0.02)
    try:
        child.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        raise ClosedFailure(phase, retain_private=True) from None


def run_private(phase, command, env, cwd, directory, timeout, stdin=None):
    out = directory / (phase + '.stdout')
    err = directory / (phase + '.stderr')
    for path in (out, err):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
    child = None
    try:
        with out.open('wb') as stdout, err.open('wb') as stderr:
            child = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, start_new_session=True, preexec_fn=restrict_child)
            try:
                child.communicate(input=stdin, timeout=timeout)
            except subprocess.TimeoutExpired:
                terminate_owned(child, phase)
                raise ClosedFailure(phase) from None
        if child.returncode != 0:
            raise ClosedFailure(phase, sqlstate(err))
        if out.stat().st_size > 8 * 1024 * 1024:
            raise ClosedFailure(phase)
        return out
    except (OSError, ValueError):
        raise ClosedFailure(phase) from None
    finally:
        terminate_owned(child, phase)


def fixture_json(path, phase):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(value, dict):
            raise ValueError('object_required')
        return value
    except (OSError, UnicodeError, ValueError):
        raise ClosedFailure(phase) from None


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def fixture_prefix(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return ("set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='15s';\n"
            "select set_config('test.hired_personnel_isolated','synthetic-disposable',false);\n"
            "select set_config('test.hired_personnel_fixture'," + sql_literal(raw) + ",false);\n")


def validate_proof(path):
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeError):
        raise ClosedFailure('proof') from None
    if lines != EXPECTED:
        raise ClosedFailure('proof')
    return lines


def execute(env):
    deno = validate_environment(env)
    root, paths = owned_paths()
    ddl = schema_paths(root, root / 'scripts/project-economy/project-evidence-http-runtime/schema-closure.json')
    child_env = dict(env)
    child_env['PGCONNECT_TIMEOUT'] = '5'
    psql = ['psql', '-X', '--no-password', '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=verbose', '-Atq']
    private = pathlib.Path(tempfile.mkdtemp(prefix='operations-hired-native-', dir='/tmp'))
    retain_private = False
    try:
        private.chmod(0o700)
        fresh_sql = ("set statement_timeout='15s';select current_database()='operations_hired_authority_runtime' and current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) "
                     "and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') "
                     "and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'));\n")
        fresh = run_private('fresh_database', psql, child_env, root, private, 90, fresh_sql.encode('utf-8'))
        if fresh.read_text(encoding='utf-8').strip() != 't':
            raise ClosedFailure('fresh_database')
        ddl_sql = "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='15s';\n" + '\n'.join(path.read_text(encoding='utf-8') for path in ddl)
        run_private('schema_sql', psql, child_env, root, private, 90, ddl_sql.encode('utf-8'))
        personnel = run_private('personnel_fixture', [deno, 'run', str(paths['operations-fixture.ts'])], child_env, root, private, 90)
        obligation = run_private('obligation_fixture', [deno, 'run', str(paths['operations-obligation-fixture.ts'])], child_env, root, private, 90)
        initial = {'personnel': fixture_json(personnel, 'personnel_fixture'), 'obligation': fixture_json(obligation, 'obligation_fixture')}
        sql = fixture_prefix(initial) + paths['operations-hired-personnel-authority-postgres-test.sql'].read_text(encoding='utf-8')
        run_private('authority_sql', psql, child_env, root, private, 90, sql.encode('utf-8'))
        combined = run_private('native_fixture', [deno, 'run', '--allow-read=' + str(private), str(paths['operations-hired-personnel-native-fixture.ts']), str(personnel), str(obligation)], child_env, root, private, 90)
        prepared = fixture_json(combined, 'native_fixture')
        setup = paths['operations-hired-personnel-native-setup.sql'].read_text(encoding='utf-8')
        if setup.count(":'fixture'") != 1:
            raise ClosedFailure('native_setup')
        setup = setup.replace(":'fixture'", sql_literal(json.dumps(prepared, ensure_ascii=False, separators=(',', ':'), allow_nan=False)))
        run_private('native_setup', psql, child_env, root, private, 90, (fixture_prefix(prepared) + setup).encode('utf-8'))
        proof = run_private('concurrency', ['bash', str(paths['operations-hired-personnel-native-concurrency.sh'])], child_env, root, private, 120)
        lines = validate_proof(proof)
    except ClosedFailure as failure:
        retain_private = failure.retain_private
        raise
    finally:
        # Never delete logs while a failed owned termination can still write.
        if not retain_private:
            shutil.rmtree(private)
    for line in lines:
        print(line)


def interrupted(_signal, _frame):
    raise ClosedFailure('guard')


def main():
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        execute(os.environ)
    except ClosedFailure as failure:
        print(f'operations-hired-native FAIL phase={failure.phase} SQLSTATE={failure.code}', file=sys.stderr)
        return 1
    except Exception:
        print('operations-hired-native FAIL phase=guard SQLSTATE=unclassified', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
