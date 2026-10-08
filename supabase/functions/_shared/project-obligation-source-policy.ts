/** Explicit source-bound Operations policy. This command supplies no observed cost. */
export interface ObligationSourcePolicyCommand {
 schema_version:'operations-obligation-source-policy.v1';project_id:string;obligation_id:string;
 baseline_event_id:string;binding_event_id:string;expected_policy_revision:number;
 replaces_estimate_minor:number|null;consumes_commitment_minor:number|null;
 idempotency_key:string;reason:string;
}
export function validateObligationSourcePolicyCommand(value:unknown):ObligationSourcePolicyCommand{
 const keys=['schema_version','project_id','obligation_id','baseline_event_id','binding_event_id','expected_policy_revision','replaces_estimate_minor','consumes_commitment_minor','idempotency_key','reason'];
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_obligation_source_policy');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||v.schema_version!=='operations-obligation-source-policy.v1')throw new Error('invalid_obligation_source_policy');
 for(const k of ['project_id','obligation_id','baseline_event_id','binding_event_id'])if(typeof v[k]!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v[k] as string))throw new Error('invalid_obligation_source_policy_identity');
 if(typeof v.expected_policy_revision!=='number'||!Number.isSafeInteger(v.expected_policy_revision)||v.expected_policy_revision<0||v.expected_policy_revision>=Number.MAX_SAFE_INTEGER)throw new Error('invalid_obligation_source_policy_revision');
 for(const k of ['replaces_estimate_minor','consumes_commitment_minor'])if(v[k]!==null&&(typeof v[k]!=='number'||!Number.isSafeInteger(v[k])||(v[k] as number)<0))throw new Error('invalid_obligation_source_policy_money');
 for(const [k,min,max] of [['idempotency_key',12,200],['reason',3,1000]] as const)if(typeof v[k]!=='string'||(v[k] as string)!==(v[k] as string).trim()||Array.from(v[k] as string).length<min||Array.from(v[k] as string).length>max)throw new Error('invalid_obligation_source_policy_audit');
 return {...v,...Object.fromEntries(['project_id','obligation_id','baseline_event_id','binding_event_id'].map(k=>[k,(v[k] as string).toLowerCase()]))} as unknown as ObligationSourcePolicyCommand;
}
