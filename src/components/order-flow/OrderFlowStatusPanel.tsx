import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { describeOrderFlow, type OrderFlowStatus } from '@/lib/order-flow/status';

export default function OrderFlowStatusPanel({ bookingId, view }: { bookingId: string; view: 'planning'|'lager' }) {
 const query=useQuery({queryKey:['order-flow-status',bookingId],enabled:Boolean(bookingId),
  queryFn:async()=>{
   const {data,error}=await supabase.functions.invoke('booking-source-read',{body:{booking_id:bookingId}});
   if(error||data?.error)throw new Error('Jämförelsestatus kunde inte hämtas');
   return data.product_flow as OrderFlowStatus|null;
  },staleTime:0,refetchInterval:10000,refetchOnWindowFocus:true});
 if(query.isLoading)return null;
 const status=query.isError?null:query.data;
 const described=describeOrderFlow(status);
 if(described.state==='disabled')return null;
 const source=view==='lager'?'befintlig lokal plocklista':'Booking via aktuell export';
 return <details className="rounded-lg border border-border px-3 py-2 text-sm" data-order-flow="legacy">
  <summary className="cursor-pointer">Produktflöde i {view==='lager'?'Lager':'Planning'}: {source} · {described.label}</summary>
  <div className="mt-2 space-y-1 text-muted-foreground">
   <p>{described.details}</p>
   <p>Jämförelseflödet är separat och levererar ännu inte produkterna som visas här.</p>
   <p>Senaste ändring: {status?.shadow?.current_revision??'saknas'} · Återläst revision: {status?.shadow?.verified_revision??'saknas'}</p>
   {status?.shadow?.receipt?.issues?.length ? <p>{status.shadow.receipt.issues.length} kontrollpunkter behöver lösas.</p>:null}
  </div>
 </details>;
}
