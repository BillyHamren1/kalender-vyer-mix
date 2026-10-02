import {describe,it,expect} from 'vitest';import{validateCreditCapacityCommand}from'./project-obligation-credit-capacity.ts';
const id='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';const c={schema_version:'operations-obligation-credit-capacity.v1',project_id:id,obligation_id:id,assignment_event_id:id,expected_capacity_revision:0,idempotency_key:'synthetic-credit-capacity',reason:'Explicit actual source capacity'};
describe('source-derived credit capacity command',()=>{
 it('normalizes only strict identifiers',()=>{expect(validateCreditCapacityCommand(c).assignment_event_id).toBe(id.toLowerCase());expect(()=>validateCreditCapacityCommand({...c,assignment_event_id:[id]})).toThrow();});
 it('excludes caller pricing/eligibility and actor',()=>{for(const key of ['reserved_minor','original_amount_minor','credit_eligible','actor'])expect(()=>validateCreditCapacityCommand({...c,[key]:0})).toThrow();});
 it('uses safe CAS bounds and exact text/schema',()=>{for(const expected_capacity_revision of ['0',0.5,-1,Number.MAX_SAFE_INTEGER])expect(()=>validateCreditCapacityCommand({...c,expected_capacity_revision})).toThrow();expect(()=>validateCreditCapacityCommand({...c,reason:' reason '})).toThrow();const{reason,...missing}=c;expect(()=>validateCreditCapacityCommand(missing)).toThrow();});
});
