/** Command contracts only. Authorization/current-source resolution is performed by the database. */
export interface ManualObligationBaselineCommand {
  schema_version: 'operations-obligation-manual-baseline.v1';
  project_id: string; obligation_id: string; expected_revision: number;
  currency: string; category: 'personnel'|'supplier'|'catering'|'other';
  cost_basis: 'time'|'invoice'|'other'; estimate_minor: number|null; committed_minor: number|null;
  idempotency_key: string; reason: string;
}
export interface InvoiceObligationBindingCommand {
  schema_version: 'operations-obligation-invoice-bind.v1';
  project_id: string; obligation_id: string; expected_obligation_revision: number;
  source_snapshot_id: string; source_allocation_id: string;
  expected_economic_revision: number; expected_economic_fingerprint: string;
  idempotency_key: string; reason: string;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const counter=(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v===v.trim()&&Array.from(v).length>=min&&Array.from(v).length<=max;
const money=(v:unknown)=>v===null||counter(v,0);
export function validateManualObligationBaselineCommand(value:unknown):ManualObligationBaselineCommand {
  if(!exact(value,['schema_version','project_id','obligation_id','expected_revision','currency','category','cost_basis','estimate_minor','committed_minor','idempotency_key','reason'])||
    value.schema_version!=='operations-obligation-manual-baseline.v1'||!uuid(value.project_id)||!uuid(value.obligation_id)||!counter(value.expected_revision,0,Number.MAX_SAFE_INTEGER-1)||
    typeof value.currency!=='string'||!/^[A-Z]{3}$/.test(value.currency)||typeof value.category!=='string'||!['personnel','supplier','catering','other'].includes(value.category)||
    typeof value.cost_basis!=='string'||!['time','invoice','other'].includes(value.cost_basis)||!money(value.estimate_minor)||!money(value.committed_minor)||
    !text(value.idempotency_key,12,200)||!text(value.reason,3,1000))throw new Error('invalid_manual_obligation_baseline');
  return {...value,project_id:value.project_id.toLowerCase(),obligation_id:value.obligation_id.toLowerCase()} as unknown as ManualObligationBaselineCommand;
}
export function validateInvoiceObligationBindingCommand(value:unknown):InvoiceObligationBindingCommand {
  if(!exact(value,['schema_version','project_id','obligation_id','expected_obligation_revision','source_snapshot_id','source_allocation_id','expected_economic_revision','expected_economic_fingerprint','idempotency_key','reason'])||
    value.schema_version!=='operations-obligation-invoice-bind.v1'||!uuid(value.project_id)||!uuid(value.obligation_id)||!uuid(value.source_snapshot_id)||!uuid(value.source_allocation_id)||
    !counter(value.expected_obligation_revision,1)||!counter(value.expected_economic_revision,1)||!hash(value.expected_economic_fingerprint)||!text(value.idempotency_key,12,200)||!text(value.reason,3,1000))throw new Error('invalid_invoice_obligation_binding');
  return {...value,...Object.fromEntries(['project_id','obligation_id','source_snapshot_id','source_allocation_id'].map(k=>[k,(value[k] as string).toLowerCase()]))} as unknown as InvoiceObligationBindingCommand;
}
/** Hash is identity/integrity only; it does not authorize a source or bind an obligation. */
export async function invoiceAllocationSourceAnchor(value:{source_organization_id:string;invoice_id:string;allocation_id:string;document_fingerprint:string;currency:string}):Promise<string>{
  if(!exact(value,['source_organization_id','invoice_id','allocation_id','document_fingerprint','currency'])||!uuid(value.source_organization_id)||!uuid(value.invoice_id)||!uuid(value.allocation_id)||!hash(value.document_fingerprint)||typeof value.currency!=='string'||!/^[A-Z]{3}$/.test(value.currency))throw new Error('invalid_invoice_source_anchor');
  const raw=['finance-invoice-allocation-source-anchor-v1',value.source_organization_id.toLowerCase(),value.invoice_id.toLowerCase(),value.allocation_id.toLowerCase(),value.document_fingerprint,value.currency].join('\n');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
}
