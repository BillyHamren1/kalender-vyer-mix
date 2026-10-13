import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
after(()=>db.close());
const dir=new URL('../../supabase/migrations/',import.meta.url);
const file=process.env.HUB_LINK_MIGRATION||new URL((await readdir(dir)).sort().reverse().find(async()=>false)??'',dir);
const migrations=(await readdir(dir)).sort();
const read=async name=>readFile(new URL(name,dir),'utf8');
let hubMigration;
for(const name of migrations.reverse()){const s=await read(name);if(s.includes('CREATE TABLE public.hub_identity_links')){hubMigration=s;break;}}
if(process.env.HUB_LINK_MIGRATION) hubMigration=await readFile(process.env.HUB_LINK_MIGRATION,'utf8');
void file;
assert.ok(hubMigration,'hub identity link migration present');
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
CREATE TABLE profiles(user_id uuid,organization_id uuid);
CREATE TABLE user_roles(user_id uuid,organization_id uuid,role text);
CREATE TABLE calendar_events(id uuid PRIMARY KEY,organization_id uuid,resource_id text,source_date date,start_time timestamptz,booking_id text);
CREATE TABLE staff_members(id text PRIMARY KEY,organization_id uuid,is_active boolean);
CREATE TABLE staff_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,staff_id text,team_id text,assignment_date date);
CREATE TABLE bookings(id text PRIMARY KEY,organization_id uuid);
CREATE TABLE large_projects(id uuid PRIMARY KEY,organization_id uuid,deleted_at timestamptz,start_date text[],event_date text[],end_date text[]);
CREATE TABLE large_project_bookings(large_project_id uuid,booking_id text,organization_id uuid);
CREATE SCHEMA planning_mobile_private;
CREATE TABLE planning_mobile_private.staff_command_receipts(organization_id uuid,actor_user_id uuid,idempotency_key uuid,payload jsonb,receipt jsonb,created_at timestamptz);`);
await db.exec(hubMigration);
const direct='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', hub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', adopted='cccccccc-cccc-4ccc-8ccc-cccccccccccc', spoofHub='dddddddd-dddd-4ddd-8ddd-dddddddddddd', victim='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const orgA='11111111-1111-4111-8111-111111111111', orgB='22222222-2222-4222-8222-222222222222', event='33333333-3333-4333-8333-333333333333';
await db.query(`INSERT INTO auth.users VALUES($1,'{}','{}'),($2,'{}','{}'),($3,$4::jsonb,'{}')`,[direct,adopted,victim,JSON.stringify({hub_user_id:spoofHub})]);
await db.query(`INSERT INTO hub_identity_links VALUES($1,$2,'explicit_admin_mapping','test fixture mapping only',now())`,[hub,adopted]);
const resolve=async id=>(await db.query('SELECT public.resolve_hub_actor_v1($1) r',[id])).rows[0].r;

test('direct provisioned HUB identity resolves to itself',async()=>{assert.deepEqual(await resolve(direct),{status:'ok',mode:'direct',localUserId:direct});});
test('adopted identity resolves only via server-controlled link',async()=>{assert.deepEqual(await resolve(hub),{status:'ok',mode:'linked',localUserId:adopted});});
test('user-editable metadata hub_user_id is never trusted',async()=>{assert.equal((await resolve(spoofHub)).status,'actor_unmapped');});
test('missing mapping fails closed',async()=>{assert.equal((await resolve('ffffffff-ffff-4fff-8fff-ffffffffffff')).status,'actor_unmapped');assert.equal((await resolve(null)).status,'actor_unmapped');});
test('adopted local id cannot be used as a HUB subject',async()=>{assert.equal((await resolve(adopted)).status,'actor_ambiguous');});
test('link plus colliding direct account is ambiguous',async()=>{
 const h2='99999999-9999-4999-8999-999999999991', l2='99999999-9999-4999-8999-999999999992';
 await db.query(`INSERT INTO auth.users VALUES($1,'{}','{}'),($2,'{}','{}')`,[h2,l2]);
 await db.query(`INSERT INTO hub_identity_links VALUES($1,$2,'explicit_admin_mapping','collision fixture only',now())`,[h2,l2]);
 assert.equal((await resolve(h2)).status,'actor_ambiguous');
});
test('links are immutable and one-to-one',async()=>{
 await assert.rejects(db.query('UPDATE hub_identity_links SET local_user_id=$1 WHERE hub_user_id=$2',[direct,hub]),/immutable/);
 await assert.rejects(db.query('DELETE FROM hub_identity_links WHERE hub_user_id=$1',[hub]),/immutable/);
 await assert.rejects(db.query(`INSERT INTO hub_identity_links VALUES($1,$2,'explicit_admin_mapping','duplicate local fixture',now())`,['12121212-1212-4212-8212-121212121212',adopted]));
});
test('staff context authorizes per-org role even when profile points at another org',async()=>{
 await db.query('INSERT INTO profiles VALUES($1,$2)',[adopted,orgB]);
 await db.query(`INSERT INTO user_roles VALUES($1,$2,'admin')`,[adopted,orgA]);
 await db.query(`INSERT INTO calendar_events VALUES($1,$2,'team-1','2026-10-12',null,null)`,[event,orgA]);
 const r=(await db.query('SELECT public.planning_mobile_staff_context_v1($1,$2,$3) r',[adopted,orgA,event])).rows[0].r;
 assert.equal(r.teamId,'team-1');
});
test('staff context denies wrong org and no role',async()=>{
 await assert.rejects(db.query('SELECT public.planning_mobile_staff_context_v1($1,$2,$3)',[adopted,orgB,event]),/actor_not_authorized/);
 await assert.rejects(db.query('SELECT public.planning_mobile_staff_context_v1($1,$2,$3)',[direct,orgA,event]),/actor_not_authorized/);
});
