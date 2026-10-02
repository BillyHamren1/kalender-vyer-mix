"""Bounded private SQL capture for disposable native CI, never hosted data."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
if os.environ.get('CI') != 'true' or os.environ.get('PGHOST') not in {'127.0.0.1', 'localhost'} or os.environ.get('PGPORT') != '5432' or os.environ.get('PGUSER') != 'postgres':
    raise SystemExit('Explicit disposable native CI database required')
if any(os.environ.get(k) for k in ('PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS')):
    raise SystemExit('Alternate libpq destinations and options denied')
if len(sys.argv) != 3 or sys.argv[1] not in {'vectors', 'drilldown', 'seed'}:
    raise SystemExit('Exact native fixture mode and fixture file required')
mode = sys.argv[1]
database = os.environ.get('PGDATABASE')
if database not in {'operations_economy_test', 'eventflow_scope_invoice_kernel_ci'} or (mode == 'seed' and database != 'eventflow_scope_invoice_kernel_ci'):
    raise SystemExit('Dedicated native fixture database required')
fixture = Path(sys.argv[2]).read_text().strip()
json.loads(fixture)
filenames = {
    'vectors': 'operations-scope-invoice-kernel-postgres-test.sql',
    'drilldown': 'operations-scope-obligation-drilldown-postgres-test.sql',
    'seed': 'operations-scope-invoice-kernel-native-setup.sql',
}
source = (root / 'scripts/project-economy' / filenames[mode]).read_text()
if mode == 'vectors':
    selector = 'select label,evidence::text as evidence from scope_invoice_vectors order by label;'
    if source.count(selector) != 1:
        raise SystemExit('Exact reviewed native response selector required')
    source = source.replace(selector, "select jsonb_agg(jsonb_build_object('label',label,'evidence',evidence::text) order by label)::text from scope_invoice_vectors;")
env = dict(os.environ, PGCONNECT_TIMEOUT='5', PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=10000')
if mode == 'seed':
    env['PGOPTIONS'] += ' -c eventflow.scope_invoice_kernel_isolated=synthetic-disposable'
try:
    result = subprocess.run(['psql', '-X', '--no-password', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'fixture=' + fixture], input=source, text=True, capture_output=True, timeout=180, env=env)
except subprocess.TimeoutExpired:
    raise SystemExit('Bounded native fixture SQL timed out; no acceptance')
if result.returncode:
    raise SystemExit('Native ' + mode + ' SQL assertions failed; private output withheld')
if mode == 'vectors':
    rows = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('[{')]
    if len(rows) != 1 or len(rows[0]) != 5 or 'operations-scope-invoice-kernel-postgres PASS' not in result.stdout:
        raise SystemExit('All five original native response strings required')
    with tempfile.TemporaryDirectory(prefix='scope-native-vectors-') as directory:
        path = Path(directory) / 'vectors.json'
        path.write_text(json.dumps(rows[0]))
        path.chmod(0o600)
        subprocess.run(['deno', 'run', '--allow-read', str(root / 'scripts/project-economy/operations-scope-invoice-kernel-vector-test.ts'), str(path)], check=True, timeout=60)
elif mode == 'drilldown' and 'operations-scope-obligation-drilldown-postgres PASS' not in result.stdout:
    raise SystemExit('Complete native drilldown fixture required')
print('PASS actual native ' + mode + ' SQL fixture; no hosted activation')
