import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const pglitePath=process.env.PGLITE_MODULE_PATH;
const {PGlite}=await import(pglitePath||'@electric-sql/pglite');
const db=new PGlite();
after(()=>db.close());
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE profiles(user_id uuid,organization_id uuid);
CREATE TABLE user_roles(user_id uuid,organization_id uuid,role text);
CREATE TABLE calendar_events(id uuid PRIMARY KEY,organization_id uuid,resource_id text,source_date date,start_time timestamptz,booking_id text);
CREATE TABLE staff_members(id text PRIMARY KEY,organization_id uuid,is_active boolean);
CREATE TABLE staff_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,staff_id text,team_id text,assignment_date date,UNIQUE(staff_id,team_id,assignment_date));
CREATE TABLE bookings(id text PRIMARY KEY,organization_id uuid);
CREATE TABLE large_projects(id uuid PRIMARY KEY,organization_id uuid,deleted_at timestamptz,start_date text[],event_date text[],end_date text[]);
CREATE TABLE large_project_bookings(large_project_id uuid,booking_id text,organization_id uuid);
CREATE TABLE booking_staff_assignments(booking_id text,staff_id text,team_id text,assignment_date date,role text,organization_id uuid,UNIQUE(organization_id,booking_id,staff_id,assignment_date));
GRANT SELECT,INSERT,DELETE,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;`);
await db.exec(await readFile(new URL('../../supabase/migrations/20260815193913_f211bdb1-9dc0-405e-9139-c6f81c228ec2.sql',import.meta.url),'utf8'));
await db.exec('CREATE TRIGGER staff_bsa AFTER INSERT OR DELETE ON staff_assignments FOR EACH ROW EXECUTE FUNCTION sync_team_pool_to_booking_assignments()');
await db.exec(await readFile(new URL('../../supabase/migrations/20261012205117_mobile_staff_command.sql',import.meta.url),'utf8'));
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',event='33333333-3333-4333-8333-333333333333';
await db.query('INSERT INTO profiles VALUES($1,$2)',[actor,org]);
await db.query("INSERT INTO user_roles VALUES($1,$2,'projekt')",[actor,org]);
await db.query("INSERT INTO calendar_events VALUES($1,$2,'team-1','2026-10-12','2026-10-12T08:00:00Z','booking-a')",[event,org]);
await db.query("INSERT INTO staff_members VALUES('staff-a',$1,true),('staff-foreign','99999999-9999-4999-8999-999999999999',true)",[org]);
await db.query("INSERT INTO bookings VALUES('booking-a',$1)",[org]);
const command=async({key,operation='assign',staff='staff-a',membership=null,actorId=actor,organizationId=org,team='team-1',date='2026-10-12',bookings=['booking-a']})=>{
 const result=await db.query('SELECT public.planning_mobile_staff_command_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS receipt',[actorId,organizationId,event,staff,operation,key,membership,team,date,bookings]);return result.rows[0].receipt;
};
let membership;
test('actual SQL assign is persisted and replayed once',async()=>{const key='44444444-4444-4444-8444-444444444444';const first=await command({key});membership=first.membershipId;assert.equal(first.persisted,true);assert.equal((await db.query("SELECT count(*)::int AS n FROM booking_staff_assignments WHERE booking_id='booking-a'")).rows[0].n,1);assert.equal(first.replayed,false);assert.equal((await command({key})).replayed,true);assert.equal((await db.query('SELECT count(*)::int AS n FROM staff_assignments')).rows[0].n,1);});
test('same key different intent conflicts',async()=>{await assert.rejects(command({key:'44444444-4444-4444-8444-444444444444',operation:'remove',membership}),/idempotency_conflict/);});
test('wrong org, actor, foreign staff, stale membership and changed calendar fail closed',async()=>{
 for(const args of [{organizationId:'99999999-9999-4999-8999-999999999999'},{actorId:'99999999-9999-4999-8999-999999999999'},{staff:'staff-foreign'},{membership:null},{membership,team:'team-2'},{membership,date:'2026-10-13'},{membership,bookings:[]}]) await assert.rejects(command({key:crypto.randomUUID(),...args}));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM staff_assignments')).rows[0].n,1);
});
test('remove affects only reviewed team membership and receipt replay does not remove another team',async()=>{
 await db.query("INSERT INTO staff_assignments(organization_id,staff_id,team_id,assignment_date)VALUES($1,'staff-a','team-2','2026-10-12')",[org]);
 const key=crypto.randomUUID();const removed=await command({key,operation:'remove',membership});assert.equal(removed.persisted,true);assert.equal((await command({key,operation:'remove',membership})).replayed,true);
 assert.deepEqual((await db.query('SELECT team_id FROM staff_assignments')).rows,[{team_id:'team-2'}]);assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_staff_assignments')).rows[0].n,0);
});
test('client roles cannot execute or read receipts',async()=>{
 const r=await db.query("SELECT has_function_privilege('authenticated','public.planning_mobile_staff_command_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,date,text[])','EXECUTE') AS execute, has_table_privilege('authenticated','planning_mobile_private.staff_command_receipts','SELECT') AS read");assert.deepEqual(r.rows[0],{execute:false,read:false});
});

test('canonical trigger includes date-matching large project bookings without a team predicate',async()=>{
 await db.query("INSERT INTO bookings VALUES('large-booking',$1)",[org]);
 await db.query("INSERT INTO large_projects(id,organization_id,event_date)VALUES('55555555-5555-4555-8555-555555555555',$1,ARRAY['2026-10-12'])",[org]);
 await db.query("INSERT INTO large_project_bookings VALUES('55555555-5555-4555-8555-555555555555','large-booking',$1)",[org]);
 await assert.rejects(command({key:crypto.randomUUID()}),/affected_bookings_changed/);
 const result=await command({key:crypto.randomUUID(),bookings:['booking-a','large-booking']});
 assert.deepEqual(result.affectedBookingIds,['booking-a','large-booking']);
 assert.deepEqual((await db.query("SELECT booking_id,team_id FROM booking_staff_assignments ORDER BY booking_id")).rows,[{booking_id:'booking-a',team_id:'team-1'},{booking_id:'large-booking',team_id:'team-1'}]);
});
