import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { supabase } from '@/integrations/supabase/client';
import { formatEvidenceMinorAmount } from '@/lib/economy/projectCostEvidence';
import {
  readScopeInvoiceCapture,
  type ScopeInvoiceCaptureReadAuthority,
  type ScopeInvoiceCaptureReadClient,
} from '@/lib/economy/projectScopeInvoiceCapture';
import { projectScopeInvoiceKernelEvidence } from '../../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';
import type { ScopeRootKind } from '@/lib/economy/projectScopeObligationEvidence';
import { OperationsScopeInvoiceLineEvidenceTable } from './OperationsScopeInvoiceLineEvidenceTable';

export interface ScopeInvoiceCaptureSelection {
  organizationId: string;
  rootKind: ScopeRootKind;
  rootId: string;
  compositionSnapshotId: string;
}
type CapturedView = {
  projection: Awaited<ReturnType<typeof projectScopeInvoiceKernelEvidence>>;
  excludedCount: number;
  unsupportedCount: number;
  inventoryChanged: boolean;
};
function Frame({ children }: { children: React.ReactNode }) {
  return <section aria-label="Fakturaunderlag för projektsamlingen">{children}</section>;
}
export function OperationsScopeInvoiceCapturePanel({
  selection,
}: {
  selection: ScopeInvoiceCaptureSelection;
}) {
  if (import.meta.env.VITE_OPERATIONS_SCOPE_INVOICE_CAPTURE_ENABLED !== 'true') return null;
  return <AuthorizedCapture selection={selection} />;
}
function AuthorizedCapture({ selection }: { selection: ScopeInvoiceCaptureSelection }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationId();
  const actor = user?.id, token = session?.access_token;
  const boundary = useMemo(
    () => actor && token && organizationId ? crypto.randomUUID() : 'unavailable',
    [actor, token, organizationId],
  );
  if (authLoading || orgLoading) return <Frame><p role="status">Hämtar fakturaunderlag…</p></Frame>;
  if (orgError || !actor || typeof token !== 'string' || !token || !organizationId ||
    organizationId !== selection.organizationId || session.user.id !== actor)
    return <Frame><p role="alert">Fakturaunderlaget är inte tillgängligt för den aktiva sessionen.</p></Frame>;
  return <CaptureForSession
    key={`${boundary}:${selection.rootKind}:${selection.rootId}:${selection.compositionSnapshotId}`}
    boundary={boundary}
    authority={{
      actorId: actor, accessToken: token, organizationId,
      request: {
        schema_version: 'operations-scope-invoice-capture-admin-read.v1',
        root_kind: selection.rootKind, root_id: selection.rootId,
        expected_composition_snapshot_id: selection.compositionSnapshotId,
      },
    }}
  />;
}
/** Reuse the existing Operations projection; this view defines no pricing or totals. */
async function readCapturedView(
  client: ScopeInvoiceCaptureReadClient,
  authority: ScopeInvoiceCaptureReadAuthority,
  signal: AbortSignal,
): Promise<CapturedView> {
  const controller = new AbortController(), started = performance.now();
  const forward = () => controller.abort();
  signal.addEventListener('abort', forward, { once: true });
  if (signal.aborted) forward();
  const deadline = setTimeout(forward, 15_000);
  let stopListening: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    stopListening = () => reject(new Error('Fakturaunderlaget kunde inte hämtas.'));
    controller.signal.addEventListener('abort', stopListening, { once: true });
    if (controller.signal.aborted) stopListening();
  });
  const fresh = () => {
    if (controller.signal.aborted || performance.now() - started >= 15_000)
      throw new Error('Fakturaunderlaget kunde inte hämtas.');
  };
  try {
    const capture = await Promise.race([readScopeInvoiceCapture(client, authority, controller.signal), stop]);
    fresh();
    const projection = await Promise.race([projectScopeInvoiceKernelEvidence(capture.evidence), stop]);
    fresh();
    // Async source validation/projection also belongs to the same session/deadline.
    const session = await Promise.race([Promise.resolve(client.auth.getSession()), stop]);
    fresh();
    if (session.error || session.data.session?.access_token !== authority.accessToken ||
      session.data.session.user.id !== authority.actorId)
      throw new Error('Fakturaunderlaget kunde inte hämtas.');
    return {
      projection,
      excludedCount: capture.evidence.source_inventory.filter(s => s.mapping_state === 'excluded').length,
      unsupportedCount: capture.evidence.source_inventory.filter(s => s.mapping_state === 'unsupported_basis').length,
      inventoryChanged: !capture.evidence.captured_inventory_matches_current,
    };
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', forward);
    controller.signal.removeEventListener('abort', stopListening);
  }
}
function CaptureForSession({
  authority, boundary,
}: {
  authority: ScopeInvoiceCaptureReadAuthority;
  boundary: string;
}) {
  const q = useQuery({
    queryKey: [
      'operations-scope-invoice-capture-v1', authority.actorId, authority.organizationId,
      authority.request.root_kind, authority.request.root_id,
      authority.request.expected_composition_snapshot_id, boundary,
    ],
    queryFn: ({ signal }) => readCapturedView(supabase as unknown as ScopeInvoiceCaptureReadClient, authority, signal),
    gcTime: 0, staleTime: 0, retry: false, meta: { persist: false },
    refetchInterval: 30_000, refetchOnWindowFocus: 'always',
  });
  if (q.isFetching || q.isPending) return <Frame><p role="status">Hämtar fakturaunderlag…</p></Frame>;
  if (q.error || !q.data) return <Frame><p role="alert">
    Fakturaunderlaget kunde inte hämtas. Hämta projektets underlag igen.
  </p></Frame>;
  const { projection: d, excludedCount, unsupportedCount, inventoryChanged } = q.data;
  const money = (minor: number | null) => minor === null ? 'Saknas' : formatEvidenceMinorAmount(minor, d.currency);
  return <Frame>
    <h3>Känt fakturaunderlag</h3>
    <p>Beloppen gäller mottagna, verifierade fakturakopplingar i den sparade projektsamlingen. De läggs inte ovanpå sparade uppskattningar eller andra kostnadsunderlag.</p>
    {d.known_captured_invoice_cost_minor === null ? <p>Verifierat fakturabelopp saknas.</p> : <dl>
      <dt>Preliminärt känt fakturabelopp</dt><dd>{money(d.preliminary_captured_invoice_cost_minor)}</dd>
      <dt>Bekräftat känt fakturabelopp</dt><dd>{money(d.confirmed_captured_invoice_cost_minor)}</dd>
      <dt>Känt mottaget fakturabelopp</dt><dd>{money(d.known_captured_invoice_cost_minor)}</dd>
    </dl>}
    {excludedCount > 0 && <p role="alert">{excludedCount} fakturakopplingar är inte verifierade och ingår inte i det kända beloppet.</p>}
    {unsupportedCount > 0 && <p role="alert">{unsupportedCount} kopplingar har kostnadsunderlag som inte kan visas som fakturakostnad.</p>}
    {inventoryChanged && <p>Fakturareferenserna har ändrats sedan det manuella underlaget sparades. Beloppen avser den aktuella mottagna fakturakopplingen.</p>}
    <p>Alla projektets kostnader är ännu inte verifierade. Personal, Catering, krediter och andra kostnader saknar fullständig täckning.</p>
    <p>Prognos, budget och marginal saknas.</p>
    <p>Kontrollerat {new Date(d.as_of).toLocaleString('sv-SE')} · Sparad projektsamling version {d.scope_revision}</p>
    <OperationsScopeInvoiceLineEvidenceTable
      boundary={boundary}
      authority={{
        actorId: authority.actorId,
        accessToken: authority.accessToken,
        organizationId: authority.organizationId,
        request: {
          schema_version: 'operations-scope-invoice-line-admin-read.v1',
          root_kind: authority.request.root_kind,
          root_id: authority.request.root_id,
          expected_composition_snapshot_id: authority.request.expected_composition_snapshot_id,
        },
      }}
    />
  </Frame>;
}
