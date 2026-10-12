import assert from'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url);
export async function proveCausalMetadataOverlap({db,request,project,pass}){
 const{Client}=require('pg');const clients=await Promise.all(['causal-source','causal-mutation','causal-observer'].map(async application_name=>{const c=new Client({connectionString:process.env.INTERNAL_PROJECTS_TEST_DSN,application_name,statement_timeout:12000});await c.connect();return c;}));const[a,b,o]=clients;
 try{await a.query('begin');const r=(await a.query('select operations_economy_private.issue_personnel_v1($1,$2,$3,$4) r',[request.body,request.timestamp,request.nonce,request.signature])).rows[0].r;
 const raw=(await a.query('select raw_envelope::jsonb e from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=$1',[r.outbox_id])).rows[0].e;
 const pending=b.query('update projects set budget_cost_minor=102 where id=$1',[project]);let observed=false;
 for(let i=0;i<150;i++){if((await o.query("select 1 from pg_stat_activity where application_name='causal-mutation' and wait_event_type='Lock'")).rowCount){observed=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(observed,true,'actual source issuance must fence metadata mutation');
 await a.query('commit');await pending;const latest=(await db.query('select revision from operations_project_metadata_outbox where source_project_id=$1 order by revision desc limit 1',[project])).rows[0].revision;assert.equal(Number(latest),raw.project_metadata_refs[0].revision+1);pass('native actual v2 issuance holds source identity through commit; competing budget revision waits and cannot alter frozen ref');
 }finally{await Promise.allSettled(clients.map(c=>c.query('rollback')));await Promise.all(clients.map(c=>c.end()));}
}
