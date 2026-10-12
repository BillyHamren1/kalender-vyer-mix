import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
export interface ReviewLine { line_id:string; minutes:number; amount_minor:number|null; currency:string; coverage:string; status:string }
export interface ProjectReviewRow { stream:string; source_revision:number; review_sequence:number; decision:string|null; work_date:string; lines:ReviewLine[]; can_review:boolean; can_approve:boolean; state:'ready'|'withdrawn'|'unavailable' }
interface ReviewPage { rows:ProjectReviewRow[]; next_cursor:string|null }
interface Command { p_project:string;p_stream:string;p_expected_source:number;p_expected_review:number;p_decision:string;p_reason:string|null;p_command:string }
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
function validCommand(v:unknown,project:string):v is Command{
 if(!v||typeof v!=='object')return false;const c=v as Command;
 return Object.keys(c).sort().join(',')==='p_command,p_decision,p_expected_review,p_expected_source,p_project,p_reason,p_stream'&&c.p_project===project&&typeof c.p_stream==='string'&&c.p_stream.length>0&&positive(c.p_expected_source)&&Number.isSafeInteger(c.p_expected_review)&&c.p_expected_review>=0&&['approved','reopened','rejected'].includes(c.p_decision)&&(c.p_reason===null||typeof c.p_reason==='string')&&uuid(c.p_command);
}
const sameCommand=(a:Command,b:Command)=>Object.keys(a).every(k=>a[k as keyof Command]===b[k as keyof Command]);
function receiptKind(v:unknown,c:Command,actor:string):'saved'|'stale'|null{
 if(!v||typeof v!=='object')return null;const r=v as Record<string,unknown>;
 if(['accepted','duplicate'].includes(String(r.status)))return r.financially_applied===false&&r.decision===c.p_decision&&uuid(r.event_id)&&uuid(r.outbox_id)&&positive(r.source_revision)&&Number(r.source_revision)>c.p_expected_source&&positive(r.review_sequence)&&Number(r.review_sequence)>c.p_expected_review&&r.command===c.p_command&&r.project===c.p_project&&r.stream===c.p_stream&&r.actor===actor?'saved':null;
 return Object.keys(r).length===1&&['stale_source','stale_review','stale','stale_source_review','stale_time_snapshot'].includes(String(r.status))?'stale':null;
}
const rpc=supabase.rpc.bind(supabase) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string}|null}>;
export const ACCEPTED_REVIEW_ENABLED=import.meta.env.VITE_OPERATIONS_ACCEPTED_REVIEW_ENABLED==='true';
export function useAcceptedProjectPersonnelReview(projectId:string,enabled=ACCEPTED_REVIEW_ENABLED){
 const actor=useAuth().user?.id??null;const actorNow=useRef(actor+'|'+projectId);actorNow.current=actor+'|'+projectId;const commandActor=useRef<string|null>(null);
 const client=useQueryClient(),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<Command|null>(null),inFlight=useRef(false),storageBlocked=useRef(false);
 const storageKey=actor?'operations-accepted-review:v1:'+actor+':'+projectId:null;
 useEffect(()=>{
  pending.current=null;commandActor.current=null;storageBlocked.current=false;setUncertain(false);setMessage('');setCursor(null);
  if(!enabled||!storageKey)return;
  try{const raw=sessionStorage.getItem(storageKey);if(raw!==null){const saved=JSON.parse(raw);if(!validCommand(saved,projectId))throw new Error('invalid');pending.current=saved;commandActor.current=actor;setUncertain(true);setMessage('En tidigare åtgärd väntar på kontroll. Kontrollera samma åtgärd innan du granskar igen.');}}
  catch{storageBlocked.current=true;setUncertain(true);setMessage('Sparad åtgärd kan inte läsas säkert. Ingen ny granskning kan skickas.');}
 },[actor,projectId,enabled,storageKey]);
 const query=useQuery({queryKey:['accepted-project-review',projectId,actor,cursor],enabled:enabled&&!!projectId&&!!actor,retry:false,queryFn:async()=>{
  const r=await rpc('get_operations_accepted_project_reviews_v1',{p_project:projectId,p_after_stream:cursor,p_limit:20});
  if(r.error)throw new Error('Granskningsunderlaget är inte tillgängligt.');
  const p=r.data as ReviewPage;if(!p||!Array.isArray(p.rows)||(p.next_cursor!==null&&typeof p.next_cursor!=='string'))throw new Error('Ogiltigt granskningsunderlag.');return p;
 }});
 const stored=():Command|null=>{if(!storageKey)throw new Error('identity');const raw=sessionStorage.getItem(storageKey);if(raw===null)return null;const c=JSON.parse(raw);if(!validCommand(c,projectId))throw new Error('invalid');return c;};
 const verifyStored=(command:Command)=>{const current=stored();if(!current||!sameCommand(current,command)){storageBlocked.current=true;throw new Error('stored conflict');}};
 const send=async(command:Command)=>{
  if(!enabled||inFlight.current||!actor||commandActor.current!==actor||storageBlocked.current)return;const requestActor=actor+'|'+projectId;
  const clear=()=>{verifyStored(command);sessionStorage.removeItem(storageKey!);pending.current=null;setUncertain(false);};
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   verifyStored(command);
   const result=await rpc('review_and_publish_operations_project_personnel_v1',command as unknown as Record<string,unknown>);
   if(actorNow.current!==requestActor)return;
   if(result.error){
    if(result.error.code&&['23505','42501','22023'].includes(result.error.code)){setUncertain(true);setMessage('Åtgärdens resultat kan inte kontrolleras med nuvarande behörighet eller underlag. Den ursprungliga åtgärden är bevarad.');return;}
    throw new Error('uncertain');
   }
   const kind=receiptKind(result.data,command,actor);
   if(!kind)throw new Error('uncertain');
   clear();
   if(kind==='saved')setMessage('Projektgranskningen är sparad. Leverans och ekonomisk attest hanteras separat.');
   else setMessage('Underlaget har ändrats. Läs den nya versionen innan du granskar igen.');
   await client.invalidateQueries({queryKey:['accepted-project-review',projectId]});
  }catch{if(actorNow.current!==requestActor)return;setUncertain(true);setMessage('Svaret saknas. Försök igen med samma åtgärd för att kontrollera om den sparades.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 const review=async(row:ProjectReviewRow,decision:string,reason:string)=>{
  if(!row.can_review||(decision==='approved'&&!row.can_approve)||pending.current||storageBlocked.current||!enabled||!actor)return;
  const command:Command={p_project:projectId,p_stream:row.stream,p_expected_source:row.source_revision,p_expected_review:row.review_sequence,p_decision:decision,p_reason:reason.trim()||null,p_command:crypto.randomUUID()};
  try{const previous=stored();if(previous){pending.current=previous;commandActor.current=actor;setUncertain(true);setMessage('En tidigare åtgärd väntar på kontroll. Kontrollera samma åtgärd innan du granskar igen.');return;}sessionStorage.setItem(storageKey!,JSON.stringify(command));verifyStored(command);}
  catch{storageBlocked.current=true;setUncertain(true);setMessage('Åtgärden kan inte sparas säkert för återförsök. Ingen granskning har skickats.');return;}
  pending.current=command;commandActor.current=actor;await send(command);
 };
 return {query,busy,message,uncertain,review,retry:()=>pending.current?send(pending.current):Promise.resolve(),next:()=>{if(!busy&&!uncertain)setCursor(query.data?.next_cursor??null);},first:()=>{if(!busy&&!uncertain)setCursor(null);},cursor};
}
