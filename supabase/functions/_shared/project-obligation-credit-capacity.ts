/** Explicit capacity command only; source amounts and authority remain server-derived. */
export interface CreditCapacityCommand {
 schema_version:'operations-obligation-credit-capacity.v1';project_id:string;obligation_id:string;
 assignment_event_id:string;expected_capacity_revision:number;idempotency_key:string;reason:string;
}
const keys=['schema_version','project_id','obligation_id','assignment_event_id','expected_capacity_revision','idempotency_key','reason'];
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v===v.trim()&&Array.from(v).length>=min&&Array.from(v).length<=max;
export function validateCreditCapacityCommand(raw:unknown):CreditCapacityCommand{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid_credit_capacity_command');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||v.schema_version!=='operations-obligation-credit-capacity.v1'||
 !uuid(v.project_id)||!uuid(v.obligation_id)||!uuid(v.assignment_event_id)||typeof v.expected_capacity_revision!=='number'||!Number.isSafeInteger(v.expected_capacity_revision)||v.expected_capacity_revision<0||v.expected_capacity_revision>=Number.MAX_SAFE_INTEGER||!text(v.idempotency_key,12,200)||!text(v.reason,3,1000))throw new Error('invalid_credit_capacity_command');
 return {...v,project_id:v.project_id.toLowerCase(),obligation_id:v.obligation_id.toLowerCase(),assignment_event_id:v.assignment_event_id.toLowerCase()} as unknown as CreditCapacityCommand;
}
