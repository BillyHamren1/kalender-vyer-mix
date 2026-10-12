// Synthetic PostgreSQL-WASM test: execute with PGLITE_MODULE pointing to an installed package.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.get_user_organization_id(uuid) returns uuid language sql as $$select $1$$;
create table projects(id uuid primary key,organization_id uuid,name text,booking_id text,is_internal boolean not null default false,location_id uuid,status text);
create table bookings(id text primary key,organization_id uuid,client text,status text,is_internal boolean,internal_type text,booking_number text,eventdate date,assigned_to_project boolean);
create table project_billing(id uuid primary key,project_id text,project_type text,organization_id uuid default '00000000-0000-0000-0000-000000000002');
create table project_tasks(project_id uuid,completed boolean,is_info_only boolean);
`);
await db.exec(`create function ensure_internal_lager_booking(uuid) returns text language sql as $$select null::text$$;`);
const migration = readdirSync('supabase/migrations').find(f=>f.endsWith('_internal_project_classification.sql'));
await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
const id='00000000-0000-0000-0000-000000000001';
const org='00000000-0000-0000-0000-000000000002';
await db.exec(`insert into projects(id,organization_id,name,status,project_kind,budget_currency) values('${id}','${org}','Internal','planning','internal_project','SEK')`);
let checks=0;
async function denied(sql, pattern){await assert.rejects(db.exec(sql), pattern);checks++;}
await denied(`insert into projects(id,status,project_kind,budget_currency) values(gen_random_uuid(),'completed','internal_project','SEK')`,/återstående/);
await denied(`insert into project_billing(id,project_id,project_type) values(gen_random_uuid(),'${id}','medium')`,/Interna projekt/);
await denied(`update projects set project_kind=null where id='${id}'`,/klassificering/);
await denied(`update projects set booking_id='fake' where id='${id}'`,/finite_internal_no_booking/);
await denied(`update projects set budget_currency=null where id='${id}'`,/internal_budget_currency/);
await denied(`update projects set budget_currency='BAD' where id='${id}'`,/budget_currency/);
await denied(`update projects set budget_hours='NaN' where id='${id}'`,/budget_hours/);
await denied(`update projects set budget_cost_minor=-1 where id='${id}'`,/budget_cost_minor/);
await denied(`update projects set status='completed' where id='${id}'`,/återstående/);
await db.exec(`update projects set remaining_hours=0,remaining_cost_minor=0 where id='${id}';insert into project_tasks values('${id}',false,false)`);
await denied(`update projects set status='completed' where id='${id}'`,/uppgifter/);
await db.exec(`update project_tasks set completed=true;update projects set status='completed' where id='${id}'`);
assert.equal((await db.query('select count(*)::int n from project_billing')).rows[0].n,0);checks++;
await db.exec(`insert into projects values('00000000-0000-0000-0000-000000000003','${org}','Customer',null,false,null,'planning',null,null,null,null,null,null,null,null);insert into project_billing(id,project_id,project_type) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000003','medium')`);
await denied(`update projects set project_kind='internal_project',budget_currency='SEK' where id='00000000-0000-0000-0000-000000000003'`,/faktureringsunderlag/);
// Exact warehouse lookup does not adopt another legacy internal activity.
await db.exec(`insert into projects(id,organization_id,name,is_internal) values(gen_random_uuid(),'${org}','Other',true);select ensure_internal_lager_setup('${org}')`);
assert.equal((await db.query(`select count(*)::int n from projects p join bookings b on b.id=p.booking_id where b.internal_type='warehouse'`)).rows[0].n,1);checks++;
// Caller role cannot bill internal projects via a direct table write.
await db.exec(`grant usage on schema public to authenticated;grant select,insert,update on projects,project_billing,project_tasks to authenticated;set role authenticated`);
await denied(`insert into project_billing(id,project_id,project_type) values(gen_random_uuid(),'${id}','medium')`,/Interna projekt/);
console.log(`${checks} database assertions passed (synthetic PostgreSQL WASM; not hosted RLS acceptance)`);
await db.close();
