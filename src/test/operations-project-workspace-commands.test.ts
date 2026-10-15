import {describe,it,expect,vi} from 'vitest';
import {validWorkspaceCommand,validWorkspaceRequest,executeWorkspaceCommand,workspaceCommandHash} from '../../supabase/functions/_shared/operations-project-workspace-commands';
const id='11111111-1111-4111-8111-111111111111';
const req=(command:any)=>({schema:'planning-mobile-workspace-command-request.v1',actorUserId:id,organizationId:id,projectId:id,idempotencyKey:id,command});
const db=(result:any)=>{const c:any={update:vi.fn(()=>c),match:vi.fn(()=>c),select:vi.fn(()=>c),single:vi.fn(async()=>({data:{idempotency_key:id},error:null}))};return {rpc:vi.fn(async()=>result),from:vi.fn(()=>c)}};
describe('workspace commands',()=>{
 it('rejects arbitrary fields and mismatched optimistic guards',()=>{
  expect(validWorkspaceCommand({type:'task.add',title:'Task'})).toBe(true);
  expect(validWorkspaceCommand({type:'task.add',title:'Task',organizationId:id})).toBe(false);
  expect(validWorkspaceRequest({...req({type:'task.add',title:'Task'}),bookingId:id})).toBe(false);
  expect(validWorkspaceCommand({type:'costs.product.save',productId:id,costs:{purchase_cost:10},expected:{assembly_cost:0}})).toBe(false);
 });
 it('rejects unsafe file paths',()=>{
  expect(validWorkspaceCommand({type:'file.upload',fileName:'../x',mimeType:'text/plain',base64:'eA=='})).toBe(false);
  expect(validWorkspaceCommand({type:'file.upload',fileName:'x.txt',mimeType:'text/plain',base64:'eA=='})).toBe(true);
  expect(validWorkspaceCommand({type:'file.delete',fileId:id,url:'https://evil.test'})).toBe(false);
 });
 it('canonicalizes retry hash',async()=>expect(await workspaceCommandHash({type:'task.add',title:'x'})).toBe(await workspaceCommandHash({title:'x',type:'task.add'})));
 it('returns owner success with canonical actor',async()=>{
  const admin=db({data:{persisted:true,replayed:false,taskId:id},error:null});
  expect(await executeWorkspaceCommand(req({type:'task.add',title:'Task'}),{admin,localActor:id})).toMatchObject({persisted:true,actorUserId:id,commandType:'task.add'});
 });
 it('replays without second write',async()=>{
  const admin=db({data:{persisted:true,replayed:true},error:null});const fetcher=vi.fn();
  expect(await executeWorkspaceCommand(req({type:'notes.save',notes:'new',expectedNotes:null}),{admin,localActor:id,fetcher})).toMatchObject({replayed:true});expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([['42501',403,'unauthorized'],['P0002',404,'not_found'],['40001',409,'conflict']])('propagates SQL scope denial %s',async(code,status,error)=>{
  await expect(executeWorkspaceCommand(req({type:'task.add',title:'Task'}),{admin:db({data:null,error:{code}}),localActor:id})).rejects.toMatchObject({status,code:error});
 });
 it('never retries uncertain reservation',async()=>{
  const fetcher=vi.fn();await expect(executeWorkspaceCommand(req({type:'costs.extra.save',extraCosts:[],expected:null}),{admin:db({data:{claimed:false},error:null}),localActor:id,fetcher})).rejects.toMatchObject({code:'outcome_unknown'});expect(fetcher).not.toHaveBeenCalled();
 });
 it('forwards owner cost guard',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"success":true}',{status:200}));
  await executeWorkspaceCommand(req({type:'costs.product.save',productId:id,costs:{purchase_cost:10},expected:{purchase_cost:0}}),{admin:db({data:{claimed:true,bookingId:id},error:null}),localActor:id,env:k=>k==='EF_SUPABASE_URL'?'https://owner.test':'key',fetcher});
  expect(fetcher.mock.calls[0][0]).toContain(`organization_id=${id}`);expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({product_id:id,costs:{purchase_cost:10},expected:{purchase_cost:0}});
 });
 it('rejects stale notes before writer',async()=>{
  const pushNotes=vi.fn();await expect(executeWorkspaceCommand(req({type:'notes.save',notes:'new',expectedNotes:'old'}),{admin:db({data:{claimed:true,bookingId:id},error:null}),localActor:id,readBooking:vi.fn(async()=>({internalNotes:'changed'})) as any,pushNotes})).rejects.toMatchObject({code:'conflict'});expect(pushNotes).not.toHaveBeenCalled();
 });
 it('timeout never falsely persists',async()=>{
  const admin=db({data:{claimed:true,bookingId:id},error:null});await expect(executeWorkspaceCommand(req({type:'costs.extra.save',extraCosts:[],expected:null}),{admin,localActor:id,env:()=> 'x',fetcher:vi.fn(async()=>{throw new Error('timeout')})})).rejects.toMatchObject({code:'outcome_unknown'});expect(admin.from).not.toHaveBeenCalled();
 });
 it('saves blank source notes and canonical writer receives no caller booking id',async()=>{
  const pushNotes=vi.fn(async()=>({ok:true,status:200,body:{}}));
  await executeWorkspaceCommand(req({type:'notes.save',notes:'new',expectedNotes:''}),{admin:db({data:{claimed:true,bookingId:id},error:null}),localActor:id,readBooking:vi.fn(async()=>({internalNotes:null})) as any,pushNotes});
  expect(pushNotes).toHaveBeenCalledWith({bookingId:id,organizationId:id,fields:{internal_notes:'new'}});
 });
 it('uploads only to server-derived project/key path, never upserts',async()=>{
  const admin:any=db({data:{claimed:true},error:null});
  const upload=vi.fn(async()=>({error:null}));
  const storage={upload,getPublicUrl:vi.fn(()=>({data:{publicUrl:'https://owner/file'}}))};admin.storage={from:vi.fn(()=>storage)};
  const from=admin.from;const c=from('receipt');c.insert=vi.fn(()=>c);
  await executeWorkspaceCommand(req({type:'file.upload',fileName:'test.txt',mimeType:'text/plain',base64:'eA=='}),{admin,localActor:id});
  expect(upload).toHaveBeenCalledWith(`${id}/${id}-test.txt`,new Uint8Array([120]),{contentType:'text/plain',upsert:false});
  expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({organization_id:id,project_id:id,uploaded_by:id}));
 });
 it('refuses a stored file URL pointing outside project storage',async()=>{
  const admin:any=db({data:{claimed:true},error:null});const c=admin.from('file');c.eq=vi.fn(()=>c);c.maybeSingle=vi.fn(async()=>({data:{id,url:'https://evil.test/file'},error:null}));const remove=vi.fn();admin.storage={from:vi.fn(()=>({remove}))};
  await expect(executeWorkspaceCommand(req({type:'file.delete',fileId:id}),{admin,localActor:id,env:()=> 'https://owner.test'})).rejects.toMatchObject({code:'file_path_conflict'});expect(remove).not.toHaveBeenCalled();
 });

 it('allows only canonical transport planning states with current-state guard',()=>{
  const c={type:'transport.set_planning_status',assignmentId:id,planningStatus:'confirmed',expectedPlanningStatus:'preliminary'};
  expect(validWorkspaceCommand(c)).toBe(true);
  expect(validWorkspaceCommand({...c,planningStatus:'completed'})).toBe(false);
  expect(validWorkspaceCommand({...c,expectedPlanningStatus:undefined})).toBe(false);
  expect(validWorkspaceCommand({...c,bookingId:id})).toBe(false);
 });
 it('transport status returns atomic owner receipt without external command',async()=>{
  const admin=db({data:{persisted:true,replayed:false,assignmentId:id,planningStatus:'confirmed'},error:null});const fetcher=vi.fn();
  const receipt=await executeWorkspaceCommand(req({type:'transport.set_planning_status',assignmentId:id,planningStatus:'confirmed',expectedPlanningStatus:'preliminary'}),{admin,localActor:id,fetcher});
  expect(receipt).toMatchObject({persisted:true,planningStatus:'confirmed',commandType:'transport.set_planning_status'});expect(fetcher).not.toHaveBeenCalled();
 });

});
