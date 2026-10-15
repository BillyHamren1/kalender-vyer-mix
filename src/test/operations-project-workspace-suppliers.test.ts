import { describe,it,expect,vi } from 'vitest';
import { executeWorkspaceSupplierCommand as execute, validateWorkspaceSupplierCommand as valid, loadWorkspaceSupplierTransportOptions as options, resolveWorkspaceSupplierRecipient, workspaceSupplierCacheRow, authenticateWorkspaceOwnerSender, authorizeWorkspaceOwnerOrganization } from '../../supabase/functions/_shared/operations-project-workspace-suppliers';
const org='11111111-1111-1111-1111-111111111111',project='22222222-2222-2222-2222-222222222222',actor='33333333-3333-3333-3333-333333333333',supplier='44444444-4444-4444-4444-444444444444',booking='55555555-5555-5555-5555-555555555555',link='66666666-6666-6666-6666-666666666666',assignment='77777777-7777-7777-7777-777777777777';
function setup(rows:Record<string,any[]>={}) {
 const mutations:any[]=[]; const queries:any[]=[];
 const admin={from:(table:string)=>{
   const filters:any[]=[]; let insert:any;
   const result=()=>({data:insert?(Array.isArray(insert)?insert.map((v,i)=>({id:i===0?assignment:actor})):{id:assignment}):(rows[table]||[]).filter(r=>filters.every(([k,v,kind])=>kind==='in'?v.includes(r[k]):r[k]===v)),error:null});
   const q:any={select:()=>q,is:(k:string,v:any)=>q,order:()=>q,range:async(start:number,end:number)=>{const r=result();return {...r,count:r.data.length,data:r.data.slice(start,end+1)}},upsert:(v:any)=>{mutations.push({table,value:v});rows[table]=[...(rows[table]||[]).filter(r=>r.external_id!==v.external_id),{id:supplier,...v}];return Promise.resolve({error:null})},eq:(k:string,v:any)=>{filters.push([k,v]);return q},in:(k:string,v:any)=>{filters.push([k,v,'in']);return q},insert:(v:any)=>{insert=v;mutations.push({table,value:v});return q},maybeSingle:async()=>{queries.push({table,filters});const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]||null:r.data}},single:async()=>result(),then:(resolve:any)=>resolve(result())};return q;
 }};
 const deps={registry:vi.fn(async()=>({id:supplier,name:'Supplier',email:'valid@example.test',contacts:[]})),invokeOwner:vi.fn(async(name:string)=>name==='send-supplier-request'?{success:true,thread_id:link}:{success:true,assignments_count:1})};
 return {ctx:{admin,organizationId:org,projectId:project,localActor:actor},deps,mutations,queries};
}
const basic={projects:[{id:project,organization_id:org,booking_id:booking}],bookings:[{id:booking,organization_id:org}]};
describe('workspace supplier and transport owner adapters',()=>{
 it('rejects client org/actor fields and invalid calendar dates',()=>{
  expect(valid({type:'supplier.link.add',supplierId:supplier,organizationId:org})).toBe(false);
  expect(valid({type:'toString'})).toBe(false);
  expect(valid({type:'transport.create',transportType:'internal',transportDate:'2026-02-30'})).toBe(false);
  expect(valid({type:'transport.request.send',assignmentIds:[assignment,assignment]})).toBe(false);
 });
 it('requires canonical project scope before remote read or mutation',async()=>{
  const s=setup({projects:[{id:project,organization_id:actor}]});
  await expect(execute(s.ctx,{type:'supplier.link.add',supplierId:supplier},s.deps)).rejects.toMatchObject({code:'project_not_found'});
  expect(s.deps.registry).not.toHaveBeenCalled();expect(s.mutations).toHaveLength(0);
 });
 it('links authoritative WMS supplier and stamps server org/project',async()=>{
  const s=setup(basic);await execute(s.ctx,{type:'supplier.link.add',supplierId:supplier,serviceType:'Ljud'},s.deps);
  expect(s.deps.registry).toHaveBeenCalledWith(org,supplier);
  expect(s.mutations[0]).toMatchObject({table:'project_supplier_links',value:{organization_id:org,project_id:project,supplier_id:supplier,status:'draft'}});
  expect(s.deps.invokeOwner).not.toHaveBeenCalled();
 });
 it('rejects a contact not belonging to selected supplier',async()=>{
  const s=setup(basic);await expect(execute(s.ctx,{type:'supplier.link.add',supplierId:supplier,contactId:actor},s.deps)).rejects.toMatchObject({code:'supplier_contact_not_found'});expect(s.mutations).toHaveLength(0);
 });
 it('creates internal transport against project booking and uses canonical sync',async()=>{
  const s=setup(basic); const result=await execute(s.ctx,{type:'transport.create',transportType:'internal',transportDate:'2026-10-15'},s.deps);
  expect(result).toMatchObject({persisted:true,assignmentId:assignment,projectionSynced:true});
  expect(s.mutations[0].value[0]).toMatchObject({organization_id:org,booking_id:booking,planning_status:'preliminary',vehicle_id:null});
  expect(s.deps.invokeOwner).toHaveBeenCalledWith('sync-operational-plan-to-booking',{booking_id:booking});
 });
 it('reports persisted transport honestly when projection sync fails',async()=>{
  const s=setup(basic);s.deps.invokeOwner.mockRejectedValue(new Error('network'));
  expect(await execute(s.ctx,{type:'transport.create',transportType:'internal',transportDate:'2026-10-15'},s.deps)).toMatchObject({persisted:true,projectionSynced:false});
 });
 it('never calls sender for cross-project link',async()=>{
  const s=setup({...basic,project_supplier_links:[{id:link,project_id:actor,organization_id:org,supplier_id:supplier}]});
  await expect(execute(s.ctx,{type:'supplier.request.send',linkId:link,message:'Hej',expectedRecipientEmail:'valid@example.test'},s.deps)).rejects.toMatchObject({code:'supplier_link_not_found'});expect(s.deps.invokeOwner).not.toHaveBeenCalled();
 });
 it('rejects reviewed recipient drift before canonical send',async()=>{
  const s=setup({...basic,project_supplier_links:[{id:link,project_id:project,organization_id:org,supplier_id:supplier}],external_suppliers:[{id:supplier,organization_id:org,email:'valid@example.test'}]});
  await expect(execute(s.ctx,{type:'supplier.request.send',linkId:link,message:'Hej',expectedRecipientEmail:'stale@example.test'},s.deps)).rejects.toMatchObject({code:'recipient_changed'});expect(s.deps.invokeOwner).not.toHaveBeenCalled();
 });
 it('invokes canonical supplier sender only for verified recipient',async()=>{
  const s=setup({...basic,project_supplier_links:[{id:link,project_id:project,organization_id:org,supplier_id:supplier}],external_suppliers:[{id:supplier,organization_id:org,email:'valid@example.test'}]});
  expect(await execute(s.ctx,{type:'supplier.request.send',linkId:link,message:'Hej',expectedRecipientEmail:'valid@example.test'},s.deps)).toMatchObject({delivery:'sent',threadId:link});
  expect(s.deps.invokeOwner).toHaveBeenCalledWith('send-supplier-request',{project_supplier_link_id:link,message:'Hej',subject:null,expected_recipient_email:'valid@example.test'});
 });
 it('rejects transport assignment outside booking before send',async()=>{
  const s=setup({...basic,transport_assignments:[{id:assignment,organization_id:org,booking_id:actor,supplier_id:supplier}]});
  await expect(execute(s.ctx,{type:'transport.request.send',assignmentIds:[assignment],expectedRecipientEmail:'valid@example.test'},s.deps)).rejects.toMatchObject({code:'transport_not_found'});expect(s.deps.invokeOwner).not.toHaveBeenCalled();
 });
 it('validates supplier organization before transport send',async()=>{
  const s=setup({...basic,transport_assignments:[{id:assignment,organization_id:org,booking_id:booking,supplier_id:supplier}],suppliers:[{id:supplier,organization_id:actor}]});
  await expect(execute(s.ctx,{type:'transport.request.send',assignmentIds:[assignment],expectedRecipientEmail:'valid@example.test'},s.deps)).rejects.toMatchObject({code:'supplier_not_found'});expect(s.deps.invokeOwner).not.toHaveBeenCalled();
 });
 it('delegates valid transport request without implementing another mail engine',async()=>{
  const s=setup({...basic,transport_assignments:[{id:assignment,organization_id:org,booking_id:booking,supplier_id:supplier}],suppliers:[{id:supplier,organization_id:org,name:'Supplier',email:'valid@example.test',contacts:[]}]});
  expect(await execute(s.ctx,{type:'transport.request.send',assignmentIds:[assignment],expectedRecipientEmail:'valid@example.test'},s.deps)).toMatchObject({delivery:'sent'});
  expect(s.deps.invokeOwner).toHaveBeenCalledWith('send-transport-request',expect.objectContaining({assignment_ids:[assignment]}));
 });
});

const registrySupplier={id:supplier,organization_id:org,name:'Canonical Supplier',email:'main@example.test',contacts:[{id:actor,name:'Canonical Contact',email:'contact@example.test'}]};
function registryDeps(value:any){ return {env:()=> 'test-key',fetcher:vi.fn(async()=>new Response(JSON.stringify({success:true,data:value}),{status:200})) as any}; }
describe('authoritative supplier options and recipient resolution',()=>{
 it('loads registry options + scoped vehicles without cache writes',async()=>{
   const s=setup({...basic,vehicles:[{id:assignment,organization_id:org,name:'Van'}]}); const deps=registryDeps([registrySupplier]);
   const result=await options(s.ctx.admin,{organizationId:org,projectId:project,localUserId:actor},deps);
   expect(result).toMatchObject({schema:'operations-project-workspace-options.v1',projectId:project,suppliers:[registrySupplier],booking:{id:booking}});
   expect(result.vehicles).toHaveLength(1); expect(s.mutations).toHaveLength(0);
   expect(JSON.parse(deps.fetcher.mock.calls[0][1].body)).toEqual({action:'list_suppliers',limit:501});
   expect(deps.fetcher.mock.calls[0][1].headers['x-organization-id']).toBe(org);
 });
 it('rejects foreign registry supplier data',async()=>{
   const s=setup(basic);await expect(options(s.ctx.admin,{organizationId:org,projectId:project,localUserId:actor},registryDeps([{...registrySupplier,organization_id:actor}]))).rejects.toMatchObject({code:'supplier_registry_invalid'});
 });
 it('fails closed on registry cap without reporting partial picker',async()=>{
   const s=setup(basic);await expect(options(s.ctx.admin,{organizationId:org,projectId:project,localUserId:actor},registryDeps(Array(500).fill(registrySupplier)))).rejects.toMatchObject({code:'supplier_options_incomplete'});
 });
 it('resolves real WMS contact instead of any legacy table',async()=>{
   const deps=registryDeps(registrySupplier);
   expect(await resolveWorkspaceSupplierRecipient(org,supplier,actor,'contact@example.test',deps)).toEqual({email:'contact@example.test',name:'Canonical Contact'});
   expect(JSON.parse(deps.fetcher.mock.calls[0][1].body)).toEqual({action:'get_supplier',supplier_id:supplier});
 });
 it('guards reviewed recipient at actual sender resolution',async()=>{
   await expect(resolveWorkspaceSupplierRecipient(org,supplier,actor,'old@example.test',registryDeps(registrySupplier))).rejects.toMatchObject({code:'recipient_changed',status:409});
 });
 it('uses first contact fallback matching supplier project card',async()=>{
   expect(await resolveWorkspaceSupplierRecipient(org,supplier,null,undefined,registryDeps(registrySupplier))).toEqual({email:'contact@example.test',name:'Canonical Contact'});
 });
 it('cache mapping matches registry proxy fields and forbids foreign org',()=>{
   const row=workspaceSupplierCacheRow({...registrySupplier,phone:'123',short_name:'CS'},org);
   expect(row).toMatchObject({organization_id:org,external_id:supplier,name:'Canonical Supplier',short_name:'CS',phone:'123',email:'main@example.test',contacts:registrySupplier.contacts,address_line1:null,primary_contact:null});
   expect(Object.keys(row).sort()).toEqual(['organization_id','external_id','name','short_name','color','email','phone','website','address_line1','address_line2','postal_code','city','country','notes','primary_contact','contacts','last_synced_at'].sort());
   expect(()=>workspaceSupplierCacheRow(registrySupplier,actor)).toThrow('supplier_registry_invalid');
 });
 it('refreshes transport cache from WMS only on create and then uses resulting local supplier ID',async()=>{
   const s=setup(basic);s.deps.registry.mockResolvedValue({...registrySupplier,contacts:[]} as any);
   await execute(s.ctx,{type:'transport.create',transportType:'delivery',transportDate:'2026-10-15',supplierId:supplier},s.deps);
   expect(s.mutations[0]).toMatchObject({table:'suppliers',value:{organization_id:org,external_id:supplier}});
   expect(s.mutations.find(m=>m.table==='transport_assignments').value[0].supplier_id).toBe(supplier);
 });
});

describe('canonical supplier sender wiring',()=>{
 it('uses the WMS resolver recipient in actual mail and thread, never legacy recipient tables',async()=>{
   const {readFileSync}=await import('node:fs');
   const {transpileModule,ScriptTarget,ModuleKind}=await import('typescript');
   const source=readFileSync(process.cwd() + '/supabase/functions/send-supplier-request/index.ts','utf8');
   expect(source).not.toContain('.from("external_suppliers")');
   expect(source).not.toContain('.from("external_supplier_contacts")');
   const js=transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.None}}).outputText;
   let handler:any; const sent:any[]=[];const inserts:any[]=[];
   const admin={from:(table:string)=>{
     const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='project_supplier_links'?{id:link,project_id:project,supplier_id:supplier,contact_id:actor,organization_id:org,service_type:'Ljud'}:{id:project,organization_id:org,name:'Project',booking_id:booking},error:null}),insert:(v:any)=>{inserts.push(v);return q},single:async()=>({data:{id:link,response_token:'response-token'},error:null}),update:()=>q,then:(resolve:any)=>resolve({error:null})};return q;
   }};
   const resolver=vi.fn(async()=>({email:'contact@example.test',name:'Canonical Contact'}));
   const deno={serve:(h:any)=>{handler=h},env:{get:()=> 'test-only'}};
   new Function('Deno','createClient','Resend','resolveSender','buildReplyTo','SenderNotConfiguredError','resolveWorkspaceSupplierRecipient','authenticateWorkspaceOwnerSender','authorizeWorkspaceOwnerOrganization',js)(deno,()=>admin,class {emails={send:async(v:any)=>{sent.push(v);return {data:{id:'provider-id'},error:null}}}},async()=>({from:'Sender <sender@example.test>',displayName:'Sender'}),()=> 'reply@example.test',class extends Error {},resolver,async()=>({localUserId:null}),async()=>{});
   const response=await handler(new Request('https://owner.test/send-supplier-request',{method:'POST',body:JSON.stringify({project_supplier_link_id:link,message:'Hej',expected_recipient_email:'contact@example.test'})}));
   expect(response.status).toBe(200);
   expect(resolver).toHaveBeenCalledWith(org,supplier,actor,'contact@example.test');
   expect(sent[0].to).toEqual(['contact@example.test']);expect(sent[0].html).toContain('Canonical Contact');
   expect(inserts[0].recipient_email).toBe('contact@example.test');
   sent.length=0; inserts.length=0; resolver.mockRejectedValue(Object.assign(new Error('recipient_changed'),{status:409}));
   const rejected=await handler(new Request('https://owner.test/send-supplier-request',{method:'POST',body:JSON.stringify({project_supplier_link_id:link,message:'Hej',expected_recipient_email:'old@example.test'})}));
   expect(rejected.status).toBe(409);expect(sent).toHaveLength(0);expect(inserts).toHaveLength(0);
 });
});

describe('canonical sender authorization',()=>{
 it('rejects missing and unverifiable JWTs before any reads',async()=>{
   const admin={auth:{getUser:vi.fn(async()=>({error:new Error('bad'),data:{}}))},from:vi.fn()};
   await expect(authenticateWorkspaceOwnerSender(new Request('https://owner.test'),admin,'server-secret')).rejects.toMatchObject({status:401});
   await expect(authenticateWorkspaceOwnerSender(new Request('https://owner.test',{headers:{authorization:'Bearer arbitrary'}}),admin,'server-secret')).rejects.toMatchObject({status:401});
   expect(admin.from).not.toHaveBeenCalled();
 });
 it('accepts exact internal secret but does not accept a claimed service role',async()=>{
   const admin={auth:{getUser:vi.fn(async()=>({error:new Error('bad'),data:{}}))}};
   expect(await authenticateWorkspaceOwnerSender(new Request('https://owner.test',{headers:{authorization:'Bearer server-secret'}}),admin,'server-secret')).toEqual({localUserId:null});
   expect(admin.auth.getUser).not.toHaveBeenCalled();
   await expect(authenticateWorkspaceOwnerSender(new Request('https://owner.test',{headers:{authorization:'Bearer eyJrole_service_role'}}),admin,'server-secret')).rejects.toMatchObject({status:401});
 });
 it('verifies local token and requires project/admin role in target organization',async()=>{
   const admin:any={auth:{getUser:vi.fn(async()=>({data:{user:{id:actor}},error:null}))}};
   const principal=await authenticateWorkspaceOwnerSender(new Request('https://owner.test',{headers:{authorization:'Bearer real-user-token'}}),admin,'server-secret');
   const filters:any[]=[];let rows:any[]=[];
   admin.from=vi.fn(()=>{const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q},in:(k:string,v:any)=>{filters.push([k,v]);return q},limit:async()=>({data:rows,error:null})};return q});
   await expect(authorizeWorkspaceOwnerOrganization(admin,principal,org)).rejects.toMatchObject({status:403});
   expect(filters).toContainEqual(['organization_id',org]);expect(filters).toContainEqual(['user_id',actor]);expect(filters).toContainEqual(['role',['admin','projekt']]);
   rows=[{role:'projekt'}];await expect(authorizeWorkspaceOwnerOrganization(admin,principal,org)).resolves.toBeUndefined();
 });
 it('actual transport handler rejects unauthenticated call before selecting assignments',async()=>{
   const {readFileSync}=await import('node:fs');const {transpileModule,ScriptTarget,ModuleKind}=await import('typescript');
   const source=readFileSync(process.cwd()+'/supabase/functions/send-transport-request/index.ts','utf8');
   const js=transpileModule(source.replace(/^import .*;?\r?\n/gm,''),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.None}}).outputText;
   let handler:any;const admin={auth:{getUser:vi.fn()},from:vi.fn()};const send=vi.fn();
   new Function('Deno','createClient','Resend','resolveSender','authenticateWorkspaceOwnerSender','authorizeWorkspaceOwnerOrganization',js)({serve:(h:any)=>{handler=h},env:{get:()=> 'test-key'}},()=>admin,class{emails={send}},vi.fn(),authenticateWorkspaceOwnerSender,authorizeWorkspaceOwnerOrganization);
   const response=await handler(new Request('https://owner.test',{method:'POST',body:JSON.stringify({assignment_ids:[assignment]})}));
   expect(response.status).toBe(401);expect(admin.from).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
 });
});

describe('canonical supplier creation and return transport',()=>{
 it('accepts quote and delivery fields and persists to existing link columns',async()=>{
   const s=setup(basic);await execute(s.ctx,{type:'supplier.link.add',supplierId:supplier,quotedPrice:1200,deliveryDate:'2026-10-20'},s.deps);
   expect(s.mutations[0].value).toMatchObject({quoted_price:1200,delivery_date:'2026-10-20'});
   expect(valid({type:'supplier.link.add',supplierId:supplier,quotedPrice:-1})).toBe(false);
 });
 it('creates supplier through WMS and links existing canonical project fields',async()=>{
   const s=setup(basic);const write=vi.fn(async()=>registrySupplier);
   const result=await execute(s.ctx,{type:'supplier.create_and_link',name:'Supplier',email:'main@example.test',quotedPrice:100,deliveryDate:'2026-11-01'}, {...s.deps,registryWrite:write});
   expect(write).toHaveBeenCalledWith(org,{action:'create_supplier',payload:{name:'Supplier',email:'main@example.test',phone:undefined}});
   expect(result).toMatchObject({persisted:true,supplier:registrySupplier});
   expect(s.mutations.find(m=>m.table==='project_supplier_links').value).toMatchObject({project_id:project,supplier_id:supplier,quoted_price:100,delivery_date:'2026-11-01'});
 });
 it('uses full supplier response from create_supplier_contact instead of confusing contact ID with supplier ID',async()=>{
   const s=setup(basic);const write=vi.fn().mockResolvedValueOnce({...registrySupplier,contacts:[]}).mockResolvedValueOnce({...registrySupplier,primary_contact:registrySupplier.contacts[0]});
   const result=await execute(s.ctx,{type:'supplier.registry.create',name:'Supplier',email:'contact@example.test',contactName:'Canonical Contact'}, {...s.deps,registryWrite:write});
   expect(result).toMatchObject({persisted:true,contactId:actor,supplier:{id:supplier}});
   expect(write.mock.calls[1][1]).toMatchObject({action:'create_supplier_contact',supplier_id:supplier,payload:{is_primary:true}});
   expect(s.mutations.some(m=>m.table==='project_supplier_links')).toBe(false);
 });
 it('creates delivery and return in one atomic insert with swapped route',async()=>{
   const s=setup(basic);const result=await execute(s.ctx,{type:'transport.create',transportType:'delivery',supplierId:supplier,transportDate:'2026-10-20',pickupAddress:'Warehouse',destinationAddress:'Venue',includeReturn:true,returnDate:'2026-10-21',returnTime:'17:00'},s.deps);
   const inserts=s.mutations.filter(m=>m.table==='transport_assignments');
   expect(inserts).toHaveLength(1);expect(inserts[0].value).toHaveLength(2);
   expect(inserts[0].value[1]).toMatchObject({transport_type:'pickup',transport_date:'2026-10-21',transport_time:'17:00',origin_address:'Venue',destination_address:'Warehouse'});
   expect(result).toMatchObject({persisted:true,assignmentIds:[assignment,actor]});
 });
 it('rejects incomplete return or client-created registry IDs',()=>{
   expect(valid({type:'transport.create',transportType:'delivery',supplierId:supplier,transportDate:'2026-10-20',includeReturn:true})).toBe(false);
   expect(valid({type:'supplier.registry.create',name:'Supplier',id:supplier})).toBe(false);
 });
});

describe('canonical transport sender scope and review guard',()=>{
 it('rejects mixed organizations and changed reviewed recipient without sending',async()=>{
   const {readFileSync}=await import('node:fs');const {transpileModule,ScriptTarget,ModuleKind}=await import('typescript');
   const source=readFileSync(process.cwd()+'/supabase/functions/send-transport-request/index.ts','utf8');
   const js=transpileModule(source.replace(/^import .*;?\r?\n/gm,''),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.None}}).outputText;
   let handler:any;const send=vi.fn();const authorize=vi.fn(async()=>{});
   let targets=[{id:assignment,organization_id:org,booking_id:booking},{id:actor,organization_id:actor,booking_id:booking}];
   const full=[{id:assignment,organization_id:org,booking_id:booking,supplier_id:supplier,supplier:{id:supplier,organization_id:org,name:'Supplier',email:'current@example.test',contacts:[]},booking:{id:booking,organization_id:org},vehicle_id:null}];
   const admin={from:()=>{let minimal=true;const q:any={select:(fields:string)=>{minimal=!fields.includes('*');return q},in:()=>q,eq:()=>q,then:(resolve:any)=>resolve({data:minimal?targets:full,error:null})};return q}};
   new Function('Deno','createClient','Resend','resolveSender','authenticateWorkspaceOwnerSender','authorizeWorkspaceOwnerOrganization',js)({serve:(h:any)=>{handler=h},env:{get:()=> 'test-key'}},()=>admin,class{emails={send}},async()=>({displayName:'Sender'}),async()=>({localUserId:null}),authorize);
   const mixed=await handler(new Request('https://owner.test',{method:'POST',body:JSON.stringify({assignment_ids:[assignment,actor]})}));
   expect(mixed.status).toBe(500);expect(send).not.toHaveBeenCalled();
   targets=[targets[0]];
   const drift=await handler(new Request('https://owner.test',{method:'POST',body:JSON.stringify({assignment_ids:[assignment],expected_recipient_email:'old@example.test'})}));
   expect(drift.status).toBe(409);expect(send).not.toHaveBeenCalled();
 });
});
