import{beforeEach,describe,it,expect,vi}from'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
import{createInternalProjectWithRetry,readInternalCreateAttempt}from'../internalProjectCreation';
const identity={actorId:'actor',organizationId:'org'};
beforeEach(()=>{localStorage.clear();state.rpc.mockReset();});
describe('durable internal creation recovery',()=>{
 it('reuses exact id and payload after unknown outcome and reopened form edits',async()=>{
  state.rpc.mockResolvedValueOnce({data:null,error:new Error('network outcome unknown')});
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{})).rejects.toThrow('unknown');
  const pending=readInternalCreateAttempt(identity)!;expect(pending.request.name).toBe('Original');
  // Fresh invocation represents a reopened dialog or page reload; the draft differs.
  state.rpc.mockImplementationOnce(async(_name,args)=>({data:{id:args.p_id,organization_id:'org'},error:null}));
  await createInternalProjectWithRetry(identity,{name:'Edited'},()=>{});
  expect(state.rpc.mock.calls[1][1]).toEqual({p_id:pending.id,p_request:pending.request});
  expect(readInternalCreateAttempt(identity)).toBeNull();
 });
 it('scopes pending requests to actor and organization',async()=>{
  state.rpc.mockResolvedValue({data:null,error:new Error('network')});
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{})).rejects.toThrow();
  expect(readInternalCreateAttempt({actorId:'other',organizationId:'org'})).toBeNull();
  expect(readInternalCreateAttempt({actorId:'actor',organizationId:'other'})).toBeNull();
 });
 it('retains request when returned receipt mismatches exact id or organization',async()=>{
  state.rpc.mockResolvedValue({data:{id:'wrong',organization_id:'org'},error:null});
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{})).rejects.toThrow('kvitto');
  expect(readInternalCreateAttempt(identity)).not.toBeNull();
 });
 it('rejects a pending payload from the previous identity before storage or RPC',async()=>{
  await expect(createInternalProjectWithRetry({actorId:'new',organizationId:'neworg'},{name:'Old',expected_actor_id:'actor',expected_organization_id:'org'},()=>{})).rejects.toThrow('session');
  expect(state.rpc).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
 });
 it('allows editing after a definite first transaction validation rollback',async()=>{
  state.rpc.mockResolvedValue({data:null,error:{code:'22023',message:'Invalid tasks'}});const pending=vi.fn();
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},pending)).rejects.toMatchObject({code:'22023'});
  expect(readInternalCreateAttempt(identity)).toBeNull();expect(pending).toHaveBeenLastCalledWith(null);
 });
 it('retains an earlier unknown attempt even if a later delivery is denied',async()=>{
  state.rpc.mockResolvedValueOnce({data:null,error:new Error('timeout')});
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{})).rejects.toThrow();
  state.rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{})).rejects.toMatchObject({code:'42501'});
  expect(readInternalCreateAttempt(identity)).not.toBeNull();
 });
 it('never sends if pending persistence fails',async()=>{
  const broken={getItem:()=>null,setItem:()=>{throw new Error('storage unavailable');}} as unknown as Storage;
  await expect(createInternalProjectWithRetry(identity,{name:'Original'},()=>{},broken)).rejects.toThrow('storage');
  expect(state.rpc).not.toHaveBeenCalled();
 });
});
