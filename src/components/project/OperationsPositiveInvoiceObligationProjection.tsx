import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readPositiveInvoiceObligationProjection,
  type PositiveInvoiceObligationAuthority,
  type PositiveInvoiceObligationClient,
} from '@/lib/economy/positiveInvoiceObligationProjection';

export function OperationsPositiveInvoiceObligationProjection({
  authority,
  boundary,
}: {
  authority: PositiveInvoiceObligationAuthority;
  boundary: string;
}) {
  const q = useQuery({
    queryKey: ['operations-positive-invoice-obligation-v1',authority.actorId,authority.organizationId,authority.rootKind,
      authority.rootId,authority.obligationId,authority.compositionSnapshotId,authority.baselineEventId,boundary],
    queryFn: ({signal}) => readPositiveInvoiceObligationProjection(
      supabase as unknown as PositiveInvoiceObligationClient,authority,signal),
    enabled: import.meta.env.VITE_OPERATIONS_POSITIVE_INVOICE_PROJECTION_ENABLED === 'true',
    meta:{persist:false},gcTime:0,staleTime:0,retry:false,refetchInterval:30_000,refetchOnWindowFocus:'always',
  });
  if (import.meta.env.VITE_OPERATIONS_POSITIVE_INVOICE_PROJECTION_ENABLED !== 'true') return null;
  if (q.isPending || q.isFetching) return <section aria-label="Avgränsad fakturaprognos"><p role="status">Hämtar fakturaprognosen…</p></section>;
  if (q.error || !q.data) return <section aria-label="Avgränsad fakturaprognos"><p role="alert">Fakturaprognosen är inte tillgänglig.</p></section>;
  const p=q.data.projection;
  const money=(v:number|null)=>v===null?'Saknas':formatEvidenceMinorAmount(v,p.currency);
  return <section aria-label="Avgränsad fakturaprognos">
    <h5>Avgränsad fakturaprognos</h5>
    <p>Operations beräknar bara den valda fakturabaserade kostnadsposten. Finance räknar inte om beloppet.</p>
    <dl>
      <dt>Preliminär fakturakostnad</dt><dd>{money(p.preliminaryMinor)}</dd>
      <dt>Bekräftad fakturakostnad</dt><dd>{money(p.confirmedMinor)}</dd>
      <dt>Återstående uppskattning/åtagande</dt><dd>{money(p.remainingMinor)}</dd>
      <dt>Avgränsad EAC</dt><dd>{money(p.eacMinor)}</dd>
    </dl>
    {p.coverage==='unavailable' && <p role="alert">Täckningen är ofullständig. Saknade belopp visas inte som noll.</p>}
    <p>Projektets total, krediter, inhyrd personal, budget och marginal är ännu inte tillgängliga.</p>
  </section>;
}
