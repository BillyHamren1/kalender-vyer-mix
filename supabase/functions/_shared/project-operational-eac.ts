import {calculateProjectCostObligation,type CostObligationInput,type CostObligationResult} from './project-cost-obligations.ts';
export type ForecastCategory='personnel'|'supplier'|'catering'|'other';
export interface ForecastSourceEvidence {source_id:string;source_system:'time'|'finance'|'catering'|'operations';source_stream_id:string;source_revision:number;source_fingerprint:string;}
export interface CapturedBookingBudget {organization_id:string;project_id:string;source_booking_id:string;source_revision:number|null;source_hash:string|null;mapping_version:string|null;currency:string;coverage:'verified'|'unavailable';amount_minor:number|null;raw_payload:unknown;}
export interface OperationalEACInput {
  schema_version:'operations-project-cost-forecast-input-v1';organization_id:string;project_id:string;currency:string;source_revision:number;
  scope_coverage:'complete'|'unresolved';scope_reference:string;
  category_coverage:Array<{category:ForecastCategory;coverage:'complete'|'unavailable';source_reference:string}>;
  booking_budgets:CapturedBookingBudget[];
  obligations:Array<{category:ForecastCategory;baseline_revision:number;baseline_fingerprint:string;input:CostObligationInput;source_evidence:ForecastSourceEvidence[]}>;
}
export interface OperationalEACSnapshot {
  schema_version:'operations-project-cost-forecast-v1';calculation_version:'operations-project-obligation-forecast-v1';
  organization_id:string;project_id:string;currency:string;source_revision:number;input_fingerprint:string;
  coverage:'complete'|'unavailable';issues:string[];confirmed_minor:number;preliminary_minor:number;known_cost_minor:number;
  remaining_minor:number|null;eac_minor:number|null;budget_minor:number|null;budget_variance_minor:number|null;
  calculated_obligations:Array<{category:ForecastCategory;baseline_revision:number;baseline_fingerprint:string;result:CostObligationResult}>;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&v.length>=1&&v.length<=256;
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const exact=(v:unknown,keys:string[]):boolean=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const categories:ForecastCategory[]=['personnel','supplier','catering','other'];
const utf8Order=(a:string,b:string)=>{const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]-bb[i];return aa.length-bb.length;};
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v!==null&&typeof v==='object'){if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new Error('invalid_forecast_json');return Object.fromEntries(Object.entries(v).sort(([a],[b])=>utf8Order(a,b)).map(([k,x])=>[k,canonical(x)]));}if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;throw new Error('invalid_forecast_json');}
export function serializeOperationalEACInput(input:OperationalEACInput):string{return JSON.stringify(canonical(input));}
export async function operationalEACInputFingerprint(input:OperationalEACInput):Promise<string>{const raw=serializeOperationalEACInput(input);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');}
const sum=(values:number[])=>{const result=values.reduce((total,value)=>total+BigInt(value),0n);const number=Number(result);if(!Number.isSafeInteger(number))throw new Error('unsafe_project_forecast_sum');return number;};
/** Operations-only isolated contract. No source mapper or active service is implied. */
export async function calculateOperationalEAC(input:OperationalEACInput):Promise<OperationalEACSnapshot>{
  if(!exact(input,['schema_version','organization_id','project_id','currency','source_revision','scope_coverage','scope_reference','category_coverage','booking_budgets','obligations'])||input.schema_version!=='operations-project-cost-forecast-input-v1'||!uuid(input.organization_id)||!uuid(input.project_id)||
    typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency)||!positive(input.source_revision)||!['complete','unresolved'].includes(input.scope_coverage)||!text(input.scope_reference)||
    !Array.isArray(input.category_coverage)||input.category_coverage.length!==4||!Array.isArray(input.obligations)||input.obligations.length>1000||
    !Array.isArray(input.booking_budgets)||input.booking_budgets.length>1000)throw new Error('invalid_project_forecast_input');
  const categorySet=new Set<ForecastCategory>(),issues:string[]=[];
  if(input.scope_coverage!=='complete')issues.push('unresolved_project_scope');
  for(const category of input.category_coverage){if(!exact(category,['category','coverage','source_reference'])||!categories.includes(category.category)||categorySet.has(category.category)||
    !['complete','unavailable'].includes(category.coverage)||!text(category.source_reference))throw new Error('invalid_forecast_category_coverage');
    categorySet.add(category.category);if(category.coverage!=='complete')issues.push('unavailable_category:'+category.category);}
  const obligations=new Set<string>(),sources=new Set<string>();const calculated:OperationalEACSnapshot['calculated_obligations']=[];
  for(const obligation of input.obligations){const scoped=obligation.input;
    if(!exact(obligation,['category','baseline_revision','baseline_fingerprint','input','source_evidence'])||!categories.includes(obligation.category)||!positive(obligation.baseline_revision)||!hash(obligation.baseline_fingerprint)||
      !scoped||scoped.organization_id!==input.organization_id||scoped.project_id!==input.project_id||scoped.currency!==input.currency||
      !uuid(scoped.obligation_id)||obligations.has(scoped.obligation_id.toLowerCase())||!Array.isArray(scoped.sources)||!Array.isArray(obligation.source_evidence)||obligation.source_evidence.length!==scoped.sources.length)throw new Error('invalid_forecast_obligation_scope');
    obligations.add(scoped.obligation_id.toLowerCase());const evidence=new Map<string,ForecastSourceEvidence>();
    for(const source of obligation.source_evidence){if(!exact(source,['source_id','source_system','source_stream_id','source_revision','source_fingerprint'])||!text(source.source_id)||!text(source.source_stream_id)||!positive(source.source_revision)||!hash(source.source_fingerprint)||
      !['time','finance','catering','operations'].includes(source.source_system)||evidence.has(source.source_id))throw new Error('invalid_forecast_source_evidence');evidence.set(source.source_id,source);}
    for(const source of scoped.sources){if(!evidence.has(source.source_id)||sources.has(source.source_id))throw new Error('duplicate_or_unproven_forecast_source');sources.add(source.source_id);}
    if(sources.size>10000)throw new Error('too_many_forecast_sources');
    const result=calculateProjectCostObligation(scoped);if(result.coverage!=='complete')issues.push(...result.issues.map(issue=>scoped.obligation_id+':'+issue));
    calculated.push({category:obligation.category,baseline_revision:obligation.baseline_revision,baseline_fingerprint:obligation.baseline_fingerprint,result});
  }
  const bookingIds=new Set<string>();let budgetAvailable=input.booking_budgets.length>0;const budgets:number[]=[];
  for(const budget of input.booking_budgets){if(!exact(budget,['organization_id','project_id','source_booking_id','source_revision','source_hash','mapping_version','currency','coverage','amount_minor','raw_payload'])||budget.organization_id!==input.organization_id||budget.project_id!==input.project_id||
    !uuid(budget.source_booking_id)||bookingIds.has(budget.source_booking_id.toLowerCase())||budget.currency!==input.currency||!['verified','unavailable'].includes(budget.coverage)||
    (budget.source_revision!==null&&!positive(budget.source_revision))||(budget.source_hash!==null&&!hash(budget.source_hash))||
    (budget.mapping_version!==null&&!text(budget.mapping_version))||(budget.amount_minor!==null&&(!Number.isSafeInteger(budget.amount_minor)||budget.amount_minor<0)))throw new Error('invalid_captured_booking_budget');
    bookingIds.add(budget.source_booking_id.toLowerCase());canonical(budget.raw_payload);
    if(budget.coverage==='verified'){if(budget.amount_minor===null||budget.source_revision===null||budget.source_hash===null||budget.mapping_version===null)throw new Error('unproven_verified_booking_budget');budgets.push(budget.amount_minor);}
    else {if(budget.amount_minor!==null)throw new Error('unavailable_booking_budget_has_money');budgetAvailable=false;}
  }
  const confirmed=sum(calculated.map(x=>x.result.confirmed_minor)),preliminary=sum(calculated.map(x=>x.result.preliminary_minor)),known=sum([confirmed,preliminary]);
  const complete=issues.length===0,remaining=complete?sum(calculated.map(x=>x.result.remaining_minor!)):null;
  const eac=remaining===null?null:sum([known,remaining]),budget=budgetAvailable?sum(budgets):null;
  return {schema_version:'operations-project-cost-forecast-v1',calculation_version:'operations-project-obligation-forecast-v1',organization_id:input.organization_id,
    project_id:input.project_id,currency:input.currency,source_revision:input.source_revision,input_fingerprint:await operationalEACInputFingerprint(input),
    coverage:complete?'complete':'unavailable',issues,confirmed_minor:confirmed,preliminary_minor:preliminary,known_cost_minor:known,remaining_minor:remaining,eac_minor:eac,
    budget_minor:budget,budget_variance_minor:budget===null||eac===null?null:sum([budget,-eac]),calculated_obligations:calculated};
}
