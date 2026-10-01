export interface OrderFlowStatus {
 contract_version?: string;
 active_source?: string;
 available?: boolean;
 legacy?: { status?: string; last_sync_at?: string };
 shadow?: {
  enabled?: boolean; state?: string; current_revision?: string | null; verified_revision?: string | null;
  last_error?: string | null;
  receipt?: { outcome?: string; source_revision?: string; issues?: {code:string;product_id:string|null}[]; completed_at?: string } | null;
 };
 cutover_ready?: boolean;
}
export function describeOrderFlow(status: OrderFlowStatus | null | undefined) {
 if (!status || status.available===false || status.contract_version!=='order-flow-status-v1') {
  return {state:'unknown',label:'Jämförelsestatus kunde inte kontrolleras',details:'Det nya flödet är inte verifierat.'};
 }
 const shadow=status.shadow;
 if(!shadow?.enabled)return {state:'disabled',label:'Jämförelseflödet är inte aktiverat',details:''};
 if(shadow.state==='failed')return {state:'failed',label:'Nya jämförelseflödet misslyckades',details:'En lyckad befintlig synk godkänner inte det nya flödet.'};
 if(shadow.state==='blocked')return {state:'blocked',label:'Nya underlaget behöver kontrolleras',details:'Produkter eller tillhörighet är ofullständiga. Övergången är blockerad.'};
 const current=shadow.current_revision;
 if(shadow.state==='readback_matches'&&current&&shadow.verified_revision===current&&
  shadow.receipt?.outcome==='readback_matches'&&shadow.receipt.source_revision===current){
  return {state:'matched',label:'Nya underlaget stämmer vid återläsning',details:'Planning, Lager och fakturering behöver fortfarande verifieras innan källan byts.'};
 }
 return {state:'pending',label:'Nya flödet väntar på kontroll av senaste ändringen',details:'Ett äldre kvitto godkänner inte den senaste ändringen.'};
}
