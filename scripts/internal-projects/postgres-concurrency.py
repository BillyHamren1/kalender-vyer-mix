"""Real PostgreSQL locks/rollback; synthetic tenant/auth/schema, never hosted E2E.

Only the named disposable loopback database is accepted. No schema teardown, remote
DSNs, production secrets or external effects. Run once against an empty database.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import time
from urllib.parse import urlparse
from uuid import uuid4

import psycopg

DSN = os.environ['INTERNAL_PROJECTS_TEST_DSN']
parsed = urlparse(DSN)
if (parsed.scheme not in ('postgresql', 'postgres') or parsed.query or parsed.fragment
        or parsed.hostname not in ('127.0.0.1', 'localhost')
        or parsed.path != '/internal_projects_ci'):
    raise SystemExit('Only disposable loopback internal_projects_ci database is allowed')
ORG = '11111111-1111-4111-8111-111111111111'
ROOT = Path(__file__).resolve().parents[2]
admin = psycopg.connect(DSN, autocommit=True)
assert admin.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0] == 0, 'Database must be empty'
admin.execute((ROOT / 'scripts/internal-projects/postgres-fixture.sql').read_text())
for suffix in ('internal_project_classification.sql', 'atomic_internal_project_creation.sql', 'internal_project_metadata_outbox.sql'):
    matches = list((ROOT / 'supabase/migrations').glob('*' + suffix))
    assert len(matches) == 1, matches
    admin.execute(matches[0].read_text())
    print('APPLIED', matches[0].name)

REQUEST = dict(expected_actor_id=ORG, expected_organization_id=ORG,
               name='Isolated CI', project_leader='Synthetic actor', rigdaydate='2026-10-12',
               rigdowndate='2026-10-13', budget_cost_minor=200000, tasks=[dict(title='Count')])
CREATE = 'SELECT create_internal_project_atomic(%s,%s::jsonb)'

def session():
    conn = psycopg.connect(DSN, autocommit=True)
    conn.execute("SET statement_timeout='12s'")
    conn.execute('SET ROLE authenticated')
    conn.execute("SELECT set_config('test.actor',%s,false)", (ORG,))
    return conn


def scalar(sql, params=()):
    return admin.execute(sql, params).fetchone()[0]


def receipts(pid):
    return admin.execute('SELECT revision,operation,metadata FROM operations_project_metadata_outbox WHERE source_project_id=%s ORDER BY revision', (pid,)).fetchall()


def overlap(first, second, *, rollback=False, expected_error=None):
    """Prove second session really blocks on first, then release and check result."""
    with session() as left, session() as right, concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        left.execute('BEGIN')
        left.execute(*first)
        future = pool.submit(right.execute, *second)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                blocked = scalar('SELECT %s = ANY(pg_blocking_pids(%s))', (left.info.backend_pid, right.info.backend_pid))
                if blocked:
                    break
                if future.done():
                    future.result()
                    raise AssertionError('Second statement completed without expected overlap')
                time.sleep(0.02)
            else:
                raise AssertionError('Did not observe PostgreSQL lock wait')
        finally:
            left.execute('ROLLBACK' if rollback else 'COMMIT')
        try:
            future.result(timeout=15)
        except psycopg.Error as exc:
            if expected_error is None or expected_error not in str(exc):
                raise
        else:
            assert expected_error is None, 'Expected rejection: ' + str(expected_error)


pid = uuid4()
args = (pid, json.dumps(REQUEST))
overlap((CREATE, args), (CREATE, args))
assert len(receipts(pid)) == 1
assert scalar('SELECT count(*) FROM projects WHERE id=%s', (pid,)) == 1
assert scalar('SELECT count(*) FROM project_tasks WHERE project_id=%s', (pid,)) == 1
print('PASS concurrent identical create: one project, task and receipt')

pid2 = uuid4()
overlap((CREATE, (pid2, json.dumps(REQUEST))), (CREATE, (pid2, json.dumps({**REQUEST, 'name': 'conflict'}))), expected_error='identity conflict')
assert len(receipts(pid2)) == 1
print('PASS concurrent conflicting retry rejected without extra receipt')

pid3 = uuid4()
overlap((CREATE, (pid3, json.dumps(REQUEST))), (CREATE, (pid3, json.dumps(REQUEST))), rollback=True)
assert len(receipts(pid3)) == 1 and receipts(pid3)[0][0] == 1
assert scalar('SELECT count(*) FROM project_tasks WHERE project_id=%s', (pid3,)) == 1
print('PASS aborted creator rolls back project/task/receipt and waiter creates once')

update = 'UPDATE projects SET budget_cost_minor=%s WHERE id=%s'
overlap((update, (300000, pid)), (update, (400000, pid)))
rows = receipts(pid)
assert [r[0] for r in rows] == [1, 2, 3]
assert [r[2]['budget_cost_minor'] for r in rows] == [200000, 300000, 400000]
assert scalar('SELECT budget_cost_minor FROM projects WHERE id=%s', (pid,)) == 400000
print('PASS overlapping budgets serialize into immutable ordered revisions')

# An outbox failure must reject the source update too, then permit clean retry.
admin.execute('ALTER TABLE operations_project_metadata_outbox ADD CONSTRAINT ci_fault CHECK(revision<4)')
with session() as conn:
    try:
        conn.execute(update, (500000, pid))
    except psycopg.errors.CheckViolation as exc:
        assert exc.diag.constraint_name == 'ci_fault'
    else:
        raise AssertionError('Injected outbox failure did not reject update')
assert len(receipts(pid)) == 3
assert scalar('SELECT budget_cost_minor FROM projects WHERE id=%s', (pid,)) == 400000
admin.execute('ALTER TABLE operations_project_metadata_outbox DROP CONSTRAINT ci_fault')
with session() as conn:
    conn.execute(update, (500000, pid))
assert [r[0] for r in receipts(pid)] == [1, 2, 3, 4]
print('PASS outbox failure rolls source back; retry has no revision gap')

# Billing and classification race in both orders on a customer project.
for billing_first in (True, False):
    customer = uuid4()
    admin.execute('INSERT INTO projects(id,organization_id,project_kind) VALUES(%s,%s,\'customer\')', (customer, ORG))
    bill = ('INSERT INTO project_billing(id,project_id,project_type,organization_id) VALUES(%s,%s,\'medium\',%s)', (uuid4(), str(customer), ORG))
    classify = ("UPDATE projects SET project_kind='internal_project',budget_currency='SEK' WHERE id=%s", (customer,))
    overlap(bill if billing_first else classify, classify if billing_first else bill,
            expected_error='faktureringsunderlag' if billing_first else 'faktureras')
    assert scalar('SELECT count(*) FROM project_billing WHERE project_id=%s', (str(customer),)) == int(billing_first)
    assert len(receipts(customer)) == int(not billing_first)
print('PASS billing/classification race rejected in both commit orders')

failed = uuid4()
with session() as conn:
    try:
        conn.execute(CREATE, (failed, json.dumps({**REQUEST, 'tasks': [{'title': 'first'}, {'title': ''}]})))
    except psycopg.Error as exc:
        assert 'Task title required' in str(exc)
    else:
        raise AssertionError('Invalid task did not reject entire create')
assert scalar('SELECT count(*) FROM projects WHERE id=%s', (failed,)) == 0
assert scalar('SELECT count(*) FROM project_tasks WHERE project_id=%s', (failed,)) == 0
assert receipts(failed) == []
print('PASS task failure rolls back project, earlier task and receipt')

with session() as conn:
    conn.execute("SELECT set_config('test.actor',%s,false)", ('22222222-2222-4222-8222-222222222222',))
    assert conn.execute(update + ' RETURNING id', (99, pid)).fetchall() == []
    try:
        conn.execute('SELECT * FROM operations_project_metadata_outbox')
    except psycopg.errors.InsufficientPrivilege:
        pass
    else:
        raise AssertionError('Authenticated tenant read private receipt table')
assert scalar('SELECT budget_cost_minor FROM projects WHERE id=%s', (pid,)) == 500000
print('PASS synthetic cross-tenant actor cannot mutate project or read receipts')

admin.close()
print('PASS 9 real PostgreSQL concurrency/fault scenarios; synthetic schema/auth, NOT hosted integration or authenticated UI')
