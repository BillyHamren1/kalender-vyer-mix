import {describe,it,expect} from 'vitest';
import {validateCreditObligationAssignmentCommand} from './project-obligation-credit-assignment.ts';
const id='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const command={schema_version:'operations-obligation-credit-assign.v1',project_id:id,obligation_id:id,expected_baseline_revision:1,credit_snapshot_id:id,credit_allocation_id:id,expected_credit_economic_revision:1,expected_credit_economic_fingerprint:'a'.repeat(64),expected_original_binding_event_id:id,expected_assignment_revision:0,idempotency_key:'synthetic-credit-assignment',reason:'Explicit own credit assignment'};
describe('own-credit assignment command',()=>{
 it('normalizes validated identifiers without accepting money or actor fields',()=>{expect(validateCreditObligationAssignmentCommand(command).project_id).toBe(id.toLowerCase());for(const key of ['amount_minor','actor','credit_eligible','credited_source_anchor'])expect(()=>validateCreditObligationAssignmentCommand({...command,[key]:0})).toThrow();});
 it('requires exact keys and strict UUID strings',()=>{const {reason,...missing}=command;expect(()=>validateCreditObligationAssignmentCommand(missing)).toThrow();expect(()=>validateCreditObligationAssignmentCommand({...command,credit_snapshot_id:[id]})).toThrow();});
 it('bounds all counters and prevents publication overflow',()=>{for(const v of ['1',1.5,-1,Number.MAX_SAFE_INTEGER+1])expect(()=>validateCreditObligationAssignmentCommand({...command,expected_credit_economic_revision:v})).toThrow();expect(()=>validateCreditObligationAssignmentCommand({...command,expected_assignment_revision:Number.MAX_SAFE_INTEGER})).toThrow();});
 it('keeps hashes lowercase and text trimmed and bounded',()=>{for(const patch of [{expected_credit_economic_fingerprint:'A'.repeat(64)},{reason:' reason '},{idempotency_key:'short'},{reason:['okay']}])expect(()=>validateCreditObligationAssignmentCommand({...command,...patch})).toThrow();});
});
