import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { validateProjectNativeCostEvidence } from '@/lib/economy/projectNativeCostEvidence';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';

const projectLabels = { preliminary: 'Preliminär', confirmed: 'Bekräftad', rejected: 'Avvisad' };
const sourceLabels = { pending: 'Ej granskad', approved: 'Godkänd tid', rejected: 'Avvisad tid' };
type ReadClient = { rpc(name: string, args: { p_organization_id: string; p_project_id: string }): PromiseLike<{ data: unknown; error: unknown }> };
function EnabledNativeCateringPanel({ projectId }: { projectId: string }) {
 const { user, isLoading: authLoading } = useAuth();
 const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationId();
 const query = useQuery({
  queryKey: ['operations-native-project-cost-evidence',user?.id ?? null,organizationId,projectId],
  enabled: !authLoading && !orgLoading && !!user?.id && !!organizationId && !!projectId && !orgError,
  staleTime: 0, retry: false,
  queryFn: async () => {
   if (!user?.id || !organizationId) throw new Error('Aktiv organisation saknas.');
   const result = await (supabase as unknown as ReadClient).rpc('read_operations_project_cost_evidence_v2', { p_organization_id: organizationId, p_project_id: projectId });
   if (result.error) throw new Error('Cateringunderlaget kunde inte hämtas.');
   return validateProjectNativeCostEvidence(result.data,organizationId,projectId);
  },
 });
 let content;
 if (authLoading || orgLoading || query.isFetching) content = <p role="status">Hämtar Cateringunderlag…</p>;
 else if (orgError || query.error || !user || !organizationId) content = <p role="alert">Cateringunderlaget är inte tillgängligt.</p>;
 else if (!query.data) content = <p role="status">Cateringunderlag saknas.</p>;
 else content = <section aria-label="Cateringkostnadsunderlag">
  {query.data.missingCateringCostCount > 0 && <p role="alert">Kostnadssats saknas för {query.data.missingCateringCostCount} Cateringrader. Kostnaden är inte komplett.</p>}
  {query.data.catering.length === 0 ? <p>Inget mottaget Cateringunderlag för projektet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
   <thead><tr><th>Datum</th><th>Tid</th><th>Kostnad</th><th>Projektgranskning</th><th>Tidsgranskning</th><th>Version</th></tr></thead>
   <tbody>{query.data.catering.map(row => <tr key={row.streamKey}>
    <td>{row.workDate}</td><td>{row.minutes} min</td><td>{row.amountMinor === null ? 'Kostnad saknas' : formatEvidenceMinorAmount(row.amountMinor,row.currency)}</td>
    <td>{projectLabels[row.status]}</td><td>{sourceLabels[row.sourceStatus]}</td><td>Tid {row.sourceEntryVersion} · kostnad {row.revision}</td>
   </tr>)}</tbody>
  </table></div>}
 </section>;
 return <Card><CardHeader><CardTitle>Cateringkostnadsunderlag</CardTitle></CardHeader><CardContent>{content}</CardContent></Card>;
}
export function NativeCateringCostEvidencePanel(props: { projectId: string }) {
 if (import.meta.env.VITE_OPERATIONS_NATIVE_COST_EVIDENCE_ENABLED !== 'true') return null;
 return <EnabledNativeCateringPanel {...props} />;
}
