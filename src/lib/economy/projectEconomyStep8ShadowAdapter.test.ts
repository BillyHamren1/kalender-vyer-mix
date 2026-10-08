// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  readProjectEconomyStep8Shadow,
  validateProjectEconomyStep8ShadowRead,
  type ProjectEconomyStep8ShadowAuthority,
  type ProjectEconomyStep8ShadowClient,
} from './projectEconomyStep8ShadowAdapter';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const authority: ProjectEconomyStep8ShadowAuthority = {
  actorId: id(1),
  accessToken: 'synthetic-token',
  organizationId: id(2),
  projectId: id(3),
};
const personnel = (overrides: Record<string, unknown> = {}) => ({
  organizationId: authority.organizationId,
  projectId: authority.projectId,
  sourceBookingId: id(10),
  sourceTimeStreamKey: 'a'.repeat(64),
  reportId: id(11),
  lineId: 'line-1',
  revision: 1,
  timeSnapshotVersion: 1,
  workDate: '2026-10-03',
  minutes: 120,
  amountMinor: 60000,
  currency: 'SEK',
  status: 'preliminary',
  coverage: 'complete',
  ...overrides,
});
const invoice = (overrides: Record<string, unknown> = {}) => ({
  organizationId: authority.organizationId,
  projectId: authority.projectId,
  sourceOrganizationId: id(20),
  invoiceId: id(21),
  allocationId: id(22),
  revision: 1,
  sourceProtocol: 'v2',
  sourceEconomicRevision: 1,
  sourceEconomicFingerprint: 'e'.repeat(64),
  sourceObservationId: id(23),
  publicationFingerprint: 'b'.repeat(64),
  documentFingerprint: 'c'.repeat(64),
  kind: 'invoice',
  amountMinor: 540000,
  currency: 'SEK',
  status: 'preliminary',
  approvalState: 'pending',
  accountingState: 'draft',
  settlementState: 'unpaid',
  sourceChanged: false,
  creditRelationCoverage: 'not_applicable',
  creditRelationshipFingerprint: null,
  sourceAnchor: 'f'.repeat(64),
  creditedSourceAnchor: null,
  unallocatedMinor: 0,
  exceptions: [],
  ...overrides,
});
const evidence = (overrides: Record<string, unknown> = {}) => ({
  schema: 'operations-project-economy-step8-shadow.v1',
  organizationId: authority.organizationId,
  projectId: authority.projectId,
  generatedAt: '2026-10-03T21:45:00Z',
  authority: 'operations_received_evidence',
  personnel: [
    personnel(),
    personnel({
      sourceBookingId: id(12),
      sourceTimeStreamKey: 'd'.repeat(64),
      lineId: 'line-2',
      minutes: 90,
      amountMinor: null,
      coverage: 'missing_rate',
    }),
  ],
  invoices: [invoice()],
  exceptions: [{
    category: 'personnel',
    identity: `${'d'.repeat(64)}:line-2`,
    code: 'missing_rate',
    amountMinor: null,
  }],
  coverage: { personnel: 'incomplete', invoices: 'complete' },
  financeRecalculated: false,
  authoritativeTotals: false,
  replacesLegacyTotals: false,
  shadowOnly: true,
  ...overrides,
});

describe('Step 8 Operations shadow adapter', () => {
  it('preserves two booking identities and missing cost as null without calculating', () => {
    const result = validateProjectEconomyStep8ShadowRead(evidence(), authority);
    expect(result.personnel.map((row) => row.sourceBookingId)).toEqual([id(10), id(12)]);
    expect(result.personnel[1].minutes).toBe(90);
    expect(result.personnel[1].amountMinor).toBeNull();
    expect(result.financeRecalculated).toBe(false);
    expect(result.authoritativeTotals).toBe(false);
  });

  it('preserves the same allocation identity and amount from preliminary to confirmed', () => {
    const preliminary = validateProjectEconomyStep8ShadowRead(evidence(), authority).invoices[0];
    const confirmed = validateProjectEconomyStep8ShadowRead(evidence({
      invoices: [invoice({ revision: 2, status: 'confirmed', approvalState: 'not_pending' })],
    }), authority).invoices[0];
    expect(confirmed.invoiceId).toBe(preliminary.invoiceId);
    expect(confirmed.allocationId).toBe(preliminary.allocationId);
    expect(confirmed.amountMinor).toBe(preliminary.amountMinor);
    expect(confirmed.revision).toBe(2);
    expect(confirmed.status).toBe('confirmed');
  });

  it('keeps a linked credit binding plus source change, rejection, and unallocated states explicit', () => {
    const credit = invoice({
      invoiceId: id(24), allocationId: id(25), kind: 'credit', amountMinor: -10000,
      sourceChanged: true, creditRelationCoverage: 'linked',
      creditRelationshipFingerprint: '1'.repeat(64), sourceAnchor: '2'.repeat(64),
      creditedSourceAnchor: '3'.repeat(64), unallocatedMinor: -1000,
      status: 'rejected', exceptions: [
        'source_changed_after_import','unallocated_amount','rejected_document',
      ],
    });
    const result = validateProjectEconomyStep8ShadowRead(evidence({ invoices: [credit] }), authority);
    expect(result.invoices[0].exceptions).toEqual([
      'source_changed_after_import','unallocated_amount','rejected_document',
    ]);
    expect(result.invoices[0].creditRelationshipFingerprint).toBe('1'.repeat(64));
    expect(result.invoices[0].creditedSourceAnchor).toBe('3'.repeat(64));
  });

  it('fails closed when a linked credit is missing its exact relationship binding', () => {
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({
      invoices: [invoice({
        kind: 'credit',amountMinor: -10000,creditRelationCoverage: 'linked',
        creditRelationshipFingerprint: '1'.repeat(64),sourceAnchor: '2'.repeat(64),creditedSourceAnchor: null,
      })],
    }),authority)).toThrow();
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({
      invoices: [invoice({
        kind: 'credit',amountMinor: -10000,creditRelationCoverage: 'linked',
        creditRelationshipFingerprint: '1'.repeat(64),sourceAnchor: '2'.repeat(64),
        creditedSourceAnchor: '2'.repeat(64),
      })],
    }),authority)).toThrow();
  });

  it('preserves an unresolved v1 credit as unresolved with nullable relationship evidence', () => {
    const result=validateProjectEconomyStep8ShadowRead(evidence({
      invoices:[invoice({
        sourceProtocol:'v1',sourceAnchor:null,kind:'credit',amountMinor:-10000,
        creditRelationCoverage:'unresolved',creditRelationshipFingerprint:null,creditedSourceAnchor:null,
        exceptions:['credit_relation_unresolved'],
      })],
    }),authority);
    expect(result.invoices[0].creditRelationCoverage).toBe('unresolved');
    expect(result.invoices[0].creditRelationshipFingerprint).toBeNull();
    expect(result.invoices[0].sourceAnchor).toBeNull();
    expect(result.invoices[0].creditedSourceAnchor).toBeNull();
  });

  it('rejects foreign scope, private rate fields, fake zero, and a Finance calculation claim', () => {
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({ projectId: id(99) }), authority)).toThrow();
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({
      personnel: [personnel({ hourlyRateMinor: 30000 })],
    }), authority)).toThrow();
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({
      personnel: [personnel({ coverage: 'missing_rate', amountMinor: 0 })],
    }), authority)).toThrow();
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({
      invoices: [invoice({ sourceProtocol: 'conflict', sourceEconomicFingerprint: null })],
    }), authority)).toThrow();
    expect(() => validateProjectEconomyStep8ShadowRead(evidence({ financeRecalculated: true }), authority)).toThrow();
  });

  it('sends an authenticated exact RPC and revalidates the unchanged session', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: authority.accessToken, user: { id: authority.actorId } } },
      error: null,
    });
    const abortSignal = vi.fn().mockResolvedValue({ data: evidence(), error: null });
    const setHeader = vi.fn().mockReturnValue({ abortSignal });
    const rpc = vi.fn().mockReturnValue({ setHeader });
    const result = await readProjectEconomyStep8Shadow(
      { auth: { getSession }, rpc } as unknown as ProjectEconomyStep8ShadowClient,
      authority,
      new AbortController().signal,
    );
    expect(result.projectId).toBe(authority.projectId);
    expect(rpc).toHaveBeenCalledWith('read_operations_project_economy_step8_shadow_v1', {
      p_request: {
        schemaVersion: 'operations-project-economy-step8-shadow-read.v1',
        organizationId: authority.organizationId,
        projectId: authority.projectId,
      },
    });
    expect(setHeader).toHaveBeenCalledWith('Authorization', `Bearer ${authority.accessToken}`);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('rejects a session change after the response', async () => {
    const getSession = vi.fn()
      .mockResolvedValueOnce({
        data: { session: { access_token: authority.accessToken, user: { id: authority.actorId } } }, error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'replaced', user: { id: authority.actorId } } }, error: null,
      });
    const client = {
      auth: { getSession },
      rpc: () => ({ setHeader: () => ({ abortSignal: () => Promise.resolve({ data: evidence(), error: null }) }) }),
    } as unknown as ProjectEconomyStep8ShadowClient;
    await expect(readProjectEconomyStep8Shadow(client, authority, new AbortController().signal)).rejects.toThrow('Sessionen har ändrats');
  });
});
