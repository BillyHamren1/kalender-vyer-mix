import {describe,it,expect} from 'vitest';
import {calculateOperationalEAC as calculate,type OperationalEACInput} from './project-operational-eac.ts';
const org='11111111-1111-4111-8111-111111111111',project='55555555-5555-4555-8555-555555555555',obligation='88888888-8888-4888-8888-888888888888';
export function operationalEACFixture():OperationalEACInput{return {schema_version:'operations-project-cost-forecast-input-v1',organization_id:org,project_id:project,currency:'SEK',source_revision:1,
  scope_coverage:'complete',scope_reference:'synthetic-complete-project-catalog-v1',category_coverage:['personnel','supplier','catering','other'].map(category=>({category:category as any,coverage:'complete',source_reference:'synthetic-authoritative-category-inventory'})),
  booking_budgets:[6000,4000].map((amount,i)=>({organization_id:org,project_id:project,source_booking_id:i===0?'66666666-6666-4666-8666-666666666666':'77777777-7777-4777-8777-777777777777',
    source_revision:1,source_hash:'a'.repeat(64),mapping_version:'synthetic-budget-map-v1',currency:'SEK',coverage:'verified',amount_minor:amount,raw_payload:{explicitSyntheticBudget:amount}})),
  obligations:[{category:'supplier',baseline_revision:1,baseline_fingerprint:'b'.repeat(64),input:{organization_id:org,project_id:project,obligation_id:obligation,currency:'SEK',cost_basis:'invoice',
    estimate_minor:10000,committed_minor:10000,relation_coverage:'complete',sources:[{source_id:'finance:invoice-allocation-a',organization_id:org,project_id:project,obligation_id:obligation,currency:'SEK',kind:'invoice',
      status:'preliminary',amount_minor:5400,replaces_estimate_minor:5000,consumes_commitment_minor:5000,credited_source_id:null,relation_coverage:'complete'}]},
    source_evidence:[{source_id:'finance:invoice-allocation-a',source_system:'finance',source_stream_id:'synthetic-invoice-stream',source_revision:1,source_fingerprint:'c'.repeat(64)}]}]};}
describe('Operations durable forecast calculator contract',()=>{
  it('aggregates multiple Booking budgets and a partially consumed obligation once',async()=>{
    const input=operationalEACFixture(),before=JSON.stringify(input),result=await calculate(input);
    expect(result.eac_minor).toBe(10400);expect(result.remaining_minor).toBe(5000);expect(result.budget_minor).toBe(10000);expect(result.budget_variance_minor).toBe(-400);
    expect(result.input_fingerprint).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(input)).toBe(before);
  });
  it('confirmation changes status breakdown while keeping Operations EAC and copied source amount',async()=>{
    const input=operationalEACFixture(),a=await calculate(input);input.source_revision=2;input.obligations[0].input.sources[0].status='confirmed';
    const b=await calculate(input);expect(b.eac_minor).toBe(a.eac_minor);expect(b.confirmed_minor).toBe(5400);expect(b.preliminary_minor).toBe(0);expect(b.input_fingerprint).not.toBe(a.input_fingerprint);
  });
  it('unknown baseline or uncovered cost category withholds remaining cost and EAC',async()=>{
    const input=operationalEACFixture();input.obligations[0].input.estimate_minor=null;let result=await calculate(input);
    expect(result.known_cost_minor).toBe(5400);expect(result.remaining_minor).toBeNull();expect(result.eac_minor).toBeNull();expect(result.coverage).toBe('unavailable');
    const other=operationalEACFixture();other.category_coverage[2].coverage='unavailable';result=await calculate(other);expect(result.eac_minor).toBeNull();expect(result.issues).toContain('unavailable_category:catering');
  });
  it('captures unavailable legacy Booking JSON without inventing a zero or budget mapping',async()=>{
    const input=operationalEACFixture();input.booking_budgets[0]={...input.booking_budgets[0],coverage:'unavailable',source_hash:null,mapping_version:null,amount_minor:null,raw_payload:{hours:80,rate:450,economics_data:{unknownTotal:999999}}};
    const result=await calculate(input);expect(result.eac_minor).toBe(10400);expect(result.budget_minor).toBeNull();expect(result.budget_variance_minor).toBeNull();
    input.booking_budgets[0].amount_minor=0;await expect(calculate(input)).rejects.toThrow('unavailable_booking_budget_has_money');
  });
  it('credits lower actual costs while hired time does not compete with explicit invoice authority',async()=>{
    const input=operationalEACFixture(),o=input.obligations[0];
    o.input.sources.push({...o.input.sources[0],source_id:'time:hired-evidence',kind:'time',amount_minor:6000,replaces_estimate_minor:0,consumes_commitment_minor:0});
    o.source_evidence.push({...o.source_evidence[0],source_id:'time:hired-evidence',source_system:'time'});
    expect((await calculate(input)).eac_minor).toBe(10400);
    o.input.sources.push({...o.input.sources[0],source_id:'finance:credit-allocation-a',kind:'credit',amount_minor:-1400,replaces_estimate_minor:0,consumes_commitment_minor:0,credited_source_id:o.input.sources[0].source_id});
    o.source_evidence.push({...o.source_evidence[0],source_id:'finance:credit-allocation-a'});
    expect((await calculate(input)).eac_minor).toBe(9000);
  });
  it('rejects duplicate allocation consumption, missing immutable evidence and cross-project scope',async()=>{
    const input=operationalEACFixture();input.obligations.push(structuredClone(input.obligations[0]));input.obligations[1].input.obligation_id='99999999-9999-4999-8999-999999999999';
    await expect(calculate(input)).rejects.toThrow('duplicate_or_unproven_forecast_source');
    const missing=operationalEACFixture();missing.obligations[0].source_evidence=[];await expect(calculate(missing)).rejects.toThrow('invalid_forecast_obligation_scope');
    const foreign=operationalEACFixture();foreign.obligations[0].input.project_id='99999999-9999-4999-8999-999999999999';await expect(calculate(foreign)).rejects.toThrow('invalid_forecast_obligation_scope');
  });
  it('rejects unsupported JSON provenance and unsafe aggregate budgets',async()=>{
    const input=operationalEACFixture();input.booking_budgets[0].raw_payload={missing:undefined};await expect(calculate(input)).rejects.toThrow('invalid_forecast_json');
    const overflow=operationalEACFixture();overflow.booking_budgets.forEach(b=>b.amount_minor=Number.MAX_SAFE_INTEGER);await expect(calculate(overflow)).rejects.toThrow('unsafe_project_forecast_sum');
  });
});
