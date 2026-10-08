import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NativeCateringCostEvidencePanel } from './NativeCateringCostEvidencePanel';
const state=vi.hoisted(()=>({actor:'22222222-2222-4222-8222-222222222222',org:'11111111-1111-4111-8111-111111111111',rpc:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.actor},isLoading:false})}));
vi.mock('@/hooks/useOrganizationId',()=>({useOrganizationId:()=>({organizationId:state.org,isLoading:false,error:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
const project='55555555-5555-4555-8555-555555555555';
const org='11111111-1111-4111-8111-111111111111';
const evidence=()=>({schema:'operations-project-cost-evidence.v2',organizationId:org,projectId:project,generatedAt:'2026-10-02T00:00:00Z',personnel:[],invoices:[],missingPersonnelCostCount:0,missingCateringCostCount:0,catering:[{streamKey:'a'.repeat(64),obligationId:project,revision:2,sourceEntryVersion:2,workDate:'2026-09-30',minutes:105,amountMinor:52502 as number|null,currency:'SEK',status:'preliminary',coverage:'complete',sourceStatus:'approved',publishedAt:'2026-10-02T00:00:00Z'}]});
const clients:QueryClient[]=[];
function mount(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});clients.push(client);
 const tree=()=> <QueryClientProvider client={client}><NativeCateringCostEvidencePanel projectId={project}/></QueryClientProvider>;
 const view=render(tree());return{...view,client,redraw:()=>view.rerender(tree())};
}
beforeEach(()=>{state.actor='22222222-2222-4222-8222-222222222222';state.org=org;state.rpc.mockReset();vi.stubEnv('VITE_OPERATIONS_NATIVE_COST_EVIDENCE_ENABLED','true');});
afterEach(()=>{cleanup();for(const c of clients.splice(0))c.clear();vi.unstubAllEnvs();});
describe('Native Catering actual component with explicit synthetic Auth/RPC',()=>{
 it('default-off performs no reads or rendering',()=>{vi.stubEnv('VITE_OPERATIONS_NATIVE_COST_EVIDENCE_ENABLED','false');expect(mount().container.textContent).toBe('');expect(state.rpc).not.toHaveBeenCalled();});
 it('copies52502 and keeps payroll approval separate from preliminary project review',async()=>{
  state.rpc.mockResolvedValue({data:evidence(),error:null});mount();await screen.findByText('105 min');
  expect(screen.getByText('Godkänd tid')).toBeTruthy();expect(screen.getByText('Preliminär')).toBeTruthy();expect(screen.queryByText('Bekräftad')).toBeNull();
  expect(screen.getByRole('region',{name:'Cateringkostnadsunderlag'}).textContent?.replace(/[\s\u00a0]/g,'')).toContain('525,02kr');
  expect(state.rpc).toHaveBeenCalledWith('read_operations_project_cost_evidence_v2',{p_organization_id:org,p_project_id:project});
 });
 it('shows unavailable rates as null and changed amounts only from saved corrected evidence',async()=>{
  const initial=evidence();initial.catering[0].amountMinor=null;initial.catering[0].coverage='missing_rate';initial.missingCateringCostCount=1;
  const correction=evidence();correction.catering[0].amountMinor=45002;correction.catering[0].minutes=90;correction.catering[0].revision=3;
  state.rpc.mockResolvedValueOnce({data:initial,error:null}).mockResolvedValueOnce({data:correction,error:null});const view=mount();await screen.findByText('Kostnad saknas');
  expect(screen.getByRole('alert').textContent).toContain('inte komplett');expect(screen.queryByText('0,00 kr')).toBeNull();
  await act(async()=>{await view.client.invalidateQueries({queryKey:['operations-native-project-cost-evidence']});});await screen.findByText('90 min');
  expect(screen.queryByText('Kostnad saknas')).toBeNull();expect(screen.getAllByRole('row')).toHaveLength(2);expect(screen.getByText('Preliminär')).toBeTruthy();
 });
 it('hides old actor/tenant evidence while next read is pending and after denial',async()=>{
  let resolve!:(v:{data:unknown;error:unknown})=>void;
  state.rpc.mockResolvedValueOnce({data:evidence(),error:null}).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const view=mount();await screen.findByText('105 min');
  state.actor='77777777-7777-4777-8777-777777777777';state.org='33333333-3333-4333-8333-333333333333';view.redraw();expect(screen.queryByText('105 min')).toBeNull();
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(2));await act(async()=>resolve({data:null,error:new Error('denied')}));await screen.findByRole('alert');expect(screen.queryByText('105 min')).toBeNull();
 });
});
