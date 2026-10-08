/** Composition selects real local authority events; it cannot supply budgets or costs. */
export interface ScopeObligationCompositionCommand {
 schema_version:'operations-scope-obligation-compose.v1';economic_scope_id:string;expected_scope_revision:number;
 expected_membership_fingerprint:string;expected_composition_revision:number;currency:string;
 baseline_event_ids:string[];idempotency_key:string;reason:string;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validateScopeObligationCompositionCommand(value:unknown):ScopeObligationCompositionCommand {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_scope_obligation_composition');
 const v=value as Record<string,unknown>,keys=['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','currency','baseline_event_ids','idempotency_key','reason'];
 if(Object.keys(v).length!==9||!keys.every(k=>Object.hasOwn(v,k))||v.schema_version!=='operations-scope-obligation-compose.v1'||!uuid(v.economic_scope_id)||
 typeof v.expected_scope_revision!=='number'||!Number.isSafeInteger(v.expected_scope_revision)||v.expected_scope_revision<1||
 typeof v.expected_composition_revision!=='number'||!Number.isSafeInteger(v.expected_composition_revision)||v.expected_composition_revision<0||v.expected_composition_revision>=Number.MAX_SAFE_INTEGER||
 typeof v.expected_membership_fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(v.expected_membership_fingerprint)||typeof v.currency!=='string'||!/^[A-Z]{3}$/.test(v.currency)||
 !Array.isArray(v.baseline_event_ids)||v.baseline_event_ids.length>1000||!v.baseline_event_ids.every(uuid)||new Set(v.baseline_event_ids.map(id=>id.toLowerCase())).size!==v.baseline_event_ids.length)throw new Error('invalid_scope_obligation_composition');
 for(const [key,min,max] of [['idempotency_key',12,200],['reason',3,1000]] as const)if(typeof v[key]!=='string'||v[key]!==v[key].trim()||Array.from(v[key]).length<min||Array.from(v[key]).length>max)throw new Error('invalid_scope_composition_audit');
 return {...v,economic_scope_id:v.economic_scope_id.toLowerCase(),baseline_event_ids:v.baseline_event_ids.map(id=>id.toLowerCase()).sort()} as unknown as ScopeObligationCompositionCommand;
}
export function copiedBaselineTotals(baselines:Array<{estimate_minor:number|null;committed_minor:number|null}>):{selected_count:number;known_estimate_minor:number|null;known_commitment_minor:number|null;all_selected_estimates_known:boolean;all_selected_commitments_known:boolean}{
 if(!Array.isArray(baselines)||baselines.length>1000)throw new Error('invalid_scope_baseline_catalog');
 const sum=(key:'estimate_minor'|'committed_minor')=>{const values=baselines.map(b=>b[key]);if(values.some(v=>v!==null&&(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)))throw new Error('invalid_copied_baseline_minor');const known=values.filter((v):v is number=>v!==null);if(!known.length)return null;const n=Number(known.reduce((a,v)=>a+BigInt(v),0n));if(!Number.isSafeInteger(n))throw new Error('unsafe_scope_baseline_sum');return n;};
 return {selected_count:baselines.length,known_estimate_minor:sum('estimate_minor'),known_commitment_minor:sum('committed_minor'),all_selected_estimates_known:baselines.length>0&&baselines.every(b=>b.estimate_minor!==null),all_selected_commitments_known:baselines.length>0&&baselines.every(b=>b.committed_minor!==null)};
}
