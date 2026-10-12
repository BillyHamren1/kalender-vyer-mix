import assert from 'node:assert/strict';import{readFileSync,readdirSync}from'node:fs';
const{PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const org='11111111-1111-4111-8111-111111111111',org2='22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon;create role authenticated;create role service_role;create role restricted;
create schema auth;grant usage on schema auth to authenticated,restricted;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function get_user_organization_id(uuid) returns uuid language sql as $$select $1$$;
create table projects(id uuid primary key,organization_id uuid,name text,project_leader text,booking_id text,is_internal boolean default false,location_id uuid,status text,rigdaydate date,rigdowndate date);
create table bookings(id text primary key,organization_id uuid,client text,status text,is_internal boolean,internal_type text,booking_number text,eventdate date,assigned_to_project boolean);
create table project_billing(id uuid primary key,project_id text,project_type text,organization_id uuid);
create table project_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),organization_id uuid,title text,deadline date,sort_order integer,is_info_only boolean,completed boolean);
create function ensure_internal_lager_booking(uuid) returns text language sql as $$select null::text$$;
alter table projects enable row level security;alter table project_tasks enable row level security;
create policy org_projects on projects for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
create policy org_tasks on project_tasks for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
grant select,insert,update,delete on projects,project_tasks to authenticated;grant select on project_billing,bookings to authenticated;
`);
for(const suffix of ['internal_project_classification.sql','atomic_internal_project_creation.sql','internal_project_metadata_outbox.sql'])await db.exec(readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8'));
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('PASS',name)};
const id='33333333-3333-4333-8333-333333333333';
const request={expected_actor_id:org,expected_organization_id:org,name:'Inventering',project_leader:'Ansvarig',rigdaydate:'2026-10-12',rigdowndate:'2026-10-13',budget_hours:8,budget_cost_minor:200000,tasks:[{title:'Räkna'}]};
const admin=async(sql,params=[])=>{await db.exec('RESET ROLE');return db.query(sql,params)};
const actor=async(o=org)=>db.exec(`SET ROLE authenticated;SET test.actor='${o}'`);
const receipts=async(pid=id)=>(await admin('SELECT * FROM operations_project_metadata_outbox WHERE source_project_id=$1 ORDER BY revision',[pid])).rows;
const create=async(pid=id,req=request)=>db.query('SELECT create_internal_project_atomic($1,$2)',[pid,req]);
await check('atomic create and exact retry emit one receipt with tenant and budget',async()=>{
 await actor();await create();await create();const rows=await receipts();assert.equal(rows.length,1);assert.equal(rows[0].source_organization_id,org);assert.equal(rows[0].revision,1);assert.equal(rows[0].metadata.project_kind,'internal_project');assert.equal(rows[0].metadata.budget_cost_minor,200000);assert.match(rows[0].fingerprint,/^[a-f0-9]{64}$/);
});
await check('task failure rolls project AND metadata back',async()=>{
 const failed='44444444-4444-4444-8444-444444444444';await actor();await assert.rejects(create(failed,{...request,tasks:[{title:'first'},{title:''}]}),/title/);assert.equal((await receipts(failed)).length,0);assert.equal((await admin('SELECT * FROM projects WHERE id=$1',[failed])).rows.length,0);
});
await check('unrelated edits and repeated budget do not emit; changed and unknown budgets do',async()=>{
 await actor();await db.query("UPDATE projects SET name='Renamed',budget_cost_minor=200000 WHERE id=$1",[id]);assert.equal((await receipts()).length,1);
 await actor();await db.query('UPDATE projects SET budget_cost_minor=300000 WHERE id=$1',[id]);let rows=await receipts();assert.equal(rows.length,2);assert.equal(rows[0].metadata.budget_cost_minor,200000);assert.notEqual(rows[0].fingerprint,rows[1].fingerprint);
 await actor();await db.query('UPDATE projects SET budget_cost_minor=NULL WHERE id=$1',[id]);assert.equal((await receipts())[2].metadata.budget_cost_minor,null);
});
await check('forced metadata failure rolls source budget back',async()=>{
 await admin('ALTER TABLE operations_project_metadata_outbox ADD CONSTRAINT fail_next CHECK (revision<4)');await actor();await assert.rejects(db.query('UPDATE projects SET budget_cost_minor=0 WHERE id=$1',[id]),/fail_next/);assert.equal((await admin('SELECT budget_cost_minor FROM projects WHERE id=$1',[id])).rows[0].budget_cost_minor,null);await admin('ALTER TABLE operations_project_metadata_outbox DROP CONSTRAINT fail_next');
});
await check('cross-tenant and restricted actor cannot change source or inspect receipts',async()=>{
 await actor(org2);assert.equal((await db.query('UPDATE projects SET budget_cost_minor=0 WHERE id=$1 RETURNING id',[id])).rows.length,0);await assert.rejects(db.query('SELECT * FROM operations_project_metadata_outbox'),/permission denied/);
 await db.exec('SET ROLE restricted');await assert.rejects(db.query('UPDATE projects SET budget_cost_minor=0 WHERE id=$1',[id]),/permission denied/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM operations_project_metadata_outbox'),/permission denied/);
});
await check('service reads only; direct append/update/delete and trigger invocation denied',async()=>{
 await db.exec('SET ROLE service_role');assert.equal((await db.query('SELECT * FROM operations_project_metadata_outbox')).rows.length,3);
 for(const sql of ['DELETE FROM operations_project_metadata_outbox','UPDATE operations_project_metadata_outbox SET revision=100','INSERT INTO operations_project_metadata_outbox SELECT * FROM operations_project_metadata_outbox','SELECT capture_internal_project_metadata()'])await assert.rejects(db.exec(sql),/permission denied/);
});
await check('append-only receipts and truncate bypass also fail for database owner',async()=>{
 for(const sql of ['DELETE FROM operations_project_metadata_outbox','UPDATE operations_project_metadata_outbox SET revision=100','TRUNCATE operations_project_metadata_outbox'])await assert.rejects(admin(sql),/append-only/);
 await assert.rejects(admin('TRUNCATE projects CASCADE'),/individual deletion/);
});
await check('delete tombstone and same-tenant reinsert retain monotonically increasing identity',async()=>{
 await actor();await db.query('DELETE FROM project_tasks WHERE project_id=$1',[id]);await db.query('DELETE FROM projects WHERE id=$1',[id]);let rows=await receipts();assert.equal(rows[3].operation,'delete');
 await actor();await create();rows=await receipts();assert.equal(rows[4].revision,5);assert.equal(rows[4].operation,'upsert');
});
await check('cross-tenant resurrection and customer resurrection fail',async()=>{
 await actor();await db.query('DELETE FROM project_tasks WHERE project_id=$1',[id]);await db.query('DELETE FROM projects WHERE id=$1',[id]);
 await actor(org2);await assert.rejects(create(id,{...request,expected_actor_id:org2,expected_organization_id:org2}),/tenant/);
 await actor();await assert.rejects(db.query("INSERT INTO projects(id,organization_id,project_kind) VALUES($1,$2,'customer')",[id,org]),/classification/);
});
await check('legacy Lager keeps null classification, booking and unknown budget',async()=>{
 const legacy='55555555-5555-4555-8555-555555555555';await admin("INSERT INTO projects(id,organization_id,is_internal,booking_id) VALUES($1,$2,true,'legacy-lager')",[legacy,org]);const rows=await receipts(legacy);assert.equal(rows[0].metadata.project_kind,'internal_activity');assert.equal(rows[0].metadata.declared_project_kind,null);assert.equal(rows[0].metadata.booking_id,'legacy-lager');assert.equal(rows[0].metadata.budget_currency,null);await actor();await db.query("UPDATE projects SET name='Lager' WHERE id=$1",[legacy]);assert.equal((await receipts(legacy)).length,1);
});
await check('ordinary customer and legacy-null customer remain untracked',async()=>{
 const customer='66666666-6666-4666-8666-666666666666';await actor();await db.query('INSERT INTO projects(id,organization_id) VALUES($1,$2)',[customer,org]);await db.query('UPDATE projects SET budget_cost_minor=123 WHERE id=$1',[customer]);assert.equal((await receipts(customer)).length,0);
});
await check('identity change and OLD internal to new customer bypass denied independently',async()=>{
 const legacy='55555555-5555-4555-8555-555555555555';await admin('ALTER TABLE projects DISABLE TRIGGER guard_internal_project_classification');
 await assert.rejects(admin('UPDATE projects SET organization_id=$1 WHERE id=$2',[org2,legacy]),/identity/);
 await assert.rejects(admin("UPDATE projects SET id='77777777-7777-4777-8777-777777777777',project_kind='customer',is_internal=false WHERE id=$1",[legacy]),/identity/);
 await assert.rejects(admin("UPDATE projects SET project_kind='customer',is_internal=false WHERE id=$1",[legacy]),/classification/);
 await admin('ALTER TABLE projects ENABLE TRIGGER guard_internal_project_classification');
});
console.log(`${checks} metadata producer scenarios passed; synthetic PostgreSQL fixture, not hosted or concurrency proof.`);
await db.close();
