import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readObligationDrilldown,
  type ObligationDrilldownAuthority,
  type ObligationDrilldownClient,
} from '@/lib/economy/projectScopeObligationDrilldown';
import type { ScopeRootKind } from '@/lib/economy/projectScopeObligationEvidence';

export interface ObligationDrilldownSelection {
  rootKind: ScopeRootKind;
  rootId: string;
  obligationId: string;
  compositionSnapshotId: string;
  baselineEventId: string;
}
export function OperationsObligationDrilldownPanel({
  selection,
}: {
  selection: ObligationDrilldownSelection;
}) {
  if (import.meta.env.VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED !== 'true')
    return null;
  return <AuthorizedDrilldown selection={selection} />;
}
function Frame({ children }: { children: React.ReactNode }) {
  return <section aria-label="Kostnadspost">{children}</section>;
}
function AuthorizedDrilldown({
  selection,
}: {
  selection: ObligationDrilldownSelection;
}) {
  const { user, session, isLoading: authLoading } = useAuth();
  const {
    organizationId,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganizationId();
  const actor = user?.id;
  const token = session?.access_token;
  const boundary = useMemo(
    () =>
      actor && token && organizationId ? crypto.randomUUID() : 'unavailable',
    [actor, token, organizationId],
  );
  if (authLoading || orgLoading)
    return (
      <Frame>
        <p role="status">Hämtar kostnadsposten…</p>
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
          Kostnadsposten är inte tillgänglig för den aktiva sessionen.
        </p>
      </Frame>
    );
  return (
    <SessionDrilldown
      key={boundary}
      boundary={boundary}
      authority={{
        actorId: actor,
        accessToken: token,
        organizationId,
        ...selection,
      }}
    />
  );
}
function SessionDrilldown({
  boundary,
  authority,
}: {
  boundary: string;
  authority: ObligationDrilldownAuthority;
}) {
  const q = useQuery({
    queryKey: [
      'operations-obligation-drilldown-v1',
      authority.actorId,
      authority.organizationId,
      authority.rootKind,
      authority.rootId,
      authority.obligationId,
      authority.compositionSnapshotId,
      authority.baselineEventId,
      boundary,
    ],
    queryFn: ({ signal }) =>
      readObligationDrilldown(
        supabase as unknown as ObligationDrilldownClient,
        authority,
        signal,
      ),
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
        <p role="status">Hämtar kostnadsposten…</p>
      </Frame>
    );
  if (q.error || !q.data)
    return (
      <Frame>
        <p role="alert">
          Kostnadsposten kunde inte hämtas. Öppna posten igen från det sparade
          underlaget.
        </p>
      </Frame>
    );
  const d = q.data;
  const money = (v: number | null) =>
    v === null ? 'Saknas' : formatEvidenceMinorAmount(v, d.baseline.currency);
  return (
    <Frame>
      <h4>Sparad kostnadspost</h4>
      <dl>
        <dt>Sparad uppskattning</dt>
        <dd>{money(d.baseline.estimateMinor)}</dd>
        <dt>Sparat åtagande</dt>
        <dd>{money(d.baseline.committedMinor)}</dd>
      </dl>
      {d.state === 'baseline_changed' && (
        <p role="alert">
          Kostnadsposten har ändrats. Beloppen ovan visar den sparade versionen.
          Öppna ett nytt underlag för aktuella fakturakostnader.
        </p>
      )}
      {d.state === 'unsupported_basis' && (
        <p>Fakturakostnader kan inte visas för den här kostnadsposten.</p>
      )}
      {d.state === 'received_evidence' && (
        <>
          <h5>Mottaget fakturaunderlag</h5>
          {d.sources.length === 0 ? (
            <p>Mottaget fakturaunderlag saknas.</p>
          ) : (
            <ul>
              {d.sources.map((s) => (
                <li key={s.sourceKey}>
                  {s.bindingState === 'resolved' ? (
                    <>
                      <p>
                        {s.status === 'confirmed'
                          ? 'Bekräftad kostnad'
                          : 'Preliminär kostnad'}
                        : {money(s.amountMinor)}
                      </p>
                      {s.policyState === 'current' ? (
                        <dl>
                          <dt>Kopplad uppskattning</dt>
                          <dd>{money(s.replacesEstimateMinor)}</dd>
                          <dt>Kopplat åtagande</dt>
                          <dd>{money(s.consumesCommitmentMinor)}</dd>
                        </dl>
                      ) : (
                        <p>
                          Kopplingen till uppskattning och åtagande är inte
                          verifierad.
                        </p>
                      )}
                    </>
                  ) : (
                    <p role="alert">
                      Fakturakostnaden är inte verifierad mot den sparade
                      posten.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p>
        Alla kostnader är ännu inte verifierade. Personal, Catering och krediter
        saknar fullständigt underlag.
      </p>
      <p>Prognos, budget och marginal saknas.</p>
    </Frame>
  );
}
