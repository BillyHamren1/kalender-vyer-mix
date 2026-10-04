import { describe, it, expect } from 'vitest';
import { validateProjectCostEvidence, formatEvidenceMinorAmount } from './projectCostEvidence';
const org='11111111-1111-4111-8111-111111111111', project='55555555-5555-4555-8555-555555555555';
const stamp='2026-10-02T00:00:00Z';
const row=()=>({streamKey:'a'.repeat(64),reportId:'22222222-2222-4222-8222-222222222222',lineId:'line-a',revision:3,timeVersion:2,workDate:'2026-10-01',minutes:90,amountMinor:45000,currency:'SEK',status:'preliminary',coverage:'complete',publishedAt:stamp,financeDeliveryState:null,financeCurrentRevision:null});
const invoice=()=>({sourceOrganizationId:'33333333-3333-4333-8333-333333333333',invoiceId:'44444444-4444-4444-8444-444444444444',allocationId:'66666666-6666-4666-8666-666666666666',revision:2,documentNumber:'F-1',kind:'invoice',amountMinor:540000,currency:'SEK',status:'preliminary',accountingState:'booked',settlementState:'paid',providerApprovalState:'not_pending',providerSourceChanged:false,creditRelationCoverage:'not_applicable',receivedAt:stamp});
const evidence=()=>({schema:'operations-project-cost-evidence.v1',organizationId:org,projectId:project,generatedAt:stamp,personnel:[row()],invoices:[invoice()],missingPersonnelCostCount:0});
describe('Operations received project cost evidence',()=>{
  it('preserves independently preliminary invoice even when booked and paid',()=>{
    const output=validateProjectCostEvidence(evidence(),org,project);
    expect(output.invoices[0].status).toBe('preliminary');expect(output.personnel[0].amountMinor).toBe(45000);
  });
  it('does not calculate a personnel amount from minutes',()=>{
    const value=evidence();value.personnel[0].amountMinor=45001;
    expect(validateProjectCostEvidence(value,org,project).personnel[0].amountMinor).toBe(45001);
  });
  it('retains missing cost as null and validates nonrejected coverage',()=>{
    const value={...evidence(),personnel:[{...row(),coverage:'missing_rate',amountMinor:null}],missingPersonnelCostCount:1};
    expect(validateProjectCostEvidence(value,org,project).personnel[0].amountMinor).toBeNull();
    expect(()=>validateProjectCostEvidence({...value,missingPersonnelCostCount:0},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...value,personnel:[{...value.personnel[0],amountMinor:0}]},org,project)).toThrow();
  });
  it('rejects foreign tenant, project, secret rate fields and enum arrays',()=>{
    expect(()=>validateProjectCostEvidence(evidence(),project,project)).toThrow();
    expect(()=>validateProjectCostEvidence(evidence(),org,org)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[{...row(),hourlyRateMinor:30000}]},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),invoices:[{...invoice(),status:['preliminary']}]},org,project)).toThrow();
  });
  it('rejects repeated money identities while allowing split invoice allocations',()=>{
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[row(),row()]},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),invoices:[invoice(),invoice()]},org,project)).toThrow();
    expect(validateProjectCostEvidence({...evidence(),invoices:[invoice(),{...invoice(),allocationId:project}]},org,project).invoices).toHaveLength(2);
  });
  it('preserves unresolved signed credit without guessing its obligation',()=>{
    const value={...evidence(),invoices:[{...invoice(),kind:'credit',amountMinor:-540000,creditRelationCoverage:'unresolved'}]};
    expect(validateProjectCostEvidence(value,org,project).invoices[0].amountMinor).toBe(-540000);
    expect(()=>validateProjectCostEvidence({...value,invoices:[{...value.invoices[0],amountMinor:540000}]},org,project)).toThrow();
  });
  it('distinguishes no received evidence from a manufactured zero row',()=>{
    expect(validateProjectCostEvidence({...evidence(),personnel:[],invoices:[]},org,project).personnel).toEqual([]);
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[{...row(),workDate:'2026-02-30'}]},org,project)).toThrow();
  });
  it('formats all safe minor digits exactly, including negative subunit credits',()=>{
    expect(formatEvidenceMinorAmount(Number.MAX_SAFE_INTEGER,'SEK').replace(/[\s\u00a0]/g,'')).toBe('90071992547409,91kr');
    expect(formatEvidenceMinorAmount(-1,'SEK').replace(/[\s\u00a0]/g,'')).toBe('−0,01kr');
  });
  it('rejects false Finance acknowledgments, while preserving later-version reconciliation',()=>{
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[{...row(),financeDeliveryState:'delivered'}]},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[{...row(),financeDeliveryState:'delivered',financeCurrentRevision:2}]},org,project)).toThrow();
    expect(validateProjectCostEvidence({...evidence(),personnel:[{...row(),financeDeliveryState:'delivered',financeCurrentRevision:4}]},org,project).personnel[0].financeCurrentRevision).toBe(4);
  });
  it('does not accept confirmed changed-source invoice or unlinked credit as reconciled',()=>{
    expect(()=>validateProjectCostEvidence({...evidence(),invoices:[{...invoice(),status:'confirmed',providerSourceChanged:true}]},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),invoices:[{...invoice(),kind:'credit',amountMinor:-1}]},org,project)).toThrow();
    expect(()=>validateProjectCostEvidence({...evidence(),personnel:[{...row(),streamKey:'time:personnel-secret:day'}]},org,project)).toThrow();
  });
});
