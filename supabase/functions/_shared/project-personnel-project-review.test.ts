import {describe,it,expect} from 'vitest';
import {fixture,context} from './project-personnel-cost.test.ts';
import {calculatePersonnelCostSnapshot} from './project-personnel-cost.ts';
import {projectPersonnelEconomicsFingerprint,projectPersonnelReviewEvidence,projectPersonnelReviewProjection} from './project-personnel-project-review.ts';
const a='55555555-5555-4555-8555-555555555555',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc',eventId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
async function saved(){const ctx=context(),r=await fixture();const initial=await calculatePersonnelCostSnapshot(r,ctx);
  return {...initial,lines:[initial.lines[0],{...initial.lines[0],source_time_line_id:'line-b',source_project_id:b,source_booking_id:null}]};}
describe('independent Operations project review proposal',()=>{
  it('approves only A, leaves B preliminary and preserves every saved rate/amount',async()=>{
    const s=await saved(),review=await projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:a,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:1});
    const p=await projectPersonnelReviewProjection(s,[review],{sourceRevision:2,submissionState:'submitted'});
    expect(p.snapshot.lines.map(l=>l.status)).toEqual(['confirmed','preliminary']);
    expect(p.snapshot.lines.map(l=>l.amount_minor)).toEqual(s.lines.map(l=>l.amount_minor));
  });
  it('reopening A does not reopen B or change any economics',async()=>{
    const s=await saved();const approve=async(project:string,sequence:number)=>projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:project,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:sequence});
    const reopen=await projectPersonnelReviewEvidence(s,{event_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',source_project_id:a,decision:'reopened',actor_system_user_id:actor,reason:'New project review',review_sequence:3});
    const p=await projectPersonnelReviewProjection(s,[await approve(a,1),await approve(b,2),reopen],{sourceRevision:2,submissionState:'submitted'});
    expect(p.snapshot.lines.map(l=>l.status)).toEqual(['preliminary','confirmed']);expect(p.invalidated_project_ids).toEqual([]);
  });
  it('status/publication changes keep fingerprints; rate correction invalidates only changed project',async()=>{
    const s=await saved(),changed={...s,source_revision:7,lines:s.lines.map(l=>({...l,status:'confirmed' as const}))};
    expect(await projectPersonnelEconomicsFingerprint(s,a)).toBe(await projectPersonnelEconomicsFingerprint(changed,a));
    const reviews=await Promise.all([a,b].map((id,i)=>projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:id,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:i+1})));
    changed.lines[0]={...changed.lines[0],rate_revision:'corrected-rate-v2',hourly_rate_minor:40000,amount_minor:80000};
    const p=await projectPersonnelReviewProjection(changed,reviews,{sourceRevision:8,submissionState:'submitted'});
    expect(p.snapshot.lines.map(l=>l.status)).toEqual(['preliminary','confirmed']);expect(p.invalidated_project_ids).toEqual([a]);
  });
  it('source correction invalidates snapshot-bound approvals; Time correction/void overrides confirmation',async()=>{
    const s=await saved(),review=await projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:a,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:1});
    expect((await projectPersonnelReviewProjection(s,[review],{sourceRevision:2,submissionState:'correction_requested'})).snapshot.lines[0].status).toBe('preliminary');
    expect((await projectPersonnelReviewProjection(s,[review],{sourceRevision:2,submissionState:'voided'})).snapshot.lines.every(l=>l.status==='rejected')).toBe(true);
    expect((await projectPersonnelReviewProjection({...s,source_snapshot_hash:'f'.repeat(64),time_snapshot_version:2},[review],{sourceRevision:2,submissionState:'submitted'})).invalidated_project_ids).toEqual([a]);
  });
  it('keeps a matching rejection during correction and invalidates it on a new Time snapshot',async()=>{
    const s=await saved(),review=await projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:a,decision:'rejected',actor_system_user_id:actor,reason:'Project allocation rejected',review_sequence:1});
    const approval=await projectPersonnelReviewEvidence(s,{event_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',source_project_id:b,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:2});
    expect((await projectPersonnelReviewProjection(s,[review,approval],{sourceRevision:2,submissionState:'correction_requested'})).snapshot.lines.map(l=>l.status)).toEqual(['rejected','preliminary']);
    const p=await projectPersonnelReviewProjection({...s,source_snapshot_hash:'f'.repeat(64),time_snapshot_version:2},[review,approval],{sourceRevision:3,submissionState:'correction_requested'});
    expect(p.snapshot.lines.map(l=>l.status)).toEqual(['preliminary','preliminary']);expect(p.invalidated_project_ids).toEqual([a,b]);
  });
  it('rejects foreign tenant evidence and ambiguous event sequence, with explicit reopen reasons',async()=>{
    const s=await saved(),review=await projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:a,decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:1});
    await expect(projectPersonnelReviewProjection(s,[{...review,organization_id:b}],{sourceRevision:2,submissionState:'submitted'})).rejects.toThrow('invalid_project_review_event');
    await expect(projectPersonnelReviewProjection(s,[review,{...review,decision:'rejected',reason:'Project cost rejected'}],{sourceRevision:2,submissionState:'submitted'})).rejects.toThrow('project_review_sequence_conflict');
    await expect(projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:a,decision:'reopened',actor_system_user_id:actor,reason:null,review_sequence:2})).rejects.toThrow();
  });
  it('normalizes UUID casing and rejects coerced hash types or missing rejection reasons',async()=>{
    const s=await saved(),review=await projectPersonnelReviewEvidence(s,{event_id:eventId,source_project_id:b.toUpperCase(),decision:'approved',actor_system_user_id:actor,reason:null,review_sequence:1});
    expect(review.source_project_id).toBe(b);
    expect((await projectPersonnelReviewProjection(s,[{...review,source_project_id:b.toUpperCase()}],{sourceRevision:2,submissionState:'submitted'})).snapshot.lines[1].status).toBe('confirmed');
    await expect(projectPersonnelReviewProjection(s,[{...review,economics_fingerprint:[review.economics_fingerprint] as any}],{sourceRevision:2,submissionState:'submitted'})).rejects.toThrow('invalid_project_review_event');
    await expect(projectPersonnelReviewProjection(s,[{...review,decision:'rejected',reason:null}],{sourceRevision:2,submissionState:'submitted'})).rejects.toThrow('invalid_project_review_event');
  });
});
