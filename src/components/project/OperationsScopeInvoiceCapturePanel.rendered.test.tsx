// @vitest-environment jsdom
// Actual React/query/strict source projection; synthetic Auth and RPC, not native authority proof.
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { scopeInvoiceInventoryFingerprint, type ScopeInvoiceKernelEvidence } from '../../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';
import { OperationsScopeInvoiceCapturePanel, type ScopeInvoiceCaptureSelection } from './OperationsScopeInvoiceCapturePanel';
import { OperationsScopeObligationEvidencePanel } from './OperationsScopeObligationEvidencePanel';
import { validateScopeObligationEvidence } from '@/lib/economy/projectScopeObligationEvidence';
import { validateScopeInvoiceKernelEvidence } from '../../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts';

const state = vi.hoisted(() => ({
  actor: '11111111-1111-4111-8111-111111111111' as string | null,
  org: '22222222-2222-4222-8222-222222222222' as string | null,
  token: 'synthetic-token-a' as string | null, read: vi.fn(), scope: vi.fn(),
  session: vi.fn(), rpc: vi.fn(), headers: vi.fn(), signals: [] as AbortSignal[],
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.actor ? { id: state.actor } : null, session: state.actor && state.token ? { access_token: state.token, user: { id: state.actor } } : null, isLoading: false }),
}));
vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: state.org, isLoading: false, error: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: state.session }, rpc: (name: string, args: unknown) => {
    state.rpc(name, args);
    return { setHeader: (header: string, value: string) => {
      state.headers(header, value);
      return { abortSignal: (signal: AbortSignal) => {
        state.signals.push(signal);
        return name === 'read_operations_scope_obligation_evidence_v1' ? state.scope() : state.read();
      } };
    } };
  } },
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org = '22222222-2222-4222-8222-222222222222', actor = '11111111-1111-4111-8111-111111111111';
const selection = (): ScopeInvoiceCaptureSelection => ({ organizationId: org, rootKind: 'project', rootId: id(1), compositionSnapshotId: id(2) });
async function fixture(amount = 540000) {
  const s = { source_anchor: 'a'.repeat(64), binding_event_id: id(10), source_organization_id: id(11), invoice_id: id(12),
    source_snapshot_id: id(13), source_economic_revision: 1, source_economic_fingerprint: 'b'.repeat(64), source_raw_sha256: 'c'.repeat(64),
    resolved: true, reason: null, current_snapshot_id: id(13), current_raw_sha256: 'c'.repeat(64), status: 'preliminary' as const, amount_minor: amount,
    policy_state: 'current' as const, policy_event_id: id(14), policy_revision: 1, policy_fingerprint: 'd'.repeat(64), replaces_estimate_minor: 500000, consumes_commitment_minor: null };
  const inventory = [{ source_anchor: s.source_anchor, project_id: id(1), obligation_id: id(3), binding_event_id: s.binding_event_id,
    source_organization_id: s.source_organization_id, invoice_id: s.invoice_id, source_snapshot_id: s.source_snapshot_id,
    source_economic_revision: s.source_economic_revision, source_economic_fingerprint: s.source_economic_fingerprint,
    source_raw_sha256: s.source_raw_sha256, current_snapshot_id: s.current_snapshot_id, current_raw_sha256: s.current_raw_sha256,
    policy_state: s.policy_state, policy_event_id: s.policy_event_id, policy_revision: s.policy_revision, policy_fingerprint: s.policy_fingerprint,
    mapping_state: 'charging' as const, reason: null }];
  const saved = inventory.map(x => ({ source_anchor:x.source_anchor,project_id:x.project_id,obligation_id:x.obligation_id,binding_event_id:x.binding_event_id,
    source_snapshot_id:x.source_snapshot_id,source_economic_revision:x.source_economic_revision,source_economic_fingerprint:x.source_economic_fingerprint,
    source_raw_sha256:x.source_raw_sha256,binding_state:'bound_original' as const,policy_state:x.policy_state,policy_event_id:x.policy_event_id,policy_revision:x.policy_revision,policy_fingerprint:x.policy_fingerprint }));
  const evidence: ScopeInvoiceKernelEvidence = {
    schema_version:'operations-scope-invoice-kernel-evidence.v1',organization_id:org,economic_scope_id:id(4),scope_snapshot_id:id(5),scope_revision:1,
    membership_fingerprint:'e'.repeat(64),composition_snapshot_id:id(2),composition_revision:1,composition_fingerprint:'f'.repeat(64),root_kind:'project',root_id:id(1),
    currency:'SEK',membership_currentness:'as_of_graph',source_currentness:'saved_receiver_heads_only',captured_inventory_matches_current:true,
    captured_inventory_fingerprint:await scopeInvoiceInventoryFingerprint(inventory),as_of:'2026-10-02T10:00:00Z',
    members:[{ project_id:id(1),obligation_id:id(3),captured_baseline_event_id:id(6),captured_baseline_revision:1,captured_baseline_fingerprint:'a'.repeat(64),
      kernel_evidence:{ schema_version:'operations-invoice-obligation-kernel-evidence.v1',state:'captured',authority_scope:'local_project_only',
        source_currentness:'saved_receiver_heads_only',organization_id:org,project_id:id(1),obligation_id:id(3),category_coverage:'unavailable',source_coverage:'unavailable',
        as_of:'2026-10-02T10:00:00Z',baseline:{event_id:id(6),revision:1,fingerprint:'a'.repeat(64),evidence_basis:'operations_manual',currency:'SEK',category:'supplier',
          cost_basis:'invoice',estimate_minor:500000,committed_minor:null},sources:[s],diagnostics:[],credit_eligible:false,shadow_only:true,eac_minor:null,remaining_minor:null } }],
    source_inventory:inventory,saved_source_references:saved,diagnostics:[],category_coverage:{personnel:'unavailable',supplier:'unavailable',catering:'unavailable',other:'unavailable'},
    source_coverage:'unavailable',credit_eligible:false,remaining_minor:null,eac_minor:null,budget_minor:null,shadow_only:true,
  };
  return { schema_version:'operations-scope-invoice-capture-admin-evidence.v1',authority_scope:'canonical_scope_invoice_capture',evidence };
}
function manual() {
  return { schema:'operations-scope-obligation-evidence.v1',organizationId:org,rootKind:'project',rootId:id(1),generatedAt:'2026-10-02T10:00:00Z',
    state:'evidence',economicScopeId:id(4),scopeRevision:1,currentScopeRevision:1,membershipFingerprint:'e'.repeat(64),compositionRevision:1,snapshotId:id(2),
    snapshotFingerprint:'f'.repeat(64),publishedAt:'2026-10-02T10:00:00Z',currency:'SEK',referenceCurrentness:{membership:true,baselines:true,sources:false},
    authorityScope:'canonical_scope_composition',pricingBasis:'operations_manual_composition',sourceCurrentness:'receiver_v1_only',upstreamCurrentness:'unverified',
    coverage:'unavailable',categoryCoverage:{personnel:'unavailable',supplier:'unavailable',catering:'unavailable',other:'unavailable'},
    knownEstimateMinor:500000,knownCommitmentMinor:null,allSelectedEstimatesKnown:true,allSelectedCommitmentsKnown:false,eacMinor:null,budgetMinor:null,marginMinor:null,shadowOnly:true,
    baselines:[{baselineEventId:id(6),projectId:id(1),obligationId:id(3),baselineRevision:1,baselineFingerprint:'a'.repeat(64),evidenceBasis:'operations_manual',
      authorityScope:'local_project_only',category:'supplier',currency:'SEK',costBasis:'invoice',estimateMinor:500000,committedMinor:null}],sources:[] };
}
const clients: QueryClient[] = [];
function mount(parent = false) {
  let current = selection();
  const client = new QueryClient({ defaultOptions: { queries: { retry:false,gcTime:0 } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}>{parent ? <OperationsScopeObligationEvidencePanel projectId={current.rootId}/> : <OperationsScopeInvoiceCapturePanel selection={current}/>}</QueryClientProvider>;
  const v=render(tree());
  return { ...v, client, redraw:(next=current)=>{current=next;v.rerender(tree());} };
}
beforeEach(()=>{
  state.actor=actor;state.org=org;state.token='synthetic-token-a';state.read.mockReset();state.scope.mockReset();state.session.mockReset();state.rpc.mockReset();state.headers.mockReset();state.signals=[];
  state.session.mockImplementation(()=>Promise.resolve({data:{session:state.actor && state.token ? {access_token:state.token,user:{id:state.actor}}:null},error:null}));
  vi.stubGlobal('crypto',webcrypto);
  vi.stubEnv('VITE_OPERATIONS_SCOPE_INVOICE_CAPTURE_ENABLED','true');
  vi.stubEnv('VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED','true');
  vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED','false');
});
afterEach(()=>{cleanup();for(const c of clients.splice(0))c.clear();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('whole-scope copied capture actual renderer with synthetic RPC',()=>{
  it('default-off never reads',()=>{vi.stubEnv('VITE_OPERATIONS_SCOPE_INVOICE_CAPTURE_ENABLED','false');expect(mount().container.textContent).toBe('');expect(state.rpc).not.toHaveBeenCalled();});
  it('uses the exact displayed composition token, not the first child or caller money',async()=>{
    state.read.mockResolvedValue({data:await fixture(),error:null});mount();
    await screen.findByText('Känt mottaget fakturabelopp');
    expect(state.rpc).toHaveBeenCalledWith('read_operations_scope_invoice_capture_admin_v1',{p_request:{schema_version:'operations-scope-invoice-capture-admin-read.v1',root_kind:'project',root_id:id(1),expected_composition_snapshot_id:id(2)}});
    expect(state.headers).toHaveBeenCalledWith('Authorization','Bearer synthetic-token-a');
    expect(screen.getByRole('region').textContent?.replace(/\s/g,'')).toContain('5400,00kr');
    expect(screen.getByText('Prognos, budget och marginal saknas.')).toBeTruthy();
    expect(screen.getByRole('region').textContent).not.toContain('source_anchor');
  });
  it('same saved scope keeps manual5000 and invoice5400 as distinct bases with no10400 total',async()=>{
    validateScopeObligationEvidence(manual(),org,'project',id(1));
    state.scope.mockResolvedValue({data:manual(),error:null});state.read.mockResolvedValue({data:await fixture(),error:null});mount(true);
    await screen.findByText('Känt mottaget fakturabelopp');
    const whole=screen.getByRole('region',{name:'Sparat kostnadsunderlag'}).textContent?.replace(/\s/g,'');
    expect(whole).toContain('5000,00kr');expect(whole).toContain('5400,00kr');expect(whole).not.toContain('10400');
    expect(screen.getByText(/Fullständig kostnadstäckning saknas/)).toBeTruthy();
  });
  it.each(['membership','baselines'])('expired parent%s never starts capture',async key=>{
    const f=manual();f.referenceCurrentness[key as 'membership'|'baselines']=false;
    state.scope.mockResolvedValue({data:f,error:null});mount(true);
    await screen.findByText(/Hämta ett aktuellt sparat underlag/);
    expect(state.rpc.mock.calls.filter(c=>c[0]==='read_operations_scope_invoice_capture_admin_v1')).toHaveLength(0);
  });
  it('empty inventory is unknown, not a zero subtotal',async()=>{
    const f=await fixture();Object.assign(f.evidence,{members:[],source_inventory:[],saved_source_references:[],captured_inventory_fingerprint:await scopeInvoiceInventoryFingerprint([])});
    state.read.mockResolvedValue({data:f,error:null});mount();await screen.findByText('Verifierat fakturabelopp saknas.');
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
  });
  it('excluded changedsource stays a fixed redacted warning with unknownmoney',async()=>{
    const f=await fixture();
    Object.assign(f.evidence.members[0].kernel_evidence.sources[0],{resolved:false,reason:'source_changed',current_snapshot_id:null,current_raw_sha256:null,status:null,amount_minor:null,policy_state:'stale',replaces_estimate_minor:null});
    Object.assign(f.evidence.source_inventory[0],{mapping_state:'excluded',reason:'source_changed',current_snapshot_id:null,current_raw_sha256:null,policy_state:'stale'});
    f.evidence.captured_inventory_matches_current=false;f.evidence.diagnostics=['captured_inventory_changed'];
    f.evidence.captured_inventory_fingerprint=await scopeInvoiceInventoryFingerprint(f.evidence.source_inventory);
    state.read.mockResolvedValue({data:f,error:null});mount();
    await screen.findByText('Verifierat fakturabelopp saknas.');
    expect(screen.getByRole('alert').textContent).toContain('1 fakturakopplingar är inte verifierade');
    expect(screen.getByRole('region').textContent).not.toContain('source_changed');
    expect(screen.getByRole('region').textContent).not.toContain('a'.repeat(64));
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
  });
  it('zero invoice source unsupported by currentpositive kernel fails closed',async()=>{
    await expect(validateScopeInvoiceKernelEvidence((await fixture(0)).evidence)).rejects.toThrow('invalid_resolved_kernel_source');
    state.read.mockResolvedValue({data:await fixture(0),error:null});mount();await screen.findByRole('alert');
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
    expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
  });
  it('failed/PT409 fresh read hides the previously copied amount',async()=>{
    state.read.mockResolvedValueOnce({data:await fixture(),error:null}).mockResolvedValue({data:null,error:{code:'PT409',message:'private raw'}});
    const v=mount();await screen.findByText('Känt mottaget fakturabelopp');
    await act(async()=>{await v.client.invalidateQueries();});
    await screen.findByRole('alert');expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();expect(v.container.textContent).not.toContain('private raw');
  });
  it('pending refetch hides cachedmoney before any new authorization response',async()=>{
    state.read.mockResolvedValueOnce({data:await fixture(),error:null});const v=mount();
    await screen.findByText('Känt mottaget fakturabelopp');
    let release!:(v:unknown)=>void;state.read.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
    let refresh!:Promise<void>;
    await act(async()=>{refresh=v.client.invalidateQueries();});
    await screen.findByText('Hämtar fakturaunderlag…');expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
    await act(async()=>{release({data:null,error:{code:'42501'}});await refresh;});
    await screen.findByRole('alert');expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
  });
  it.each(['token','actor','org','composition'])('%s boundary removes prior capture/cache',async key=>{
    state.read.mockResolvedValueOnce({data:await fixture(),error:null}).mockResolvedValue({data:null,error:{code:'42501'}});
    const v=mount();await screen.findByText('Känt mottaget fakturabelopp');const old=v.client.getQueryCache().getAll()[0].queryKey;
    if(key==='token')state.token='synthetic-token-b';if(key==='actor')state.actor=id(90);if(key==='org')state.org=id(99);
    v.redraw(key==='composition'?{...selection(),compositionSnapshotId:id(77)}:selection());
    expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();await screen.findByRole('alert');
    await waitFor(()=>expect(v.client.getQueryCache().find({queryKey:old,exact:true})).toBeUndefined());
  });
  it('unmount aborts pending capture and ignores late money',async()=>{
    let release!:(v:unknown)=>void;state.read.mockImplementation(()=>new Promise(r=>{release=r;}));const v=mount();
    await waitFor(()=>expect(state.read).toHaveBeenCalled());v.unmount();expect(state.signals[0].aborted).toBe(true);
    await act(async()=>release({data:await fixture(),error:null}));expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
  });
  it('loaded money stays out of actual App persistence predicate and rawtoken keys',async()=>{
    state.read.mockResolvedValue({data:await fixture(),error:null});const v=mount();await screen.findByText('Känt mottaget fakturabelopp');
    expect(v.client.getQueryCache().getAll()[0].meta?.persist).toBe(false);
    expect(dehydrate(v.client).queries).toHaveLength(1);
    expect(dehydrate(v.client,{shouldDehydrateQuery:q=>q.state.status==='success'&&q.meta?.persist!==false}).queries).toHaveLength(0);
    expect(JSON.stringify(v.client.getQueryCache().getAll().map(q=>q.queryKey))).not.toContain('synthetic-token');
  });
  it('foreignreply cannot be repaired into accepted money',async()=>{
    const f=await fixture();f.evidence.organization_id=id(99);state.read.mockResolvedValue({data:f,error:null});mount();
    await screen.findByRole('alert');expect(screen.queryByText('Känt mottaget fakturabelopp')).toBeNull();
  });
});
