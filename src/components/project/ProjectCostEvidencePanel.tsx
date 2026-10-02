import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { validateProjectCostEvidence, formatEvidenceMinorAmount as money, type EvidenceStatus, type ProjectCostEvidence } from '@/lib/economy/projectCostEvidence';

const labels: Record<EvidenceStatus, string> = { preliminary: 'Preliminär', confirmed: 'Bekräftad', rejected: 'Avvisad' };
type ReadClient = {
  auth: { getSession(): PromiseLike<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }> };
  rpc(name: 'read_operations_project_cost_evidence_v1', args: { p_organization_id: string; p_project_id: string }): {
    setHeader(name: string, value: string): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};
type Authority = { actorId: string; accessToken: string; organizationId: string; projectId: string };
function Frame({ children }: { children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>Kostnadsunderlag</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}
function EnabledProjectCostEvidencePanel({ projectId }: { projectId: string }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationId();
  const actor = user?.id, token = session?.access_token;
  const boundary = useMemo(() => actor && token && organizationId ? crypto.randomUUID() : 'unavailable', [actor, token, organizationId]);
  if (authLoading || orgLoading) return <Frame><p role="status">Hämtar kostnadsunderlag…</p></Frame>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (orgError || !actor || !organizationId || typeof token !== 'string' || !token ||
    session.user.id !== actor || ![actor, organizationId, projectId].every(v => typeof v === 'string' && uuid.test(v)))
    return <Frame><p role="alert">Kostnadsunderlaget är inte tillgängligt.</p></Frame>;
  return <SessionEvidence key={`${boundary}:${projectId}`} boundary={boundary} authority={{ actorId: actor, accessToken: token, organizationId, projectId }} />;
}
async function readEvidence(client: ReadClient, authority: Authority, signal: AbortSignal): Promise<ProjectCostEvidence> {
  const controller = new AbortController(), started = performance.now();
  const forward = () => controller.abort();
  signal.addEventListener('abort', forward, { once: true });
  if (signal.aborted) forward();
  const deadline = setTimeout(forward, 15_000);
  let listener: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    listener = () => reject(new Error('Kostnadsunderlaget kunde inte hämtas.'));
    controller.signal.addEventListener('abort', listener, { once: true });
    if (controller.signal.aborted) listener();
  });
  const fresh = () => {
    if (controller.signal.aborted || performance.now() - started >= 15_000)
      throw new Error('Kostnadsunderlaget kunde inte hämtas.');
  };
  const sessionMatches = async () => {
    const s = await Promise.race([Promise.resolve(client.auth.getSession()), stop]);
    fresh();
    if (s.error || s.data.session?.access_token !== authority.accessToken || s.data.session.user.id !== authority.actorId)
      throw new Error('Kostnadsunderlaget kunde inte hämtas.');
  };
  try {
    await sessionMatches();
    const result = await Promise.race([
      Promise.resolve(client.rpc('read_operations_project_cost_evidence_v1', {
        p_organization_id: authority.organizationId, p_project_id: authority.projectId,
      }).setHeader('Authorization', `Bearer ${authority.accessToken}`).abortSignal(controller.signal)), stop,
    ]);
    fresh();
    if (result.error) throw new Error('Kostnadsunderlaget kunde inte hämtas.');
    const data = validateProjectCostEvidence(result.data, authority.organizationId, authority.projectId);
    fresh();
    await sessionMatches();
    return data;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', forward);
    controller.signal.removeEventListener('abort', listener);
  }
}
function SessionEvidence({ authority, boundary }: { authority: Authority; boundary: string }) {
  const query = useQuery({
    queryKey: ['operations-project-cost-evidence', authority.actorId, authority.organizationId, authority.projectId, boundary],
    queryFn: ({ signal }) => readEvidence(supabase as unknown as ReadClient, authority, signal),
    staleTime: 0, gcTime: 0, meta: { persist: false }, retry: false,
    refetchInterval: 30_000, refetchOnWindowFocus: 'always',
  });
  let content;
  if (query.isPending || query.isFetching) content = <p role="status">Hämtar kostnadsunderlag…</p>;
  else if (query.error) content = <p role="alert">Kostnadsunderlaget är inte tillgängligt.</p>;
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
  return <Frame>{content}</Frame>;
}

export function ProjectCostEvidencePanel(props: { projectId: string }) {
  if (import.meta.env.VITE_OPERATIONS_COST_EVIDENCE_ENABLED !== 'true') return null;
  return <EnabledProjectCostEvidencePanel {...props} />;
}

