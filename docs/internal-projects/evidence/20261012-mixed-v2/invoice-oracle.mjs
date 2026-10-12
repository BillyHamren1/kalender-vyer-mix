// Disposable rows in genuine Finance invoice schema; never sends or issues invoices.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function prepareInvoiceOracle(db,financeRoot,{organization,project,booking}){
 const security=readFileSync(financeRoot+'/supabase/migrations/20260826105013_finance_security_v1.sql','utf8');
 for(const name of ['is_org_member','can_access_project']){
  const start=security.indexOf('create or replace function finance_private.'+name+'(');assert.ok(start>=0);
  await db.exec(security.slice(start,security.indexOf('$$;',start)+3));
 }
 await db.exec(readFileSync(new URL('./invoice-sources/20260831113700_finance_customer_billing_shadow_v1.sql',import.meta.url),'utf8'));
 const invoice=randomUUID();
 await db.query("insert into finance_customer_invoice_documents(id,organization_id,project_id,kind,status,currency,net_minor,vat_minor,idempotency_key) values($1,$2,$3,'invoice','created','SEK',500000,125000,'synthetic-existing-invoice')",[invoice,organization,project]);
 await db.query('insert into finance_customer_invoice_document_sources values($1,$2,$3,1)',[invoice,organization,booking]);
 await db.query("insert into finance_customer_invoice_recipient_snapshots(invoice_id,organization_id,recipient_json) values($1,$2,'{\"name\":\"Synthetic recipient\"}')",[invoice,organization]);
 const tables=['finance_customer_commercial_snapshots','finance_customer_invoice_plans','finance_customer_invoice_plan_steps','finance_customer_invoice_documents','finance_customer_invoice_document_sources','finance_customer_invoice_recipient_snapshots','finance_customer_invoice_row_snapshots','finance_customer_invoice_step_executions'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query('select to_jsonb(t) row from '+table+' t order by to_jsonb(t)::text')).rows.map(x=>x.row)])));
 const before=await snapshot();
 return {assertUnchanged:async()=>assert.deepEqual(await snapshot(),before,'canonical invoice state changed during metadata/cost application')};
}
