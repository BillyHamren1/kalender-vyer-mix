import { describe, it, expect } from 'vitest';
import { validateProjectNativeCostEvidence } from './projectNativeCostEvidence';
const org='11111111-1111-4111-8111-111111111111',project='55555555-5555-4555-8555-555555555555';
const row=()=>({streamKey:'a'.repeat(64),obligationId:project,revision:2,sourceEntryVersion:1,workDate:'2026-09-30',minutes:105,amountMinor:52502 as number|null,currency:'SEK',status:'preliminary',coverage:'complete',sourceStatus:'approved',publishedAt:'2026-10-02T00:00:00Z'});
const evidence=()=>({schema:'operations-project-cost-evidence.v2',organizationId:org,projectId:project,generatedAt:'2026-10-02T00:00:00Z',personnel:[],invoices:[],missingPersonnelCostCount:0,catering:[row()],missingCateringCostCount:0});
describe('Native Catering project read v2',()=>{
 it('copies saved rounding, and payroll approval never implies project confirmation',()=>{
  const data=validateProjectNativeCostEvidence(evidence(),org,project);expect(data.catering[0].amountMinor).toBe(52502);expect(data.catering[0].status).toBe('preliminary');
  const input=evidence();input.catering[0].amountMinor=52503;expect(validateProjectNativeCostEvidence(input,org,project).catering[0].amountMinor).toBe(52503);
 });
 it('keeps missing rates null with exact nonrejected missing count',()=>{
  const input=evidence();input.catering[0].amountMinor=null;input.catering[0].coverage='missing_rate';input.missingCateringCostCount=1;
  expect(validateProjectNativeCostEvidence(input,org,project).catering[0].amountMinor).toBeNull();
  expect(()=>validateProjectNativeCostEvidence({...input,missingCateringCostCount:0},org,project)).toThrow();
  input.catering[0].amountMinor=0;expect(()=>validateProjectNativeCostEvidence(input,org,project)).toThrow();
 });
 it('validates base tenant/project/security and native private-field rejection',()=>{
  expect(()=>validateProjectNativeCostEvidence(evidence(),project,project)).toThrow();
  expect(()=>validateProjectNativeCostEvidence(evidence(),org,org)).toThrow();
  expect(()=>validateProjectNativeCostEvidence({...evidence(),catering:[{...row(),hourly_rate_minor:30001}]},org,project)).toThrow();
  expect(()=>validateProjectNativeCostEvidence({...evidence(),schema:'operations-project-cost-evidence.v1'},org,project)).toThrow();
  expect(()=>validateProjectNativeCostEvidence({...evidence(),generatedAt:'2026-02-30T00:00:00Z'},org,project)).toThrow();
 });
 it('rejects duplicate streams, array enums, unsafe/minus money and invalid dates',()=>{
  expect(()=>validateProjectNativeCostEvidence({...evidence(),catering:[row(),row()]},org,project)).toThrow();
  for(const bad of [{sourceStatus:['approved']},{status:['preliminary']},{amountMinor:-1},{amountMinor:Number.MAX_SAFE_INTEGER+1},{workDate:'2026-02-30'},{streamKey:'catering:private-worker'},{publishedAt:'2026-02-30T00:00:00Z'},{publishedAt:'2026-10-02T00:00:00'},{publishedAt:'2026-10-02T00Z'}])
   expect(()=>validateProjectNativeCostEvidence({...evidence(),catering:[{...row(),...bad}]},org,project)).toThrow();
 });
 it('global source rejection overrides independent project decision and excludes missing count',()=>{
  const input=evidence();input.catering[0].sourceStatus='rejected';input.catering[0].status='confirmed';
  expect(()=>validateProjectNativeCostEvidence(input,org,project)).toThrow();
  input.catering[0].status='rejected';input.catering[0].coverage='missing_rate';input.catering[0].amountMinor=null;
  expect(validateProjectNativeCostEvidence(input,org,project).missingCateringCostCount).toBe(0);
 });
 it('keeps empty evidence empty instead of a manufactured zero cost row',()=>{
  expect(validateProjectNativeCostEvidence({...evidence(),catering:[]},org,project).catering).toEqual([]);
 });
});
