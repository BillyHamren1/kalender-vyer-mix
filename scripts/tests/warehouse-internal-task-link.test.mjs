// Isolated SQL regression fixture. Never connects to a hosted database.
// PGLITE_MODULE_PATH=/path/to/pglite/dist/index.js node --test scripts/tests/warehouse-internal-task-link.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
after(() => db.close());
const proposal = await readFile(process.env.WAREHOUSE_INTERNAL_TASK_LINK_SQL || new URL('../../db/pending-migrations/warehouse_internal_task_link.proposal.sql', import.meta.url), 'utf8');
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const internalA = '20000000-0000-4000-8000-000000000001';
const internalB = '20000000-0000-4000-8000-000000000002';
const externalA = '20000000-0000-4000-8000-000000000003';
const taskA = '30000000-0000-4000-8000-000000000001';
const taskB = '30000000-0000-4000-8000-000000000002';
const externalTask = '30000000-0000-4000-8000-000000000003';
const mismatchedTask = '30000000-0000-4000-8000-000000000004';
const legacy = '40000000-0000-4000-8000-000000000001';
await db.exec(`
  CREATE ROLE warehouse_fixture_user;
  CREATE TABLE public.projects(id uuid PRIMARY KEY, organization_id uuid NOT NULL, is_internal boolean NOT NULL);
  CREATE TABLE public.project_tasks(id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects(id), organization_id uuid NOT NULL);
  CREATE TABLE public.warehouse_calendar_events(id uuid PRIMARY KEY, organization_id uuid NOT NULL, title text NOT NULL);
  GRANT SELECT ON public.projects, public.project_tasks TO warehouse_fixture_user;
  GRANT SELECT, INSERT, UPDATE ON public.warehouse_calendar_events TO warehouse_fixture_user;
  ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.warehouse_calendar_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY fixture_org ON public.projects TO warehouse_fixture_user USING (organization_id = current_setting('fixture.org')::uuid);
  CREATE POLICY fixture_org ON public.project_tasks TO warehouse_fixture_user USING (organization_id = current_setting('fixture.org')::uuid);
  CREATE POLICY fixture_org ON public.warehouse_calendar_events TO warehouse_fixture_user USING (organization_id = current_setting('fixture.org')::uuid) WITH CHECK (organization_id = current_setting('fixture.org')::uuid);
`);
await db.query('INSERT INTO projects VALUES ($1,$2,true),($3,$4,true),($5,$2,false)', [internalA, orgA, internalB, orgB, externalA]);
await db.query('INSERT INTO project_tasks VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$3),($9,$5,$3)', [taskA, internalA, orgA, taskB, internalB, orgB, externalTask, externalA, mismatchedTask]);
await db.query('INSERT INTO warehouse_calendar_events VALUES ($1,$2,$3)', [legacy, orgA, 'Existing unlinked work']);
const permissions = async () => (await db.query("SELECT relname, relrowsecurity, relacl::text AS acl FROM pg_class WHERE relname IN ('projects','project_tasks','warehouse_calendar_events') ORDER BY relname")).rows;
const beforePermissions = await permissions();
await db.exec(proposal);
const insert = (task, org = orgA) => db.query('INSERT INTO warehouse_calendar_events(id,organization_id,title,project_task_id) VALUES ($1,$2,$3,$4) RETURNING id, project_task_id', [crypto.randomUUID(), org, 'Fixture job', task]);

test('legacy rows remain unchanged and nullable links remain valid', async () => {
  assert.deepEqual((await db.query('SELECT title,project_task_id FROM warehouse_calendar_events WHERE id=$1', [legacy])).rows, [{ title: 'Existing unlinked work', project_task_id: null }]);
  assert.equal((await insert(null)).rows[0].project_task_id, null);
  await db.query('UPDATE warehouse_calendar_events SET title=$1 WHERE id=$2', ['Legacy edited normally', legacy]);
});
test('same-organization internal task can be linked on insert and update', async () => {
  assert.equal((await insert(taskA)).rows[0].project_task_id, taskA);
  const id = (await insert(null)).rows[0].id;
  await db.query('UPDATE warehouse_calendar_events SET project_task_id=$1 WHERE id=$2', [taskA, id]);
  assert.equal((await db.query('SELECT project_task_id FROM warehouse_calendar_events WHERE id=$1', [id])).rows[0].project_task_id, taskA);
});
test('foreign tasks, foreign parents, external projects and missing IDs fail closed', async () => {
  for (const task of [taskB, mismatchedTask, externalTask, crypto.randomUUID()]) {
    await assert.rejects(insert(task), /Internal task must belong to the same organization/);
  }
  const id = (await insert(taskA)).rows[0].id;
  await assert.rejects(db.query('UPDATE warehouse_calendar_events SET organization_id=$1 WHERE id=$2', [orgB, id]), /Internal task must belong to the same organization/);
  await assert.rejects(db.query('UPDATE warehouse_calendar_events SET project_task_id=$1 WHERE id=$2', [externalTask, id]), /Internal task must belong to the same organization/);
  assert.deepEqual((await db.query('SELECT organization_id,project_task_id FROM warehouse_calendar_events WHERE id=$1', [id])).rows[0], { organization_id: orgA, project_task_id: taskA });
});
test('trigger runs as caller and preserves existing RLS and table grants', async () => {
  assert.deepEqual(await permissions(), beforePermissions);
  assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.validate_warehouse_internal_task_link()'::regprocedure")).rows[0].prosecdef, false);
  assert.doesNotMatch(proposal, /\bGRANT\b|SECURITY\s+DEFINER/i);
  await db.exec(`SET ROLE warehouse_fixture_user; SET fixture.org = '${orgA}';`);
  try {
    assert.equal((await insert(taskA)).rows[0].project_task_id, taskA);
    await assert.rejects(insert(taskB), /Internal task must belong to the same organization/);
    await assert.rejects(insert(taskB, orgB));
  } finally { await db.exec('RESET ROLE'); }
});
test('deleting a task clears its explicit event link without deleting the event', async () => {
  const task = crypto.randomUUID();
  await db.query('INSERT INTO project_tasks VALUES ($1,$2,$3)', [task, internalA, orgA]);
  const id = (await insert(task)).rows[0].id;
  await db.query('DELETE FROM project_tasks WHERE id=$1', [task]);
  assert.deepEqual((await db.query('SELECT project_task_id FROM warehouse_calendar_events WHERE id=$1', [id])).rows, [{ project_task_id: null }]);
});
test('proposal is rerunnable and keeps valid links intact', async () => {
  const id = (await insert(taskA)).rows[0].id;
  await db.exec(proposal);
  assert.equal((await db.query('SELECT project_task_id FROM warehouse_calendar_events WHERE id=$1', [id])).rows[0].project_task_id, taskA);
});


test('parent edits cannot invalidate linked work even when RLS hides the event', async () => {
  await insert(taskA);
  // This independent editor can see and edit tasks/projects, but no events.
  await db.exec(`
    CREATE ROLE warehouse_parent_editor;
    GRANT SELECT, UPDATE ON public.projects, public.project_tasks TO warehouse_parent_editor;
    GRANT SELECT ON public.warehouse_calendar_events TO warehouse_parent_editor;
    CREATE POLICY fixture_parent_editor ON public.projects TO warehouse_parent_editor USING (true) WITH CHECK (true);
    CREATE POLICY fixture_parent_editor ON public.project_tasks TO warehouse_parent_editor USING (true) WITH CHECK (true);
    SET ROLE warehouse_parent_editor;
  `);
  try {
    assert.deepEqual((await db.query('SELECT id FROM warehouse_calendar_events')).rows, []);
    for (const [sql, args] of [
      ['UPDATE project_tasks SET organization_id=$1 WHERE id=$2', [orgB, taskA]],
      ['UPDATE project_tasks SET project_id=$1 WHERE id=$2', [externalA, taskA]],
      ['UPDATE projects SET organization_id=$1 WHERE id=$2', [orgB, internalA]],
      ['UPDATE projects SET is_internal=false WHERE id=$1', [internalA]],
    ]) await assert.rejects(db.query(sql, args), /foreign key constraint/);
  } finally { await db.exec('RESET ROLE'); }
  assert.equal((await db.query('SELECT is_internal FROM projects WHERE id=$1', [internalA])).rows[0].is_internal, true);
});
test('derived link fields cannot be forged to bypass the internal-only relationship', async () => {
  const id = (await insert(taskA)).rows[0].id;
  await db.query('UPDATE warehouse_calendar_events SET linked_internal_project_id=$1,linked_internal_project_type=false WHERE id=$2', [externalA, id]);
  assert.deepEqual((await db.query('SELECT linked_internal_project_id,linked_internal_project_type FROM warehouse_calendar_events WHERE id=$1', [id])).rows[0], { linked_internal_project_id: internalA, linked_internal_project_type: true });
});
test('unlinked projects and tasks retain normal editability', async () => {
  const project = crypto.randomUUID(), task = crypto.randomUUID();
  await db.query('INSERT INTO projects VALUES($1,$2,true)', [project, orgA]);
  await db.query('INSERT INTO project_tasks VALUES($1,$2,$3)', [task, project, orgA]);
  await db.query('UPDATE projects SET is_internal=false WHERE id=$1', [project]);
  await db.query('UPDATE project_tasks SET project_id=$1 WHERE id=$2', [externalA, task]);
});
