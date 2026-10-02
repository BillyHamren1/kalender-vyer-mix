import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readScopeObligationEvidence,
  type ScopeEvidenceReadAuthority,
  type ScopeEvidenceReadClient,
  type ScopeObligationEvidence,
} from '@/lib/economy/projectScopeObligationEvidence';
import { OperationsObligationDrilldownPanel } from './OperationsObligationDrilldownPanel';
export function OperationsScopeObligationEvidencePanel({
  projectId,
}: {
  projectId: string;
}) {
  if (
    import.meta.env.VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED !== 'true'
  )
    return null;
  return <AuthorizedScopeEvidence projectId={projectId} />;
}
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sparat kostnadsunderlag</CardTitle>
      </CardHeader>
      <CardContent>
        <section aria-label="Sparat kostnadsunderlag">{children}</section>
      </CardContent>
    </Card>
  );
}
function AuthorizedScopeEvidence({ projectId }: { projectId: string }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const {
    organizationId,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganizationId();
  const actor = user?.id,
    token = session?.access_token;
  const boundary = useMemo(
    () =>
      actor && token && organizationId ? crypto.randomUUID() : 'unavailable',
    [actor, token, organizationId],
  );
  if (authLoading || orgLoading)
    return (
      <Frame>
        <p role="status">Hämtar sparat underlag…</p>
      </Frame>
    );
  if (
    orgError ||
    !actor ||
    typeof token !== 'string' ||
    !token ||
    !organizationId ||
    session.user.id !== actor
  )
    return (
      <Frame>
        <p role="alert">
          Underlaget är inte tillgängligt för den aktiva sessionen.
        </p>
      </Frame>
    );
  return (
    <ScopeForSession
      key={boundary}
      boundary={boundary}
      authority={{
        actorId: actor,
        accessToken: token,
        organizationId,
        rootKind: 'project',
        rootId: projectId,
      }}
    />
  );
}
const categoryLabels = {
  personnel: 'Personal',
  supplier: 'Leverantörer',
  catering: 'Catering',
  other: 'Övrigt',
};
const sourceLabels = {
  preliminary: 'Preliminär',
  confirmed: 'Bekräftad',
  rejected: 'Avvisad',
};
function ScopeForSession({
  boundary,
  authority,
}: {
  boundary: string;
  authority: ScopeEvidenceReadAuthority;
}) {
  const readAttempt = useRef(0);
  const q = useQuery({
    queryKey: [
      'operations-scope-obligation-evidence-v1',
      authority.actorId,
      authority.organizationId,
      authority.rootKind,
      authority.rootId,
      boundary,
    ],
    queryFn: ({ signal }) => {
      readAttempt.current += 1;
      return readScopeObligationEvidence(
        supabase as unknown as ScopeEvidenceReadClient,
        authority,
        signal,
      );
    },
    meta: { persist: false },
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
  if (q.isFetching || q.isPending)
    return (
      <Frame>
        <p role="status">Hämtar sparat underlag…</p>
      </Frame>
    );
  if (q.error || !q.data)
    return (
      <Frame>
        <p role="alert">
          Det sparade underlaget kunde inte hämtas för den aktiva sessionen.
        </p>
      </Frame>
    );
  const d = q.data;
  if (d.state !== 'evidence')
    return (
      <Frame>
        <p>Inget sparat kostnadsunderlag finns för projektet.</p>
        <p>Prognos saknas.</p>
      </Frame>
    );
  // Each successful scope read owns a fresh selection, even if its response is identical.
  return (
    <SavedScopeRows
      key={`${d.rootKind}:${d.rootId}:${d.snapshotId}:${String(d.referenceCurrentness.membership)}:${q.dataUpdatedAt}:${readAttempt.current}`}
      d={d}
    />
  );
}
function SavedScopeRows({ d }: { d: ScopeObligationEvidence }) {
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(
    null,
  );
  const detailsEnabled =
    import.meta.env.VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED === 'true';
  const canOpenDetails =
    detailsEnabled &&
    d.referenceCurrentness.membership === true &&
    !!d.snapshotId;
  const selected = canOpenDetails
    ? d.baselines.find((b) => b.baselineEventId === selectedBaselineId)
    : undefined;
  const money = (v: number | null) =>
    v === null ? 'Saknas' : formatEvidenceMinorAmount(v, d.currency!);
  const current =
    d.referenceCurrentness.membership === true &&
    d.referenceCurrentness.baselines === true &&
    d.referenceCurrentness.sources === true;
  return (
    <Frame>
      <p>
        Beloppen gäller de sparade manuella posterna. Alla projektets kostnader
        är ännu inte verifierade.
      </p>
      {!current && (
        <p role="alert">
          Aktualiteten är inte fullt verifierad. Beloppen visar det sparade
          underlaget.
        </p>
      )}
      <dl>
        <dt>Sparad uppskattning</dt>
        <dd>{money(d.knownEstimateMinor)}</dd>
        <dt>Sparade åtaganden</dt>
        <dd>{money(d.knownCommitmentMinor)}</dd>
      </dl>
      {d.baselines.length === 0 && (
        <p>Det sparade underlaget innehåller inga kostnadsposter.</p>
      )}
      {d.baselines.length > 0 && !d.allSelectedEstimatesKnown && (
        <p>Uppskattning saknas för en eller flera sparade poster.</p>
      )}
      {d.baselines.length > 0 && !d.allSelectedCommitmentsKnown && (
        <p>Åtagande saknas för en eller flera sparade poster.</p>
      )}
      <p>Prognos saknas. Budget och marginal kan ännu inte visas.</p>
      <p>
        Sparat {new Date(d.publishedAt!).toLocaleString('sv-SE')} · Version{' '}
        {d.compositionRevision}
      </p>
      {d.baselines.length > 0 && (
        <table>
          <caption>Sparade kostnadsposter</caption>
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Uppskattning</th>
              <th>Åtagande</th>
              <th>Version</th>
              {detailsEnabled && <th>Detaljer</th>}
            </tr>
          </thead>
          <tbody>
            {d.baselines.map((b, index) => (
              <tr key={b.baselineEventId}>
                <td>{categoryLabels[b.category]}</td>
                <td>{money(b.estimateMinor)}</td>
                <td>{money(b.committedMinor)}</td>
                <td>{b.baselineRevision}</td>
                {detailsEnabled && (
                  <td>
                    <button
                      type="button"
                      disabled={!canOpenDetails}
                      aria-label={`${selected?.baselineEventId === b.baselineEventId ? 'Dölj' : 'Visa'} detaljer för kostnadspost ${index + 1}`}
                      aria-expanded={
                        selected?.baselineEventId === b.baselineEventId
                      }
                      onClick={() =>
                        setSelectedBaselineId((previous) =>
                          previous === b.baselineEventId
                            ? null
                            : b.baselineEventId,
                        )
                      }
                    >
                      {selected?.baselineEventId === b.baselineEventId
                        ? 'Dölj detaljer'
                        : 'Visa detaljer'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detailsEnabled && !canOpenDetails && d.baselines.length > 0 && (
        <p>Öppna ett nytt underlag för att visa kostnadsposternas detaljer.</p>
      )}
      {selected && d.snapshotId && (
        <OperationsObligationDrilldownPanel
          key={`${d.snapshotId}:${selected.baselineEventId}`}
          selection={{
            rootKind: d.rootKind,
            rootId: d.rootId,
            obligationId: selected.obligationId,
            compositionSnapshotId: d.snapshotId,
            baselineEventId: selected.baselineEventId,
          }}
        />
      )}
      {d.sources.length > 0 && (
        <table>
          <caption>Kopierade leverantörsbelopp</caption>
          <thead>
            <tr>
              <th>Belopp</th>
              <th>Status vid sparande</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {d.sources.map((s) => (
              <tr key={s.sourceAnchor}>
                <td>{money(s.observedAmountMinor)}</td>
                <td>{sourceLabels[s.observedStatus]}</td>
                <td>{s.sourceEconomicRevision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}
