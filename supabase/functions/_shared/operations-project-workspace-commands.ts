import { pushBookingFieldsToExternal } from './external-booking-write.ts';
import { executeWorkspaceSupplierCommand, validateWorkspaceSupplierCommand, WorkspaceSupplierError } from './operations-project-workspace-suppliers.ts';
import { readWorkspaceBooking } from './operations-project-workspace.ts';

export class WorkspaceCommandError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export const workspaceUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e10;
const costFields = ['assembly_cost', 'handling_cost', 'purchase_cost'];
const patch = (v: unknown) => object(v) && keys(v,costFields) && Object.keys(v).length > 0 && Object.values(v).every(amount);
const extraRows = (v: unknown) => Array.isArray(v) && v.length <= 500 && new Set(v.map(r => r?.id)).size === v.length && v.every(r => object(r) && keys(r,['id','label','amount','quantity','unit_price','discount',...costFields]) && text(r.id,128) && r.id.length > 0 && text(r.label,1000) && amount(r.amount) && Object.entries(r).every(([k,n]) => ['id','label'].includes(k) || amount(n)));
export function validWorkspaceCommand(c: unknown): c is Record<string, any> {
  if (!object(c)) return false;
  switch(c.type) {
    case 'transport.set_planning_status': return keys(c,['type','assignmentId','planningStatus','expectedPlanningStatus']) && workspaceUuid(c.assignmentId) && ['preliminary','confirmed'].includes(c.planningStatus) && ['preliminary','confirmed'].includes(c.expectedPlanningStatus);
    case 'notes.save': return keys(c,['type','notes','expectedNotes']) && text(c.notes,50000) && (c.expectedNotes === null || text(c.expectedNotes,50000));
    case 'task.add': return keys(c,['type','title']) && text(c.title,2000) && c.title.trim().length > 0;
    case 'task.toggle': return keys(c,['type','taskId','completed','expectedCompleted']) && workspaceUuid(c.taskId) && typeof c.completed === 'boolean' && typeof c.expectedCompleted === 'boolean';
    case 'task.delete': return keys(c,['type','taskId','expectedUpdatedAt']) && workspaceUuid(c.taskId) && text(c.expectedUpdatedAt,100) && Number.isFinite(Date.parse(c.expectedUpdatedAt));
    case 'costs.product.save': return keys(c,['type','productId','costs','expected']) && workspaceUuid(c.productId) && patch(c.costs) && patch(c.expected) && Object.keys(c.costs).sort().join() === Object.keys(c.expected).sort().join();
    case 'costs.extra.save': return keys(c,['type','extraCosts','expected']) && extraRows(c.extraCosts) && (c.expected === null || extraRows(c.expected));
    case 'file.upload': return keys(c,['type','fileName','mimeType','base64']) && text(c.fileName,255) && c.fileName.trim().length>0 && !/[\\/\x00-\x1f]/.test(c.fileName) && text(c.mimeType,100) && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(c.mimeType) && typeof c.base64 === 'string' && c.base64.length>0 && c.base64.length<=5592408 && c.base64.length%4===0 && /^[A-Za-z0-9+/]+={0,2}$/.test(c.base64);
    case 'file.delete': return keys(c,['type','fileId']) && workspaceUuid(c.fileId);
    default: return validateWorkspaceSupplierCommand(c);
  }
}
export function validWorkspaceRequest(b: unknown): b is Record<string, any> {
  return object(b) && keys(b,['schema','actorUserId','organizationId','projectId','idempotencyKey','command']) && b.schema === 'planning-mobile-workspace-command-request.v1' && ['actorUserId','organizationId','projectId','idempotencyKey'].every(k=>workspaceUuid(b[k])) && validWorkspaceCommand(b.command);
}
export async function workspaceCommandHash(command: unknown): Promise<string> {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(command)))))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export type CommandDependencies = {
  admin: any; localActor: string; env?: (key:string)=>string|undefined; fetcher?: typeof fetch;
  readBooking?: typeof readWorkspaceBooking; pushNotes?: typeof pushBookingFieldsToExternal;
};
export async function executeWorkspaceCommand(body: Record<string, any>, deps: CommandDependencies) {
  if (!validWorkspaceRequest(body)) throw new WorkspaceCommandError(400,'invalid_request');
  const {admin,localActor} = deps;
  const env = deps.env ?? ((key:string)=>Deno.env.get(key));
  const command = body.command;
  const hash = await workspaceCommandHash(command);
  const scope = {p_actor_user_id:localActor,p_organization_id:body.organizationId,p_project_id:body.projectId,p_idempotency_key:body.idempotencyKey};
  const reserved = await admin.rpc('planning_mobile_workspace_command_v1',{...scope,p_command:command,p_request_hash:hash});
  if(reserved.error) throw new WorkspaceCommandError(reserved.error.code==='40001'?409:reserved.error.code==='42501'?403:reserved.error.code==='P0002'?404:503,reserved.error.code==='40001'?'conflict':reserved.error.code==='42501'?'unauthorized':reserved.error.code==='P0002'?'not_found':'command_unavailable');
  const state = reserved.data;
  if(state?.persisted === true) return {...state,actorUserId:body.actorUserId,organizationId:body.organizationId,projectId:body.projectId,idempotencyKey:body.idempotencyKey,commandType:command.type};
  if(state?.claimed !== true) throw new WorkspaceCommandError(409,'outcome_unknown');
  // A committed reservation is NEVER retried automatically: the external owner may
  // have persisted even if its response or this receipt update is lost.
  let outcome: Record<string,unknown>;
  try {
    if(validateWorkspaceSupplierCommand(command)) {
      outcome=await executeWorkspaceSupplierCommand({admin,localActor,organizationId:body.organizationId,projectId:body.projectId},command);
    } else if(command.type==='file.upload') {
      const binary=atob(command.base64);
      if(binary.length>4*1024*1024)throw new WorkspaceCommandError(400,'invalid_request');
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const path=`${body.projectId}/${body.idempotencyKey}-${command.fileName}`;
      const uploaded=await admin.storage.from('project-files').upload(path,bytes,{contentType:command.mimeType,upsert:false});
      if(uploaded.error)throw new WorkspaceCommandError(503,'outcome_unknown');
      const {data:url}=admin.storage.from('project-files').getPublicUrl(path);
      const inserted=await admin.from('project_files').insert({project_id:body.projectId,organization_id:body.organizationId,file_name:command.fileName,file_type:command.mimeType,url:url.publicUrl,uploaded_by:localActor}).select('id').single();
      if(inserted.error || !inserted.data)throw new WorkspaceCommandError(503,'outcome_unknown');
      outcome={persisted:true,fileId:inserted.data.id};
    } else if(command.type==='file.delete') {
      const file=await admin.from('project_files').select('id,url').eq('id',command.fileId).eq('project_id',body.projectId).eq('organization_id',body.organizationId).maybeSingle();
      if(file.error)throw new WorkspaceCommandError(503,'command_unavailable');
      if(!file.data)throw new WorkspaceCommandError(404,'not_found');
      const base=env('SUPABASE_URL');
      const prefix=`${base}/storage/v1/object/public/project-files/${body.projectId}/`;
      if(!base || typeof file.data.url!=='string' || !file.data.url.startsWith(prefix))throw new WorkspaceCommandError(409,'file_path_conflict');
      const suffix=decodeURIComponent(file.data.url.slice(prefix.length));
      if(!suffix || /[\\/\x00-\x1f?#]/.test(suffix) || suffix==='.' || suffix==='..')throw new WorkspaceCommandError(409,'file_path_conflict');
      const removed=await admin.storage.from('project-files').remove([`${body.projectId}/${suffix}`]);
      if(removed.error)throw new WorkspaceCommandError(503,'outcome_unknown');
      const deleted=await admin.from('project_files').delete().eq('id',command.fileId).eq('project_id',body.projectId).eq('organization_id',body.organizationId).select('id').single();
      if(deleted.error || !deleted.data)throw new WorkspaceCommandError(503,'outcome_unknown');
      outcome={persisted:true,fileId:command.fileId};
    } else {
    if(!state.bookingId) throw new WorkspaceCommandError(404,'not_found');
    if(command.type === 'notes.save') {
      const booking = await (deps.readBooking ?? readWorkspaceBooking)(state.bookingId,body.organizationId,{env,fetcher:deps.fetcher});
      if((booking.internalNotes ?? '') !== (command.expectedNotes ?? '')) throw new WorkspaceCommandError(409,'conflict');
      // Booking's existing notes writer has no atomic compare-and-set. This
      // pre-read rejects stale forms; it does not claim cross-system CAS.
      const result = await (deps.pushNotes ?? pushBookingFieldsToExternal)({bookingId:state.bookingId,organizationId:body.organizationId,fields:{internal_notes:command.notes}});
      if(!result.ok || (result.body && typeof result.body==='object' && ('error' in result.body || ('success' in result.body && result.body.success===false)))) throw new WorkspaceCommandError(503,'outcome_unknown');
      outcome={persisted:true};
    } else {
      const base=env('EF_SUPABASE_URL'), key=env('PLANNING_API_KEY');
      if(!base || !key) throw new WorkspaceCommandError(503,'command_unavailable');
      const type=command.type==='costs.product.save'?'product_costs':'extra_costs';
      const query=new URLSearchParams({type,booking_id:state.bookingId,organization_id:body.organizationId});
      const payload=type==='product_costs'?{product_id:command.productId,costs:command.costs,expected:command.expected}:{extra_costs:command.extraCosts,expected_extra_costs:command.expected};
      const response=await (deps.fetcher ?? fetch)(`${base}/functions/v1/planning-api?${query}`,{method:'PUT',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const result=await response.json().catch(()=>null);
      if(response.status===409) throw new WorkspaceCommandError(409,'conflict');
      if(!response.ok || !result || result.error) throw new WorkspaceCommandError(503,'outcome_unknown');
      outcome={persisted:true};
    }
    }
  } catch(error) {
    // Record only definite rejection; unknown outcomes stay reserved forever.
    if(error instanceof WorkspaceCommandError && error.code==='conflict') await admin.from('planning_mobile_workspace_receipts').update({state:'rejected',result:{error:'conflict'}}).match({organization_id:body.organizationId,actor_user_id:localActor,project_id:body.projectId,idempotency_key:body.idempotencyKey,request_hash:hash,state:'pending'});
    if(error instanceof WorkspaceSupplierError)throw new WorkspaceCommandError(error.status,error.code);
    throw error instanceof WorkspaceCommandError?error:new WorkspaceCommandError(503,'outcome_unknown');
  }
  const receipt={...outcome,actorUserId:body.actorUserId,organizationId:body.organizationId,projectId:body.projectId,idempotencyKey:body.idempotencyKey,commandType:command.type,replayed:false};
  const saved=await admin.from('planning_mobile_workspace_receipts').update({state:'persisted',result:receipt}).match({organization_id:body.organizationId,actor_user_id:localActor,project_id:body.projectId,idempotency_key:body.idempotencyKey,request_hash:hash,state:'pending'}).select('idempotency_key').single();
  if(saved.error || !saved.data) throw new WorkspaceCommandError(503,'outcome_unknown');
  return receipt;
}
