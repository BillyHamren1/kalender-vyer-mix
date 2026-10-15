import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { PLANNING_BRAIN_NONCE_TTL_SECONDS, verifyPlanningBrainSignature } from '../_shared/planning-brain-read-contract.ts';
import { authorizeHubActor, logActorDenial } from '../_shared/hub-actor.ts';
import { executeWorkspaceCommand, validWorkspaceRequest, WorkspaceCommandError } from '../_shared/operations-project-workspace-commands.ts';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function handleRequest(request:Request):Promise<Response>{
  if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
  const secret=Deno.env.get('PLANNING_BRAIN_READ_SIGNING_SECRET');
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret || !url || !key)return json(503,{error:'not_configured'});
  const rawBody=await request.text();
  if(new TextEncoder().encode(rawBody).byteLength>6000000)return json(413,{error:'request_too_large'});
  if(!await verifyPlanningBrainSignature({secret,rawBody,timestamp:request.headers.get('x-planning-timestamp'),nonce:request.headers.get('x-planning-nonce'),signature:request.headers.get('x-planning-signature')}))return json(401,{error:'invalid_signature'});
  let body:unknown;try{body=JSON.parse(rawBody);}catch{return json(400,{error:'invalid_request'});}
  if(!validWorkspaceRequest(body))return json(400,{error:'invalid_request'});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const nonce=await admin.rpc('consume_planning_brain_read_nonce',{_nonce:request.headers.get('x-planning-nonce'),_organization_id:body.organizationId,_ttl_seconds:PLANNING_BRAIN_NONCE_TTL_SECONDS});
  if(nonce.error)return json(503,{error:'nonce_store_unavailable'});
  if(nonce.data!==true)return json(401,{error:'nonce_replayed'});
  const actor=await authorizeHubActor(admin,{hubSubject:body.actorUserId,organizationId:body.organizationId,roles:['admin','projekt']});
  if(!actor.ok){logActorDenial('planning-mobile-workspace-command',actor.reason,body.organizationId);return json(actor.status,{error:actor.error});}
  try{return json(200,{schema:'planning-mobile-workspace-command-receipt.v1',receipt:await executeWorkspaceCommand(body,{admin,localActor:actor.localUserId})});}
  catch(error){return error instanceof WorkspaceCommandError?json(error.status,{error:error.code}):json(503,{error:'outcome_unknown'});}
}
if(import.meta.main)Deno.serve(handleRequest);
