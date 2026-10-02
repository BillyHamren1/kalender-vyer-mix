import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readCateringProjectEvidenceParity,
  type CateringReadClient,
  type CateringReadAuthority,
} from '@/lib/economy/projectCateringEvidenceParity';
const sourceLabels = {
  pending: 'Ej granskad',
  approved: 'Godkänd tid',
  rejected: 'Avvisad tid',
};
const projectLabels = {
  preliminary: 'Preliminär',
  confirmed: 'Bekräftad',
  rejected: 'Avvisad',
};
export function OperationsCateringEvidenceParityPanel({
  projectId,
}: {
  projectId: string;
}) {
  if (import.meta.env.VITE_OPERATIONS_CATERING_PARITY_ENABLED !== 'true')
    return null;
  return <AuthorizedCateringEvidence projectId={projectId} />;
}
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cateringkostnadsunderlag</CardTitle>
      </CardHeader>
      <CardContent>
        <section aria-label="Cateringkostnadsunderlag">{children}</section>
      </CardContent>
    </Card>
  );
}
function AuthorizedCateringEvidence({ projectId }: { projectId: string }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const {
    organizationId,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganizationId();
  const token = session?.access_token,
    actor = user?.id;
  const boundary = useMemo(
    () =>
      token && actor && organizationId ? crypto.randomUUID() : 'unavailable',
    [token, actor, organizationId],
  );
  if (authLoading || orgLoading)
    return (
      <Frame>
        <p role="status">Hämtar Cateringunderlag…</p>
      </Frame>
    );
  if (
    orgError ||
    !actor ||
    !token ||
    !organizationId ||
    session.user.id !== actor
  )
    return (
      <Frame>
        <p role="alert">
          Cateringunderlaget är inte tillgängligt för den aktiva sessionen.
        </p>
      </Frame>
    );
  return (
    <CateringForSession
      key={boundary}
      boundary={boundary}
      authority={{
        actorId: actor,
        accessToken: token,
        organizationId,
        projectId,
      }}
    />
  );
}
function CateringForSession({
  boundary,
  authority,
}: {
  boundary: string;
  authority: CateringReadAuthority;
}) {
  const query = useQuery({
    queryKey: [
      'operations-catering-project-evidence-v3',
      authority.actorId,
      authority.organizationId,
      authority.projectId,
      boundary,
    ],
    queryFn: ({ signal }) =>
      readCateringProjectEvidenceParity(
        supabase as unknown as CateringReadClient,
        authority,
        signal,
      ),
    staleTime: 0,
    gcTime: 0,
    meta: { persist: false },
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const evidence = query.isFetching || query.isError ? undefined : query.data;
  return (
    <Frame>
      <p className="mb-3 text-sm text-muted-foreground">
        Beloppen kopieras från Operations sparade Cateringunderlag. Källans
        aktuella fullständighet är inte verifierad. Underlaget är ingen extra
        kostnad i projektets totaler eller en hel projektprognos.
      </p>
      {query.isFetching ? (
        <p role="status">Hämtar Cateringunderlag…</p>
      ) : query.isError ? (
        <p role="alert">Cateringunderlaget är inte tillgängligt.</p>
      ) : null}
      {evidence?.evidenceState === 'no_evidence' ? (
        <p>Inget mottaget aktivt Cateringunderlag för projektet.</p>
      ) : null}
      {evidence?.counts.missingCostLineCount ? (
        <p role="alert">
          Kostnad saknas för {evidence.counts.missingCostLineCount}{' '}
          Cateringrader ({evidence.counts.missingCostMinutes} minuter). Saknad
          kostnad visas inte som noll.
        </p>
      ) : null}
      {evidence?.lines.length && !evidence.currencyTotals.length ? (
        <p>
          Alla mottagna rader är avvisade och ingår inte i aktiva delbelopp.
        </p>
      ) : null}
      {evidence?.currencyTotals.map((t) => (
        <dl key={t.currency} className="my-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt>Preliminärt känt · {t.currency}</dt>
            <dd>
              {t.preliminaryKnownMinor === null
                ? '–'
                : formatEvidenceMinorAmount(
                    t.preliminaryKnownMinor,
                    t.currency,
                  )}
            </dd>
          </div>
          <div>
            <dt>Bekräftat känt · {t.currency}</dt>
            <dd>
              {t.confirmedKnownMinor === null
                ? '–'
                : formatEvidenceMinorAmount(t.confirmedKnownMinor, t.currency)}
            </dd>
          </div>
          <div>
            <dt>Mottaget aktivt belopp · {t.currency}</dt>
            <dd>
              {t.receivedTotalMinor === null
                ? '–'
                : formatEvidenceMinorAmount(t.receivedTotalMinor, t.currency)}
            </dd>
          </div>
        </dl>
      ))}
      {evidence?.lines.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tid</th>
                <th>Operations kostnad</th>
                <th>Projektgranskning</th>
                <th>Tidsgranskning</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {evidence.lines.map((row) => (
                <tr key={row.streamKey}>
                  <td>{row.workDate}</td>
                  <td>{row.minutes} min</td>
                  <td>
                    {row.amountMinor === null
                      ? 'Kostnad saknas'
                      : formatEvidenceMinorAmount(
                          row.amountMinor,
                          row.currency,
                        )}
                  </td>
                  <td>{projectLabels[row.status]}</td>
                  <td>{sourceLabels[row.sourceStatus]}</td>
                  <td>
                    Tid {row.sourceEntryVersion} · kostnad {row.revision}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {evidence?.withdrawals.length ? (
        <p>
          {evidence.withdrawals.length} tidigare underlag har dragits tillbaka
          från projektet. Beloppen ingår inte igen och det nya projektets
          underlag visas inte här.
        </p>
      ) : null}
    </Frame>
  );
}
