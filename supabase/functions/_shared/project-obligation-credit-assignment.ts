/** Command contract only. Saved source hashes do not authorize a credit or an obligation. */
export interface CreditObligationAssignmentCommand {
  schema_version:'operations-obligation-credit-assign.v1';project_id:string;obligation_id:string;
  expected_baseline_revision:number;credit_snapshot_id:string;credit_allocation_id:string;
  expected_credit_economic_revision:number;expected_credit_economic_fingerprint:string;
  expected_original_binding_event_id:string;expected_assignment_revision:number;
  idempotency_key:string;reason:string;
}
const keys=['schema_version','project_id','obligation_id','expected_baseline_revision','credit_snapshot_id','credit_allocation_id','expected_credit_economic_revision','expected_credit_economic_fingerprint','expected_original_binding_event_id','expected_assignment_revision','idempotency_key','reason'];
const ids=['project_id','obligation_id','credit_snapshot_id','credit_allocation_id','expected_original_binding_event_id'];
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v===v.trim()&&Array.from(v).length>=min&&Array.from(v).length<=max;
export function validateCreditObligationAssignmentCommand(raw:unknown):CreditObligationAssignmentCommand {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid_credit_obligation_assignment');
  const value=raw as Record<string,unknown>;
  if(Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k))||value.schema_version!=='operations-obligation-credit-assign.v1'||
    !ids.every(k=>uuid(value[k]))||!count(value.expected_baseline_revision,1)||!count(value.expected_credit_economic_revision,1)||
    !count(value.expected_assignment_revision,0,Number.MAX_SAFE_INTEGER-1)||typeof value.expected_credit_economic_fingerprint!=='string'||
    !/^[0-9a-f]{64}$/.test(value.expected_credit_economic_fingerprint)||!text(value.idempotency_key,12,200)||!text(value.reason,3,1000))throw new Error('invalid_credit_obligation_assignment');
  return {...value,...Object.fromEntries(ids.map(k=>[k,(value[k] as string).toLowerCase()]))} as unknown as CreditObligationAssignmentCommand;
}
