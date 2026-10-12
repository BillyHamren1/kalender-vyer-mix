import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ACCEPTED_REVIEW_ENABLED,useAcceptedProjectPersonnelReview,type ProjectReviewRow } from '@/hooks/useAcceptedProjectPersonnelReview';
function ReviewRow({row,disabled,onReview}:{row:ProjectReviewRow;disabled:boolean;onReview:(row:ProjectReviewRow,decision:string,reason:string)=>Promise<void>}){
 const [reason,setReason]=useState('');
 return <li className="space-y-2 rounded border p-3">
  <p>{row.work_date} · version {row.source_revision}{row.decision&&` · ${row.decision==='approved'?'Granskad':row.decision==='rejected'?'Avvisad':'Återöppnad'}`}</p>
  {row.state==='withdrawn'?<p>Projektets tidigare fördelning är borttagen i det aktuella underlaget.</p>:<p>{row.lines.reduce((n,l)=>n+l.minutes,0)} minuter på detta projekt. {row.lines.some(l=>l.coverage!=='complete')?'Kostnadsunderlaget är ofullständigt.':''}</p>}
  {!row.can_review?<p>Underlaget kan inte granskas nu.</p>:<fieldset disabled={disabled} className="space-y-2">
   <label>Kommentar<Textarea aria-label={`Kommentar ${row.work_date}`} value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
   <div className="flex flex-wrap gap-2"><Button disabled={!row.can_approve||(!!reason.trim()&&reason.trim().length<3)} onClick={()=>void onReview(row,'approved',reason)}>Godkänn projektfördelning</Button><Button variant="outline" disabled={reason.trim().length<3} onClick={()=>void onReview(row,'reopened',reason)}>Återöppna</Button><Button variant="outline" disabled={reason.trim().length<3} onClick={()=>void onReview(row,'rejected',reason)}>Avvisa</Button></div>
  </fieldset>}
 </li>;
}
export function AcceptedProjectPersonnelReview({projectId,enabled=ACCEPTED_REVIEW_ENABLED}:{projectId:string;enabled?:boolean}){
 const state=useAcceptedProjectPersonnelReview(projectId,enabled);
 if(!enabled)return null;
 return <section aria-label="Projektgranskning av personaltid" className="space-y-3 mb-6">
  <h2 className="font-semibold">Projektgranskning av personaltid</h2><p className="text-sm text-muted-foreground">Granska fördelningen på detta projekt. Detta påverkar inte löneattest eller ekonomisk attest.</p>
  {state.query.isPending&&<p>Läser underlag…</p>}{state.query.isError&&<p role="alert">Granskningsunderlaget är inte tillgängligt.</p>}
  {state.message&&<p role="status">{state.message}</p>}
  {state.uncertain&&<Button disabled={state.busy} onClick={()=>void state.retry()}>Kontrollera samma åtgärd igen</Button>}
  {state.query.data?.rows.length===0&&<p>Inget granskningsunderlag på denna sida.</p>}
  <ul className="space-y-3">{state.query.data?.rows.map(row=><ReviewRow key={row.stream} row={row} disabled={state.busy||state.uncertain} onReview={state.review}/>)}</ul>
  <div className="flex gap-2">{state.cursor&&<Button variant="outline" disabled={state.busy||state.uncertain} onClick={state.first}>Första sidan</Button>}{state.query.data?.next_cursor&&<Button variant="outline" disabled={state.busy||state.uncertain} onClick={state.next}>Nästa sida</Button>}</div>
 </section>;
}
