import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readScopeInvoiceLines,
  type ScopeInvoiceLineReadAuthority,
  type ScopeInvoiceLineReadClient,
} from '@/lib/economy/projectScopeInvoiceLines';

/** Exact received invoice-allocation identities only. This component calculates no totals. */
export function OperationsScopeInvoiceLineEvidenceTable({
  authority,
  boundary,
}: {
  authority: ScopeInvoiceLineReadAuthority;
  boundary: string;
}) {
  if (import.meta.env.VITE_OPERATIONS_SCOPE_INVOICE_LINE_EVIDENCE_ENABLED !== 'true') return null;
  return <LineTableForSession authority={authority} boundary={boundary} />;
}

function LineTableForSession({
  authority,
  boundary,
}: {
  authority: ScopeInvoiceLineReadAuthority;
  boundary: string;
}) {
  const query = useQuery({
    queryKey: [
      'operations-scope-invoice-line-evidence-v1', authority.actorId, authority.organizationId,
      authority.request.root_kind, authority.request.root_id,
      authority.request.expected_composition_snapshot_id, boundary,
    ],
    queryFn: ({ signal }) => readScopeInvoiceLines(
      supabase as unknown as ScopeInvoiceLineReadClient,
      authority,
      signal,
    ),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    meta: { persist: false },
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
  if (query.isFetching || query.isPending)
    return <section aria-label="Fakturarader för projektsamlingen"><p role="status">Hämtar fakturarader…</p></section>;
  if (query.error || !query.data)
    return <section aria-label="Fakturarader för projektsamlingen"><p role="alert">Fakturaraderna är inte tillgängliga. Hämta projektets underlag igen.</p></section>;
  const evidence = query.data;
  return <section aria-label="Fakturarader för projektsamlingen">
    <h4>Mottagna fakturarader</h4>
    {evidence.lines.length === 0 ? <p>Verifierade fakturarader saknas.</p> : <table>
      <caption>Exakta mottagna allokeringar. Tabellen räknar inte om eller summerar kostnader.</caption>
      <thead><tr>
        <th>Faktura-ID</th><th>Allokering-ID</th><th>Projekt-ID</th><th>Status</th><th>Belopp</th><th>Revision</th>
      </tr></thead>
      <tbody>{evidence.lines.map(line => <tr key={`${line.source_organization_id}:${line.invoice_id}:${line.source_allocation_id}:${line.project_id}`}>
        <td>{line.invoice_id}</td>
        <td>{line.source_allocation_id}</td>
        <td>{line.project_id}</td>
        <td>{line.source_status === 'preliminary' ? 'Preliminär' : 'Bekräftad'}</td>
        <td>{formatEvidenceMinorAmount(line.amount_minor, line.currency)}</td>
        <td>{line.source_economic_revision}</td>
      </tr>)}</tbody>
    </table>}
    {(evidence.availability !== 'available' || evidence.unavailable_source_count > 0) && <p role="alert">
      En eller flera fakturakopplingar saknar aktuellt verifierbart radunderlag. De visas inte som noll.
    </p>}
    <p>Krediter och fullständig källtäckning är ännu inte tillgängliga i denna vy.</p>
  </section>;
}
