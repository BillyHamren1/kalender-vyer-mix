import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { validateProjectCostEvidence, formatEvidenceMinorAmount as money, type EvidenceStatus } from '@/lib/economy/projectCostEvidence';

const labels: Record<EvidenceStatus, string> = { preliminary: 'Preliminär', confirmed: 'Bekräftad', rejected: 'Avvisad' };
type ReadClient = { rpc(name: string, args: { p_organization_id: string; p_project_id: string }): PromiseLike<{ data: unknown; error: unknown }> };

function EnabledProjectCostEvidencePanel({ projectId }: { projectId: string }) {
  const { user, isLoading: authLoading } = useAuth();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationId();
  const query = useQuery({
    queryKey: ['operations-project-cost-evidence',user?.id ?? null,organizationId,projectId],
    enabled: !authLoading && !orgLoading && !!user?.id && !!organizationId && !!projectId && !orgError,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!user?.id || !organizationId) throw new Error('Aktiv organisation saknas.');
      const result = await (supabase as unknown as ReadClient).rpc('read_operations_project_cost_evidence_v1', {
        p_organization_id: organizationId, p_project_id: projectId,
      });
      if (result.error) throw new Error('Kostnadsunderlaget kunde inte hämtas.');
      return validateProjectCostEvidence(result.data, organizationId, projectId);
    },
  });
  let content;
  if (authLoading || orgLoading || query.isFetching) content = <p role="status">Hämtar kostnadsunderlag…</p>;
  else if (orgError || query.error || !user || !organizationId) content = <p role="alert">Kostnadsunderlaget är inte tillgängligt.</p>;
  else if (!query.data) content = <p role="status">Kostnadsunderlag saknas.</p>;
  else {
    const data = query.data;
    content = <div className="space-y-4">
      {data.missingPersonnelCostCount > 0 && <p role="alert">Kostnadssats saknas för {data.missingPersonnelCostCount} tidsrader. Kostnaden är inte komplett.</p>}
      <section aria-label="Personalkostnadsunderlag">
        <h3 className="font-medium mb-2">Personal</h3>
        {data.personnel.length === 0 ? <p>Inget mottaget tidsunderlag för projektet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th className="text-left">Datum</th><th>Tid</th><th>Kostnad</th><th>Status</th><th>Version</th><th>Finance</th></tr></thead>
          <tbody>{data.personnel.map(row => <tr key={JSON.stringify([row.streamKey,row.lineId])}>
            <td>{row.workDate}</td><td className="text-center">{row.minutes} min</td>
            <td className="text-center">{row.amountMinor === null ? 'Kostnad saknas' : money(row.amountMinor,row.currency)}</td>
            <td className="text-center">{labels[row.status]}</td><td className="text-center">Tid {row.timeVersion} · kostnad {row.revision}</td>
            <td className="text-center">{row.financeCurrentRevision !== null && row.financeCurrentRevision > row.revision
              ? 'Senare version behöver stämmas av' : row.financeDeliveryState === 'delivered'
              ? 'Kvitterat' : row.financeDeliveryState === 'blocked' ? 'Avstämning behövs' : 'Inväntar kvitto'}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <section aria-label="Projektkopplade leverantörsfakturor">
        <h3 className="font-medium mb-2">Leverantörsfakturor</h3>
        {data.invoices.length === 0 ? <p>Inget mottaget fakturaunderlag för projektet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th className="text-left">Faktura</th><th>Projektets belopp</th><th>Status</th><th>Avstämning</th></tr></thead>
          <tbody>{data.invoices.map(row => <tr key={JSON.stringify([row.sourceOrganizationId,row.invoiceId,row.allocationId])}>
            <td>{row.documentNumber}{row.kind === 'credit' ? ' (kredit)' : ''}</td><td className="text-center">{money(row.amountMinor,row.currency)}</td>
            <td className="text-center">{labels[row.status]}</td><td className="text-center">
              {row.providerSourceChanged ? 'Fakturaunderlaget har ändrats' : row.creditRelationCoverage === 'unresolved' ? 'Kreditens koppling behöver stämmas av' : 'Mottaget underlag'}
            </td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>;
  }
  return <Card><CardHeader><CardTitle>Kostnadsunderlag</CardTitle></CardHeader><CardContent>{content}</CardContent></Card>;
}

export function ProjectCostEvidencePanel(props: { projectId: string }) {
  if (import.meta.env.VITE_OPERATIONS_COST_EVIDENCE_ENABLED !== 'true') return null;
  return <EnabledProjectCostEvidencePanel {...props} />;
}
