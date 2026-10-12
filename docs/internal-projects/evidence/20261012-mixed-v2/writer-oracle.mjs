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
 return {
  async bind({sourceOrganization,sourceProject,stream,lineId,organization,project}){
   const line=randomUUID(),binding=randomUUID();
   await db.query("insert into finance_cost_lines(id,organization_id,project_id,category) values($1,$2,$3,'personnel')",[line,organization,project]);
   await db.query("insert into finance_private.operations_cost_bindings_candidate values($1,$2,$3,$4,$5,$6,$7,$8,'SEK')",[binding,sourceOrganization,sourceProject,stream,lineId,organization,project,line]);
   return line;
  },
  async apply(receipt){return(await db.query("select finance_private.receive_operations_cost_stream_candidate($1,'2026-10') result",[receipt])).rows[0].result},
  async balances(){return(await db.query('select project_id,actual_minor::int,accrual_minor::int,forecast_minor::int from finance_cost_lines order by project_id')).rows},
  async eventCount(){return(await db.query('select count(*)::int n from finance_cost_events')).rows[0].n},
  async customerState(project){return(await db.query('select to_jsonb(p) state from finance_projects p where id=$1',[project])).rows[0].state},
 };
}
