"""Owned disposable native PostgreSQL/PostgREST proof; private output never printed."""
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'eventflow_scope_invoice_kernel_ci'
CASES = [
    'real_default_fetch_loader_parser_frozen_projection_541000_partial',
    'exact_source_free_request_and_captured_session', 'caller_organization_rejected',
    'caller_source_selector_rejected', 'nonstring_identity_rejected',
    'foreign_actual_project_denied', 'displayed_token_conflict_and_actual_loader_discard',
    'signed_missing_actor_denied', 'anonymous_denied', 'service_role_app_boundary_denied',
    'genuine_wrong_signature_denied', 'same_jwt_changed_view_actor_discards_actual_reply',
    'final_current_capture_unchanged', 'actual_dedicated_db_and_full_seed_state_fingerprint_unchanged',
]


def require(value, message):
    if not value:
        raise RuntimeError(message)


def isolated(env):
    require(env.get('CI') == 'true' and env.get('EVENTFLOW_SCOPE_INVOICE_KERNEL_ISOLATED_DB') == 'true', 'Explicit isolated CI flags required')
    require(env.get('PGHOST') == '127.0.0.1' and env.get('PGPORT') == '5432' and env.get('PGDATABASE') == DATABASE and env.get('PGUSER') == 'postgres' and env.get('PGPASSWORD') == 'synthetic-test-only', 'Exact disposable native database required')
    require(not any(env.get(k) for k in ('PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS')), 'Alternate libpq configuration denied')
    require(not any(value for key, value in env.items() if key.startswith(('DOCKER_', 'COMPOSE_'))), 'Alternate Docker configuration denied')
    run = env.get('GITHUB_RUN_ID', '')
    require(re.fullmatch(r'[0-9]{1,20}', run), 'Actual CI run identifier required')
    return dict(env, PGCONNECT_TIMEOUT='3'), 'scope-invoice-admin-http-' + run


def proof(output):
    expected = ['operations-scope-invoice-admin-http PASS ' + name for name in CASES]
    expected.append('operations-scope-invoice-admin-http PASS TOTAL 14')
    require(output.splitlines() == expected, 'Complete exact ordered signed HTTP proof required')


def private_command(args, env, timeout, phase, input=None):
    try:
        result = subprocess.run(args, cwd=ROOT, env=env, input=input, text=True, capture_output=True, timeout=timeout)
    except (subprocess.TimeoutExpired, OSError):
        raise RuntimeError('Bounded native command failed phase=' + phase) from None
    require(result.returncode == 0, 'Private native command failed phase=' + phase)
    return result.stdout


def main():
    env, name = isolated(os.environ)
    with socket.socket() as port:
        port.bind(('127.0.0.1', 55406))
    # No takeover: an existing named container is denied before any creation/removal.
    found = private_command(['docker', 'ps', '-a', '--format', '{{.Names}}'], env, 10, 'inventory')
    require(name not in found.splitlines(), 'Existing owned namespace denied')
    role_env = dict(env, PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=3000 -c eventflow.scope_invoice_kernel_isolated=synthetic-disposable')
    sql = (ROOT / 'scripts/project-economy/operations-scope-invoice-capture-admin-http-role.sql').read_text()
    role = private_command(['psql', '-X', '--no-password', '-qAt', '-v', 'ON_ERROR_STOP=1'], role_env, 30, 'role', sql)
    require('operations-scope-invoice-capture-admin-http-role PASS' in role, 'Complete guarded native role required')
    selector = "SELECT c.snapshot_id::text FROM public.operations_scope_invoice_kernel_native_fixture f JOIN public.operations_scope_obligation_composition_heads h ON h.organization_id=(f.read_request->>'organization_id')::uuid AND h.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid JOIN public.operations_scope_obligation_compositions c ON c.organization_id=h.organization_id AND c.economic_scope_id=h.economic_scope_id AND c.composition_revision=h.current_revision WHERE f.slot='only' AND c.composition_revision=(f.read_request->>'expected_composition_revision')::bigint AND c.fingerprint=f.read_request->>'expected_composition_fingerprint' AND c.scope_revision=(f.read_request->>'expected_scope_revision')::bigint AND c.membership_fingerprint=f.read_request->>'expected_membership_fingerprint';"
    token = private_command(['psql', '-X', '--no-password', '-qAt', '-v', 'ON_ERROR_STOP=1'], role_env, 15, 'selector', selector).strip()
    require(re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', token), 'Single actual immutable composition token required')
    secret = secrets.token_hex(32)
    created = False
    with tempfile.TemporaryDirectory(prefix='scope-admin-http-') as directory:
        os.chmod(directory, 0o700)
        config = Path(directory) / 'postgrest.env'
        config.write_text('PGRST_DB_URI=postgres://scope_invoice_admin_http_authenticator:synthetic-scope-invoice-http-only@127.0.0.1:5432/' + DATABASE + '\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=' + secret + '\nPGRST_DB_CONFIG=false\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT=55406\n')
        config.chmod(0o600)
        try:
            private_command(['docker', 'create', '--name', name, '--network', 'host', '--env-file', str(config), 'postgrest/postgrest:v12.2.3'], env, 60, 'create')
            created = True
            private_command(['docker', 'start', name], env, 15, 'start')
            deadline = time.monotonic() + 30
            while True:
                try:
                    with urllib.request.urlopen('http://127.0.0.1:55406/', timeout=2) as response:
                        require(response.status == 200, 'Dedicated server health required')
                    break
                except OSError:
                    require(time.monotonic() < deadline, 'Dedicated server startup deadline')
                    time.sleep(0.1)
            child = dict(env, EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_ISOLATED='true', EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_BASE_URL='http://127.0.0.1:55406/', EVENTFLOW_SCOPE_INVOICE_ADMIN_HTTP_JWT_SECRET=secret, EVENTFLOW_SCOPE_INVOICE_ADMIN_COMPOSITION_SNAPSHOT_ID=token)
            output = private_command(['deno', 'run', '--unstable-sloppy-imports', '--allow-env', '--allow-net=127.0.0.1:55406', 'scripts/project-economy/operations-scope-invoice-capture-admin-http-journey.ts'], child, 240, 'signed_http')
            proof(output)
            print('PASS actual native PostgreSQL and PostgREST12.2.3 signed scope admin HTTP all14; no hosted activation')
        finally:
            if created:
                private_command(['docker', 'rm', '-f', name], env, 15, 'owned_cleanup')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        # Only fixed local phase/guard messages; raw subprocess/HTTP bodies never escape.
        raise SystemExit(str(error)) from None
    except OSError:
        raise SystemExit('Native scope admin HTTP OS failure; no acceptance') from None
