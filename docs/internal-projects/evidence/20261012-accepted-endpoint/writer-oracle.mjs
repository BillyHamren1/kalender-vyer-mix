// Independent canonical-writer test helpers. Product functions are loaded verbatim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export async function prepareWriterOracle(db,financeRoot){
 const read=n=>readFileSync(financeRoot+'/supabase/migrations/'+n,'utf8');
 const extract=(sql,name)=>{const start=sql.indexOf('create or replace function '+name+'(');assert.ok(start>=0,name);return sql.slice(start,sql.indexOf('\n$$;',start)+4)};
 await db.exec(extract(read('20260826110915_finance_project_commands_v1.sql'),'public.finance_command_apply_cost_event'));
 for(const file of ['20261012162053_finance_command_replay_actor_binding_v1.sql','20260826211500_finance_cost_event_forecast_floor_v1.sql','20260826111041_finance_actual_fact_attestation_v1.sql'])await db.exec(read(file));
 const periods=read('20260911290000_finance_period_and_financial_close_v1.sql');
 await db.exec(periods.slice(0,periods.indexOf('alter table public.finance_project_snapshots')));
 await db.exec(extract(periods,'finance_private.assert_accounting_period_open'));
 const gs=periods.indexOf('create or replace function finance_private.guard_accrual_period()');
 await db.exec(periods.slice(gs,periods.indexOf('end $$;',gs)+7));
 await db.exec('create trigger period_guard before insert on finance_cost_events for each row execute function finance_private.guard_accrual_period()');
 await db.exec(readFileSync(financeRoot+'/scripts/internal-projects/atomic-cost-receiver.sql','utf8'));
 await db.exec(extract(read('20260826105013_finance_security_v1.sql'),'finance_private.can_access_project'));
 await db.exec(readFileSync(financeRoot+'/scripts/internal-projects/accepted-project-cost-read.sql','utf8'));
 await db.exec('grant execute on function public.finance_read_operations_project_cost_evidence_v1(uuid,uuid) to authenticated');
 const applied=new Map();
 return {
  async installCommand(){
   await db.exec(extract(read('20260826110915_finance_project_commands_v1.sql'),'public.finance_command_create_cost_line'));
   await db.exec(readFileSync(financeRoot+'/scripts/internal-projects/accepted-cost-command.sql','utf8'));
   await db.exec('grant usage on schema finance_private to authenticated; grant execute on function finance_private.preview_operations_cost_command_candidate(uuid,uuid,text) to authenticated; grant execute on function finance_private.apply_operations_cost_command_candidate(text,uuid,uuid,text,text,text,boolean) to authenticated');
  },
  async bind({sourceOrganization,sourceProject,stream,lineId,organization,project}){
   const line=randomUUID(),binding=randomUUID();
   await db.query("insert into finance_cost_lines(id,organization_id,project_id,category) values($1,$2,$3,'personnel')",[line,organization,project]);
   await db.query("insert into finance_private.operations_cost_bindings_candidate values($1,$2,$3,$4,$5,$6,$7,$8,'SEK')",[binding,sourceOrganization,sourceProject,stream,lineId,organization,project,line]);
   return line;
  },
  async apply(receipt,org){
   await db.exec('set role authenticated');
   try{let p=applied.get(receipt);if(!p){p=(await db.query("select finance_private.preview_operations_cost_command_candidate($1,$2,'2026-10') v",[org,receipt])).rows[0].v;assert.equal(p.ready,true,JSON.stringify(p));applied.set(receipt,p);}
    return(await db.query("select finance_private.apply_operations_cost_command_candidate($1,$2,$3,'2026-10',$4,'Synthetic explicit reviewer confirms whole stream',true) result",['integration-'+receipt,org,receipt,p.fingerprint])).rows[0].result;
   }finally{await db.exec('reset role');}
  },
  async denyGeneric(){
   const b=(await db.query('select * from finance_private.operations_cost_bindings_candidate limit 1')).rows[0];assert.ok(b);
   await assert.rejects(db.query("select finance_command_apply_cost_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",['spoof-double-post',b.project_id,b.cost_line_id,'actual_posted',1,0,0,'operations_personnel','spoof','spoof',99,'2026-10-12T18:00:00Z',null,JSON.stringify({fact_status:'approved',operations_binding_id:b.id})]),/explicit receipt review/);
  },
  async evidence(org,project){await db.exec('set role authenticated');try{return(await db.query('select finance_read_operations_project_cost_evidence_v1($1,$2) r',[org,project])).rows[0].r;}finally{await db.exec('reset role');}},
  async balances(){return(await db.query('select project_id,actual_minor::int,accrual_minor::int,forecast_minor::int from finance_cost_lines order by project_id')).rows},
  async eventCount(){return(await db.query('select count(*)::int n from finance_cost_events')).rows[0].n},
  async customerState(project){return(await db.query('select to_jsonb(p) state from finance_projects p where id=$1',[project])).rows[0].state},
 };
}
