import assert from 'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url);
export async function proveCustomerMetadataConcurrency({db,org,booking,ok}){
 const{Client}=require('pg');const clients=await Promise.all(['customer-a','customer-b','customer-observer'].map(async application_name=>{const c=new Client({connectionString:process.env.INTERNAL_PROJECTS_TEST_DSN,application_name,statement_timeout:12000});await c.connect();return c}));const[a,b,o]=clients;
 const p='77777777-7777-4777-8777-777777777777',other='22222222-2222-4222-8222-222222222222';
 const blocked=async()=>{for(let i=0;i<150;i++){if((await o.query("select 1 from pg_stat_activity where application_name='customer-b' and wait_event_type='Lock'")).rowCount)return;await new Promise(r=>setTimeout(r,20));}throw new Error('required physical lock wait not observed')};
 try{
  await db.query("insert into projects(id,organization_id,project_kind,booking_id) values($1,$2,'customer',$3)",[p,org,booking]);
  await a.query('begin');await a.query('update bookings set organization_id=$1 where id=$2',[other,booking]);
  const pending=b.query('select enroll_customer_identity_metadata_v1($1,$2)',[p,booking]).then(()=>({ok:true}),error=>({error}));await blocked();await a.query('commit');const result=await pending;assert.match(result.error?.message||'',/explicit_customer/);assert.equal((await db.query('select * from operations_project_metadata_outbox where source_project_id=$1',[p])).rows.length,0);ok('native Booking-first enrollment waits for concurrent tenant mutation and denies stale relationship');
  await db.query('update bookings set organization_id=$1 where id=$2',[org,booking]);await a.query('begin');await a.query('select enroll_customer_identity_metadata_v1($1,$2)',[p,booking]);
  const change=b.query('update bookings set organization_id=$1 where id=$2',[other,booking]);await blocked();await a.query('commit');await change;
  const receipts=(await db.query('select operation,metadata from operations_project_metadata_outbox where source_project_id=$1 order by revision',[p])).rows;assert.deepEqual(receipts.map(r=>r.operation),['upsert','delete']);assert.deepEqual(receipts[0].metadata,receipts[1].metadata);ok('native enrolled Booking mutation waits then appends terminal tombstone without reverse-lock deadlock');
 }finally{await Promise.allSettled(clients.map(c=>c.query('rollback')));await Promise.all(clients.map(c=>c.end()));}
}
