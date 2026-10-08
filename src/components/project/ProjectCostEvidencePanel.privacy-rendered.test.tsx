// @vitest-environment jsdom
// Genuine component/query lifecycle with synthetic Auth/RPC. Native revocation/route remains separate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { ProjectCostEvidencePanel } from './ProjectCostEvidencePanel';
const state = vi.hoisted(() => ({
  actor:'22222222-2222-4222-8222-222222222222' as string|null,
  org:'11111111-1111-4111-8111-111111111111' as string|null,
  token:'synthetic-evidence-token' as unknown, authLoading:false, orgError:null as Error|null,
  session:vi.fn(),rpc:vi.fn(),headers:vi.fn(),signals:[] as AbortSignal[],
}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({
  user:state.actor?{id:state.actor}:null,
  session:state.actor&&state.token?{access_token:state.token,user:{id:state.actor}}:null,isLoading:state.authLoading,
})}));
vi.mock('@/hooks/useOrganizationId',()=>({useOrganizationId:()=>({organizationId:state.org,isLoading:false,error:state.orgError})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
  auth:{getSession:state.session},
  rpc:(name:string,args:unknown)=>({setHeader:(header:string,value:string)=>{
    state.headers(header,value);return{abortSignal:(signal:AbortSignal)=>{state.signals.push(signal);return state.rpc(name,args);}};
  }}),
}}));
const org='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',project='55555555-5555-4555-8555-555555555555';
const other='33333333-3333-4333-8333-333333333333';
const match=()=>({data:{session:state.actor&&state.token?{access_token:state.token,user:{id:state.actor}}:null},error:null});
function evidence(organizationId=org,projectId=project){
  return {schema:'operations-project-cost-evidence.v1',organizationId,projectId,generatedAt:'2026-10-02T10:00:00Z',missingPersonnelCostCount:0,
    personnel:[{streamKey:'a'.repeat(64),reportId:actor,lineId:'line-a',revision:3,timeVersion:2,workDate:'2026-10-01',minutes:90,amountMinor:45001,currency:'SEK',
      status:'preliminary',coverage:'complete',publishedAt:'2026-10-02T10:00:00Z',financeDeliveryState:'delivered',financeCurrentRevision:3}],
    invoices:[{sourceOrganizationId:other,invoiceId:'44444444-4444-4444-8444-444444444444',allocationId:'66666666-6666-4666-8666-666666666666',
      revision:2,documentNumber:'private-invoice-1',kind:'invoice',amountMinor:540000,currency:'SEK',status:'preliminary',accountingState:'booked',settlementState:'paid',
      providerApprovalState:'not_pending',providerSourceChanged:false,creditRelationCoverage:'not_applicable',receivedAt:'2026-10-02T10:00:00Z'}]};
}
const clients:QueryClient[]=[];
function mount(){
  let selected=project;const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:24*60*60*1000}}});clients.push(client);
  const tree=()=> <QueryClientProvider client={client}><ProjectCostEvidencePanel projectId={selected}/></QueryClientProvider>;
  const v=render(tree());return{...v,client,redraw:(next=selected)=>{selected=next;v.rerender(tree());}};
}
beforeEach(()=>{
  state.actor=actor;state.org=org;state.token='synthetic-evidence-token';state.authLoading=false;state.orgError=null;state.session.mockReset();state.rpc.mockReset();state.headers.mockReset();state.signals=[];
  state.session.mockImplementation(async()=>match());
  vi.stubEnv('VITE_OPERATIONS_COST_EVIDENCE_ENABLED','true');
});
afterEach(()=>{cleanup();for(const c of clients.splice(0))c.clear();vi.unstubAllEnvs();vi.restoreAllMocks();});
async function loaded(){state.rpc.mockResolvedValue({data:evidence(),error:null});const v=mount();await screen.findByText('private-invoice-1');return v;}
const hidden=()=>expect(screen.queryByText('private-invoice-1')).toBeNull();
describe('actual read-only evidence privacy renderer',()=>{
  it('default-off issues no session/RPC and has no privatecache',()=>{
    vi.stubEnv('VITE_OPERATIONS_COST_EVIDENCE_ENABLED','false');const v=mount();expect(v.container.textContent).toBe('');expect(state.session).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();expect(v.client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('binds exact actor/sessiontoken/header/org/project and neverputs token inkeys',async()=>{
    const v=await loaded();
    expect(state.headers).toHaveBeenCalledWith('Authorization','Bearer synthetic-evidence-token');
    expect(state.rpc).toHaveBeenCalledWith('read_operations_project_cost_evidence_v1',{p_organization_id:org,p_project_id:project});
    expect(JSON.stringify(v.client.getQueryCache().getAll().map(q=>q.queryKey))).not.toContain('synthetic-evidence-token');
    expect(v.container.textContent?.replace(/\s/g,'')).toContain('450,01kr');expect(v.container.textContent?.replace(/\s/g,'')).toContain('5400,00kr');
  });
  it('logout withSAMEactor/org dropsvisiblemoney andcachedrows',async()=>{
    const v=await loaded();state.token=null;v.redraw();hidden();await screen.findByRole('alert');
    await waitFor(()=>expect(v.client.getQueryCache().getAll()).toHaveLength(0));expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it('tokenrefresh isolatespendingread andabortsignal fromearliercache',async()=>{
    const v=await loaded();let release!:(v:unknown)=>void;state.rpc.mockImplementationOnce(()=>new Promise(r=>{release=r;}));state.token='synthetic-token-b';v.redraw();
    hidden();await screen.findByRole('status');await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(2));
    expect(state.headers).toHaveBeenLastCalledWith('Authorization','Bearer synthetic-token-b');
    await act(async()=>release({data:null,error:{code:'42501'}}));await screen.findByRole('alert');hidden();
    await waitFor(()=>expect(v.client.getQueryCache().getAll()).toHaveLength(1));
  });
  it.each(['actor','organization','project'])('%s replacement hidesearliermoney whilepending thenafterdenial',async key=>{
    const v=await loaded();const oldKey=v.client.getQueryCache().getAll()[0].queryKey;let release!:(v:unknown)=>void;
    state.rpc.mockImplementationOnce(()=>new Promise(r=>{release=r;}));if(key==='actor')state.actor=other;if(key==='organization')state.org=other;v.redraw(key==='project'?other:project);
    hidden();await screen.findByRole('status');await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(2));
    await act(async()=>release({data:null,error:{code:'42501'}}));await screen.findByRole('alert');hidden();
    await waitFor(()=>expect(v.client.getQueryCache().find({queryKey:oldKey,exact:true})).toBeUndefined());
  });
  it('activeorganization resolutionfailure unmounts oldmoney without anotherread',async()=>{
    const v=await loaded();state.orgError=new Error('synthetic profile revoked');v.redraw();hidden();await screen.findByRole('alert');
    expect(state.rpc).toHaveBeenCalledTimes(1);await waitFor(()=>expect(v.client.getQueryCache().getAll()).toHaveLength(0));
  });
  it('authloading hidesearliermoney and doesnotreuse query',async()=>{
    const v=await loaded();state.authLoading=true;v.redraw();hidden();await screen.findByRole('status');
    expect(state.rpc).toHaveBeenCalledTimes(1);await waitFor(()=>expect(v.client.getQueryCache().getAll()).toHaveLength(0));
  });
  it.each([['array',['token']],['object',{token:'invalid'}]])('invalid%s token refuses beforegetSession/RPC',async(_label,token)=>{
    state.token=token;mount();await screen.findByRole('alert');expect(state.session).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();
  });
  it('local sessionmismatch beforetransport refusesRPC',async()=>{
    state.session.mockResolvedValue({data:{session:{access_token:'other-token',user:{id:actor}}},error:null});mount();await screen.findByRole('alert');expect(state.rpc).not.toHaveBeenCalled();
  });
  it('sessionmismatch afteractual acceptedreply discardscopiedmoney',async()=>{
    state.session.mockResolvedValueOnce(match()).mockResolvedValueOnce({data:{session:{access_token:'other-token',user:{id:actor}}},error:null});
    state.rpc.mockResolvedValue({data:evidence(),error:null});mount();await screen.findByRole('alert');hidden();expect(screen.queryByText('450,01 kr')).toBeNull();
  });
  it('project or rolerevocation pendingfreshread hidesmoney beforedenial',async()=>{
    const v=await loaded();let release!:(v:unknown)=>void;state.rpc.mockImplementationOnce(()=>new Promise(r=>{release=r;}));let refresh!:Promise<void>;
    await act(async()=>{refresh=v.client.invalidateQueries();});await screen.findByRole('status');hidden();
    await act(async()=>{release({data:null,error:{code:'42501'}});await refresh;});await screen.findByRole('alert');hidden();
  });
  it('pendingunmount aborts actualRPC and lateignoredreply cannotrecreate money',async()=>{
    let release!:(v:unknown)=>void;state.rpc.mockImplementationOnce(()=>new Promise(r=>{release=r;}));const v=mount();await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(1));
    v.unmount();expect(state.signals[0].aborted).toBe(true);await act(async()=>release({data:evidence(),error:null}));hidden();
    await waitFor(()=>expect(v.client.getQueryCache().getAll()).toHaveLength(0));
  });
  it('actualApp dehydratepredicate excludesloadedprivate rows while publicdata remains',async()=>{
    const v=await loaded();v.client.setQueryData(['public-example'],{label:'public retained'});
    const privateQuery=v.client.getQueryCache().findAll({queryKey:['operations-project-cost-evidence']})[0];
    expect(privateQuery.meta?.persist).toBe(false);expect(privateQuery.options.gcTime).toBe(0);
    expect(dehydrate(v.client).queries).toHaveLength(2);
    const stored=dehydrate(v.client,{shouldDehydrateQuery:q=>q.state.status==='success'&&q.meta?.persist!==false});
    expect(stored.queries).toHaveLength(1);expect(stored.queries[0].queryKey).toEqual(['public-example']);
    expect(JSON.stringify(stored)).not.toContain('private-invoice-1');expect(JSON.stringify(stored)).not.toContain('45001');
  });
});

