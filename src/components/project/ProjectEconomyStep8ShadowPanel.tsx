import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readProjectEconomyStep8Shadow,
  type ProjectEconomyStep8ShadowAuthority,
  type ProjectEconomyStep8ShadowClient,
  type ProjectEconomyStep8ShadowRead,
} from '@/lib/economy/projectEconomyStep8ShadowAdapter';

export function ProjectEconomyStep8ShadowPanel({ projectId }: { projectId: string }) {
  if (import.meta.env.VITE_PROJECT_ECONOMY_STEP8_SHADOW_ENABLED !== 'true') return null;
  return <AuthorizedShadowPanel projectId={projectId} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Card data-testid="project-economy-step8-shadow">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Parallellt ekonomiskt underlag</CardTitle>
          <Badge variant="outline">Skuggvy</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          Vyn visar mottaget radunderlag från Operations. Den räknar inte om belopp,
          påverkar inga officiella totaler och ersätter inte den befintliga ekonomisammanställningen.
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function AuthorizedShadowPanel({ projectId }: { projectId: string }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationId();
  const actorId = user?.id;
  const accessToken = session?.access_token;
  const boundary = useMemo(
    () => actorId && accessToken && organizationId ? crypto.randomUUID() : 'unavailable',
    [actorId, accessToken, organizationId],
  );
  if (authLoading || orgLoading) return <Frame><p role="status">Hämtar parallellt underlag…</p></Frame>;
  if (
    orgError || !actorId || typeof accessToken !== 'string' || !accessToken || !organizationId ||
    session?.user.id !== actorId
  ) return <Frame><p role="alert">Underlaget är inte tillgängligt för den aktiva sessionen.</p></Frame>;
  return <ShadowForSession
    key={boundary}
    boundary={boundary}
    authority={{ actorId, accessToken, organizationId, projectId }}
  />;
}

function ShadowForSession({
  boundary,
  authority,
}: {
  boundary: string;
  authority: ProjectEconomyStep8ShadowAuthority;
}) {
  const query = useQuery({
    queryKey: [
      'operations-project-economy-step8-shadow-v1',authority.actorId,authority.organizationId,
      authority.projectId,boundary,
    ],
    queryFn: ({ signal }) => readProjectEconomyStep8Shadow(
      supabase as unknown as ProjectEconomyStep8ShadowClient,
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
  if (query.isPending) return <Frame><p role="status">Hämtar parallellt underlag…</p></Frame>;
  if (query.error || !query.data) return <Frame><p role="alert">Det parallella underlaget kunde inte hämtas.</p></Frame>;
  return <ShadowRows data={query.data} />;
}

const statusLabel = { preliminary: 'Preliminär', confirmed: 'Bekräftad', rejected: 'Avvisad' };
const exceptionLabel: Record<string,string> = {
  missing_rate: 'Giltig kostnadssats saknas',
  source_changed_after_import: 'Källan har ändrats efter import',
  credit_relation_unresolved: 'Kreditens koppling är inte löst',
  unallocated_amount: 'En del av dokumentet är ofördelad',
  rejected_document: 'Dokumentet är avvisat',
};

function ShadowRows({ data }: { data: ProjectEconomyStep8ShadowRead }) {
  const money = (amount: number | null, currency: string) =>
    amount === null ? 'Saknas' : formatEvidenceMinorAmount(amount, currency);
  return <Frame>
    {(data.coverage.personnel !== 'complete' || data.coverage.invoices !== 'complete') &&
      <p role="alert">Täckningen är ofullständig. Saknade belopp visas som saknade, aldrig som noll.</p>}
    <section aria-label="Personalunderlag" className="space-y-2">
      <h4 className="font-semibold">Personalunderlag</h4>
      {data.personnel.length === 0 && <p>Inget mottaget personalunderlag.</p>}
      <ul className="space-y-2">
        {data.personnel.map((row) => <li
          key={`${row.sourceTimeStreamKey}:${row.lineId}`}
          className="rounded-md border border-border/50 p-3"
        >
          <p><strong>{money(row.amountMinor,row.currency)}</strong> · {statusLabel[row.status]}</p>
          <p className="text-sm text-muted-foreground">
            {row.workDate} · {row.minutes} min · bokning {row.sourceBookingId ?? 'saknas'}
          </p>
          <p className="text-xs text-muted-foreground">
            Rapport {row.reportId} · rad {row.lineId} · revision {row.revision} · tidsversion {row.timeSnapshotVersion}
          </p>
          <p className="break-all text-xs text-muted-foreground">Hashad tidsström {row.sourceTimeStreamKey}</p>
          {row.coverage === 'missing_rate' && <p role="alert">Giltig kostnadssats saknas.</p>}
        </li>)}
      </ul>
    </section>
    <section aria-label="Fakturaunderlag" className="space-y-2">
      <h4 className="font-semibold">Fakturaunderlag</h4>
      {data.invoices.length === 0 && <p>Inget mottaget fakturaunderlag.</p>}
      <ul className="space-y-2">
        {data.invoices.map((row) => <li
          key={`${row.invoiceId}:${row.allocationId}`}
          className="rounded-md border border-border/50 p-3"
        >
          <p><strong>{money(row.amountMinor,row.currency)}</strong> · {statusLabel[row.status]}</p>
          <p className="text-sm text-muted-foreground">
            Faktura {row.invoiceId} · fördelning {row.allocationId} · revision {row.revision}
          </p>
          <p className="text-xs text-muted-foreground">
            Källprotokoll {row.sourceProtocol} · ekonomiversion {row.sourceEconomicRevision}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            Ekonomifingeravtryck {row.sourceEconomicFingerprint}
          </p>
          <p className="text-xs text-muted-foreground">
            Typ {row.kind} · attest {row.approvalState} · bokföring {row.accountingState} · betalning {row.settlementState}
          </p>
          <p className="text-xs text-muted-foreground">
            Källändring {row.sourceChanged ? 'ja' : 'nej'} · kreditkoppling {row.creditRelationCoverage} ·
            {' '}ofördelat {money(row.unallocatedMinor,row.currency)}
          </p>
          <p className="break-all text-xs text-muted-foreground">Källobservation {row.sourceObservationId}</p>
          <p className="break-all text-xs text-muted-foreground">Publiceringsfingeravtryck {row.publicationFingerprint}</p>
          <p className="break-all text-xs text-muted-foreground">
            Egen källankare {row.sourceAnchor ?? 'Saknas'}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            Krediterad källankare {row.creditedSourceAnchor ?? 'Saknas'}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            Kreditrelationsfingeravtryck {row.creditRelationshipFingerprint ?? 'Saknas'}
          </p>
          {row.exceptions.map((code) => <p role="alert" key={code}>{exceptionLabel[code]}</p>)}
        </li>)}
      </ul>
    </section>
    {data.exceptions.length > 0 && <section aria-label="Avvikelser" className="space-y-1">
      <h4 className="font-semibold">Avvikelser</h4>
      <ul>{data.exceptions.map((exception) => <li key={`${exception.category}:${exception.identity}:${exception.code}`}>
        {exceptionLabel[exception.code]}
      </li>)}</ul>
    </section>}
    <p className="text-xs text-muted-foreground">Uppdaterat {new Date(data.generatedAt).toLocaleString('sv-SE')}</p>
  </Frame>;
}
