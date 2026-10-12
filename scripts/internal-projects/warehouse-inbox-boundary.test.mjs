// Synthetic PostgreSQL-WASM trigger test; no hosted connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create table projects(id uuid primary key,organization_id uuid,booking_id text,name text,is_internal boolean,project_kind text);
create table bookings(id text primary key,client text,eventdate date,booking_number text);
create table warehouse_project_inbox(id uuid default gen_random_uuid(),organization_id uuid,source_type text,source_id uuid,source_project_id uuid,source_booking_id uuid,source_project_number text,client_name text,event_date date,status text,created_at timestamptz default now(),unique(source_type,source_id));
create table warehouse_need_calls(booking_id uuid);
create function ensure_warehouse_booking_need(uuid) returns void language sql as $$insert into warehouse_need_calls values($1)$$;
`);
const original=readFileSync('supabase/migrations/20260820134434_e5c0991d-31f8-4747-8b77-8cf349107f47.sql','utf8');
const start=original.indexOf('CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_project()');
const end=original.indexOf('\nCREATE OR REPLACE FUNCTION',start+20);
await db.exec(original.slice(start,end));
await db.exec('create trigger warehouse_notice after insert on projects for each row execute function notify_warehouse_on_new_project()');
const org='00000000-0000-4000-8000-000000000001';
const count=async(table)=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
await db.exec(`insert into projects values(gen_random_uuid(),'${org}',null,'Before',false,'internal_project')`);
assert.equal(await count('warehouse_project_inbox'),1,'reproduce old implicit equipment demand');
await db.exec('truncate projects,warehouse_project_inbox,warehouse_need_calls');
await db.exec(readFileSync('supabase/migrations/20261012130508_internal_warehouse_commercial_boundaries.sql','utf8'));
await db.exec(`insert into bookings values('00000000-0000-4000-8000-000000000002','Customer','2026-10-12','FA-001'),('legacy-lager','Lager',null,null);`);
for (const [kind,legacy,booking] of [['internal_project',false,null],['internal_activity',false,null],[null,true,'legacy-lager']]) {
 await db.query('insert into projects values(gen_random_uuid(),$1,$2,$3,$4,$5)',[org,booking,'Internal',legacy,kind]);
 assert.equal(await count('warehouse_project_inbox'),0);
 assert.equal(await count('warehouse_need_calls'),0);
}
await db.exec(`insert into projects values(gen_random_uuid(),'${org}',null,'Customer standalone',false,null)`);
assert.equal(await count('warehouse_project_inbox'),1,'legacy no-booking customer inbox preserved');
await db.exec(`insert into projects values(gen_random_uuid(),'${org}','00000000-0000-4000-8000-000000000002','Customer linked',false,'customer')`);
assert.equal(await count('warehouse_project_inbox'),2,'customer booking inbox preserved');
assert.equal(await count('warehouse_need_calls'),1,'only customer demand reaches warehouse ensure');
console.log('10 warehouse inbox assertions passed; old bug reproduced then fixed (synthetic PostgreSQL WASM only)');
await db.close();
