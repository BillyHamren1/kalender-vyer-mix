import type { PersonnelCostSnapshot,PersonnelCostLine } from './project-personnel-cost.ts';

/** Independent Operations project decisions. Not wired to v1 day ingestion yet. */
export interface ProjectPersonnelReviewEvent {
  schema:'operations-personnel-project-review.v1'; event_id:string;
  organization_id:string; source_time_stream_id:string; source_snapshot_hash:string;
  time_snapshot_version:number; source_project_id:string; source_time_line_ids:string[];
  economics_fingerprint:string; decision:'approved'|'reopened'|'rejected';
  actor_system_user_id:string; reason:string|null; review_sequence:number;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const utf8Order=(left:string,right:string)=>{const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);
  for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])return a[i]-b[i];}return a.length-b.length;};
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>utf8Order(a,b)).map(([k,x])=>[k,canonical(x)])):v;
export function projectPersonnelLineIds(saved:PersonnelCostSnapshot,projectId:string):string[]{
  if(!uuid(projectId))throw new Error('invalid_project_id');
  const lines=saved.lines.filter(l=>l.source_project_id.toLowerCase()===projectId.toLowerCase()).map(l=>l.source_time_line_id).sort(utf8Order);
  if(!lines.length)throw new Error('project_not_in_saved_snapshot');
  if(new Set(lines).size!==lines.length)throw new Error('duplicate_saved_line_identity');
  return lines;
}
/** Status and publication order are excluded; saved source/rates/money are included. */
export async function projectPersonnelEconomicsFingerprint(saved:PersonnelCostSnapshot,projectId:string):Promise<string>{
  const lineIds=projectPersonnelLineIds(saved,projectId);
  const value={schema:'operations-personnel-project-economics-fingerprint.v1',organization_id:saved.organization_id,
    worker_id:saved.worker_id,work_date:saved.work_date,source_time_stream_id:saved.source_time_stream_id,
    source_time_report_id:saved.source_time_report_id,source_snapshot_hash:saved.source_snapshot_hash,
    time_snapshot_version:saved.time_snapshot_version,calculation_version:saved.calculation_version,source_project_id:projectId.toLowerCase(),
    lines:lineIds.map(id=>{const {status:_status,...economic}=saved.lines.find(l=>l.source_time_line_id===id)!;return economic;})};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function projectPersonnelReviewEvidence(saved:PersonnelCostSnapshot,command:{
  event_id:string;source_project_id:string;decision:ProjectPersonnelReviewEvent['decision'];actor_system_user_id:string;
  reason:string|null;review_sequence:number;
}):Promise<ProjectPersonnelReviewEvent>{
  if(!uuid(command.event_id)||!uuid(command.actor_system_user_id)||!integer(command.review_sequence)||
    !['approved','reopened','rejected'].includes(command.decision)||
    (command.reason!==null&&(typeof command.reason!=='string'||command.reason!==command.reason.trim()||command.reason.length<3||command.reason.length>1000))||
    (command.decision!=='approved'&&command.reason===null))throw new Error('invalid_project_review_command');
  return {schema:'operations-personnel-project-review.v1',...command,source_project_id:command.source_project_id.toLowerCase(),organization_id:saved.organization_id,
    source_time_stream_id:saved.source_time_stream_id,source_snapshot_hash:saved.source_snapshot_hash,
    time_snapshot_version:saved.time_snapshot_version,source_time_line_ids:projectPersonnelLineIds(saved,command.source_project_id),
    economics_fingerprint:await projectPersonnelEconomicsFingerprint(saved,command.source_project_id)};
}
export async function projectPersonnelReviewProjection(saved:PersonnelCostSnapshot,events:readonly ProjectPersonnelReviewEvent[],input:{
  sourceRevision:number;submissionState:'submitted'|'correction_requested'|'approved'|'locked'|'voided';
}):Promise<{snapshot:PersonnelCostSnapshot;invalidated_project_ids:string[]}>{
  if(!integer(input.sourceRevision)||input.sourceRevision<=saved.source_revision||
    !['submitted','correction_requested','approved','locked','voided'].includes(input.submissionState))throw new Error('invalid_project_review_projection');
  const latest=new Map<string,ProjectPersonnelReviewEvent>();
  for(const event of events){
    if(event.schema!=='operations-personnel-project-review.v1'||event.organization_id!==saved.organization_id||
      event.source_time_stream_id!==saved.source_time_stream_id||!integer(event.review_sequence)||!uuid(event.event_id)||
      !uuid(event.actor_system_user_id)||!uuid(event.source_project_id)||!integer(event.time_snapshot_version)||
      typeof event.source_snapshot_hash!=='string'||!/^[0-9a-f]{64}$/.test(event.source_snapshot_hash)||
      typeof event.economics_fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(event.economics_fingerprint)||
      !['approved','reopened','rejected'].includes(event.decision)||!Array.isArray(event.source_time_line_ids)||
      (event.reason!==null&&(typeof event.reason!=='string'||event.reason!==event.reason.trim()||event.reason.length<3||event.reason.length>1000))||
      (event.decision!=='approved'&&event.reason===null)||
      event.source_time_line_ids.length>1000||event.source_time_line_ids.some(id=>typeof id!=='string'||id!==id.trim()||!id.length||id.length>256)||
      new Set(event.source_time_line_ids).size!==event.source_time_line_ids.length)throw new Error('invalid_project_review_event');
    const projectKey=event.source_project_id.toLowerCase(),old=latest.get(projectKey);
    if(old&&old.review_sequence===event.review_sequence&&JSON.stringify(canonical(old))!==JSON.stringify(canonical(event)))
      throw new Error('project_review_sequence_conflict');
    if(!old||old.review_sequence<event.review_sequence)latest.set(projectKey,event);
  }
  const statuses=new Map<string,PersonnelCostLine['status']>(),invalidated:string[]=[];
  for(const project of new Set(saved.lines.map(line=>line.source_project_id))){
    const event=latest.get(project.toLowerCase());let status:PersonnelCostLine['status']='preliminary';
    if(event){const valid=event.source_snapshot_hash===saved.source_snapshot_hash&&event.time_snapshot_version===saved.time_snapshot_version&&
      event.economics_fingerprint===await projectPersonnelEconomicsFingerprint(saved,project)&&
      JSON.stringify([...event.source_time_line_ids].sort(utf8Order))===JSON.stringify(projectPersonnelLineIds(saved,project));
      if(!valid)invalidated.push(project);
      else status=event.decision==='approved'?'confirmed':event.decision==='rejected'?'rejected':'preliminary';
    }
    if(input.submissionState==='voided')status='rejected';
    else if(input.submissionState==='correction_requested'&&status==='confirmed')status='preliminary';
    statuses.set(project,status);
  }
  return {snapshot:{...saved,source_revision:input.sourceRevision,lines:saved.lines.map(line=>({...line,status:statuses.get(line.source_project_id)!}))},
    invalidated_project_ids:invalidated.sort()};
}
