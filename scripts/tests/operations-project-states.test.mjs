import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const modulePath = process.env.PGLITE_MODULE_PATH;
test('Operations database owns status for every kind, preserves RLS and Stockholm date boundaries', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE bookings(id uuid PRIMARY KEY, organization_id uuid, rigdaydate date, eventdate date, rigdowndate date);
      CREATE TABLE projects(id uuid PRIMARY KEY, organization_id uuid, booking_id uuid, status text, rigdaydate date, eventdate date, rigdowndate date, is_internal boolean, deleted_at timestamptz);
      CREATE TABLE jobs(id uuid PRIMARY KEY, organization_id uuid, booking_id uuid, status text, deleted_at timestamptz);
      CREATE TABLE large_projects(id uuid PRIMARY KEY, organization_id uuid, status text, start_date date[], event_date date[], end_date date[], deleted_at timestamptz);
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261015074000_operations_project_states.sql', import.meta.url), 'utf8'));
    const org = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333';
    const id = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
    const { rows: [{ today }] } = await db.query("select (now() at time zone 'Europe/Stockholm')::date::text as today");
    await db.query('insert into bookings values ($1,$2,$3::date-2,$3::date-1,$3::date)', [id(10),org,today]);
    await db.query('insert into projects values ($1,$2,$3,\'planning\',null,null,null,false,null)', [id(1),org,id(10)]);
    await db.query("insert into projects values ($1,$2,null,'planning',$3::date-5,$3::date-3,$3::date-1,false,null)",[id(2),org,today]);
    await db.query("insert into projects values ($1,$2,null,'cancelled',null,null,$3::date-1,false,null)",[id(3),org,today]);
    await db.query("insert into projects values ($1,$2,null,'completed',$3::date+5,null,null,false,null)",[id(4),org,today]);
    await db.query("insert into projects values ($1,$2,null,'planning',$3::date+5,null,null,false,null)",[id(5),org,today]);
    await db.query("insert into projects values ($1,$2,$3,'planning',null,null,null,false,null)",[id(6),other,id(10)]);
    await db.query("insert into projects values ($1,$2,null,'planning',null,null,null,false,now())",[id(7),org]);
    await db.query("insert into jobs values ($1,$2,$3,'planned',null)",[id(1),org,id(10)]);
    await db.query("insert into large_projects values ($1,$2,'planning',array[$3::date-5],null,array[$3::date-1,$3::date+1],null)",[id(1),org,today]);
    const {rows} = await db.query('select * from operations_project_states order by project_kind,project_id');
    assert.equal(rows.length,8);
    const medium = rows.filter(r=>r.project_kind==='medium');
    assert.deepEqual(medium.map(r=>r.status),['in_progress','completed','cancelled','completed','planning','planning']);
    assert.equal(medium[5].rig_date,null,'cross-org booking dates never inherited');
    assert.equal(rows.find(r=>r.project_kind==='large').status,'in_progress','last derig day controls large project');
    assert.equal(rows.find(r=>r.project_kind==='small').status,'in_progress');
    assert.equal(medium[0].status_tabs.includes('all_active'),true);
    assert.equal(medium[1].status_tabs.includes('all_active'),false);
    assert.equal(medium[0].as_of_date.toISOString().slice(0,10),today);
    // Invoker view must respect underlying table RLS, not expose view-owner access.
    for(const table of ['projects','jobs','large_projects','bookings']){
      await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fixture ON ${table} FOR SELECT TO authenticated USING (organization_id = '${org}');
        GRANT SELECT ON ${table} TO authenticated;`);
    }
    await db.exec('SET ROLE authenticated');
    const visible = await db.query('select * from operations_project_states');
    assert.equal(visible.rows.length,7);
    assert.ok(visible.rows.every(r=>r.organization_id===org));
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('select * from operations_project_states'),/permission denied/);
  } finally { await db.close(); }
});
