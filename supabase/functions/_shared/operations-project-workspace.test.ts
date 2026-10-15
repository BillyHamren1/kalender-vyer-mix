import { describe,it,expect,vi } from 'vitest';
import { loadOperationsProjectWorkspace,readWorkspaceRows,workspaceTransportDisplay } from './operations-project-workspace';
const org='org-a', projectId='project-a';
function client(overrides: Record<string, any> = {}) {
 const calls: any[]=[];
 return { calls,from(table:string){ const filters:any[]=[]; calls.push({table,filters}); const q:any={};
  for(const m of ['select','eq','is','like','not','order','in'])q[m]=(...args:any[])=>{filters.push([m,...args]);return q;};
  q.then=(resolve:any)=>Promise.resolve({data:overrides.roles ?? [],error:overrides.rolesError ?? null}).then(resolve);
  q.maybeSingle=async()=>({data:table==='projects'?{id:projectId,organization_id:org,name:'Projekt',booking_id:'booking-a',...overrides.project}:overrides.booking === null ? null : {id:'booking-a',organization_id:org,client:'Kund',booking_number:'FA-1',eventdate:'2026-10-20',...overrides.booking},error:null});
  q.range=async(start:number,end:number)=>{const rows=overrides[table]??[];return {data:rows.slice(start,end+1),count:rows.length,error:overrides.errorTable===table?{}:null};};return q;
 }};
}
function upstream(overrides:Record<string,any>={}){return vi.fn(async(url:any)=>{
 const u=String(url);let data:any;
 if(u.includes('export_bookings'))data={found:true,booking:{id:'booking-a',organization_id:org,client:'Live',internal_notes:'Canonical notes',products:[{booking_product_id:'row1',product_name:'Tält',quantity:2}],attachments:[{id:'att1',file_name:'Plan.pdf',public_url:'https://files.example/plan.pdf'}]}};
 else if(u.includes('type=product_costs'))data={products:[],summary:{revenue:10,costs:2,margin:8}};
 else if(u.includes('type=extra_costs'))data={extra_costs:[{id:'cost1',label:'X',amount:50}]};
 else data={success:true,data:{id:'supplier1',name:'Leverantör',contacts:[]}};
 return new Response(JSON.stringify(overrides[u.includes('export_bookings')?'booking':'other']??data),{status:overrides.status??200});
}) as unknown as typeof fetch;}
const env=(key:string)=>key==='EF_SUPABASE_URL'?'https://booking.example':'test-only-key';
const input={organizationId:org,projectId,localUserId:'actor-a'};
describe('workspace owner boundary',()=>{
 it('rejects foreign parent before querying any children or upstream',async()=>{const db=client({project:{organization_id:'other'}}),f=upstream();await expect(loadOperationsProjectWorkspace(db,input,{fetcher:f,env})).rejects.toThrow('project_not_found');expect(db.calls).toHaveLength(1);expect(f).not.toHaveBeenCalled();});
 it('only enables writes for a same-organization admin or project role',async()=>{for(const [roles,error,expected] of [[[{role:'admin',organization_id:org}],null,true],[[{role:'projekt',organization_id:org}],null,true],[[{role:'lager',organization_id:org}],null,false],[[{role:'admin',organization_id:'foreign'}],null,false],[[{role:'admin',organization_id:org}],{},false]] as any[]){const r=await loadOperationsProjectWorkspace(client({roles,rolesError:error}),input,{fetcher:upstream(),env});expect(r.capabilities.canWrite).toBe(expected);}});
 it('does not load foreign linked booking externally',async()=>{const db=client({booking:{organization_id:'other'}}),f=upstream();const r=await loadOperationsProjectWorkspace(db,input,{fetcher:f,env});expect(r.booking).toBeNull();expect(r.sectionErrors.booking).toBe('unavailable');expect(f).not.toHaveBeenCalled();});
 it('produces canonical rows, attachments, costs and scopes every child query',async()=>{const db=client();const r=await loadOperationsProjectWorkspace(db,input,{fetcher:upstream(),env});expect(r.schema).toBe('operations-project-workspace.v1');expect(r.notes.value).toBe('Canonical notes');expect(r.booking?.client).toBe('Kund');expect(r.booking?.products[0].name).toBe('Tält');expect(r.files.bookingAttachments?.[0].file_name).toBe('Plan.pdf');expect(r.costs.extraCosts?.displayTotal).toBe(50);expect(r.costs.productCosts?.summary).toEqual({revenue:10,costs:2,margin:8});expect(r.sectionErrors).toEqual({});for(const c of db.calls)expect(c.filters).toContainEqual(['eq','organization_id',org]);});
 it('shows unavailable source without fallback products or invented empty attachments',async()=>{const r=await loadOperationsProjectWorkspace(client(),input,{fetcher:upstream({status:503}),env});expect(r.booking?.products).toBeNull();expect(r.files.bookingAttachments).toBeNull();expect(r.sectionErrors.products).toBe('unavailable');expect(r.sectionErrors.notes).toBe('unavailable');expect(r.costs.productCosts).toBeNull();});
 it('rejects wrong booking id from successful upstream envelope',async()=>{const r=await loadOperationsProjectWorkspace(client(),input,{fetcher:upstream({booking:{found:true,booking:{id:'foreign',products:[]}}}),env});expect(r.sectionErrors.products).toBe('unavailable');});
 it('keeps a failed local section distinguishable from empty',async()=>{const r=await loadOperationsProjectWorkspace(client({errorTable:'project_tasks'}),input,{fetcher:upstream(),env});expect(r.planning.tasks).toBeNull();expect(r.sectionErrors.tasks).toBe('unavailable');expect(r.files.projectFiles).toEqual([]);});
 it('never returns transport response bearer tokens',async()=>{const r=await loadOperationsProjectWorkspace(client({transport_assignments:[{id:'t',partner_response_token:'secret-response-token'}]}),input,{fetcher:upstream(),env});expect(JSON.stringify(r)).not.toContain('secret-response-token');expect(r.planning.transports?.[0]).not.toHaveProperty('partner_response_token');});
 it('blocks joined transport resources from another tenant',async()=>{const r=await loadOperationsProjectWorkspace(client({transport_assignments:[{id:'transport',vehicle:{organization_id:'foreign'}}]}),input,{fetcher:upstream(),env});expect(r.planning.transports).toBeNull();expect(r.sectionErrors.transports).toBe('unavailable');});
 it('handles standalone projects without contacting Booking',async()=>{const f=upstream();const r=await loadOperationsProjectWorkspace(client({project:{booking_id:null}}),input,{fetcher:f,env});expect(f).not.toHaveBeenCalled();expect(r.notes.target).toBe('project');expect(r.booking?.products).toEqual([]);});
});
describe('collection completeness',()=>{
 it('reads all pages past API cap',async()=>{const data=Array.from({length:431},(_,id)=>({id}));expect(await readWorkspaceRows(()=>({range:async(a:number,b:number)=>({data:data.slice(a,b+1),count:data.length,error:null})}))).toHaveLength(431);});
 it('rejects truncated page instead of pretending no more rows',async()=>{await expect(readWorkspaceRows(()=>({range:async()=>({data:[{id:1}],count:250,error:null})}))).rejects.toThrow('collection_incomplete');});
 it('rejects changing total during pagination',async()=>{let n=0;await expect(readWorkspaceRows(()=>({range:async()=>({data:Array.from({length:200},()=>({})),count:400+n++,error:null})}))).rejects.toThrow('collection_changed');});
 it('rejects count-less successful response',async()=>{await expect(readWorkspaceRows(()=>({range:async()=>({data:[],count:null,error:null})}))).rejects.toThrow();});
 it('preserves canonical transport accepted response presentation',()=>{expect(workspaceTransportDisplay({planning_status:'preliminary',partner_response:'accepted',transport_type:'internal'})).toMatchObject({statusLabel:'Bekräftad',displayName:'Intern transport'});});
});

import { groupProducts,productCostDisplay,costSummaryDisplay } from './operations-product-presentation';
describe('web/mobile shared presentation',()=>{
 it('uses owner explicit accessory relationships even when row occurs after another parent',()=>{const parent={id:'p',name:'Tält',quantity:1},other={id:'other',name:'Bord',quantity:2},child={id:'a',name:'↳ Vägg',quantity:3,parentProductId:'p'};expect(groupProducts([parent,other,child])).toEqual([{parent,accessories:[child]},{parent:other,accessories:[]}]);});
 it('retains existing sequential legacy accessory grouping',()=>{const parent={id:'p',name:'Tält',quantity:1},child={id:'a',name:'↳ Vägg',quantity:3};expect(groupProducts([parent,child])[0].accessories).toEqual([child]);});
 it('uses the shared web per-unit cost and zero revenue rules',()=>{const row={assembly_cost:2,handling_cost:3,purchase_cost:5,quantity:4,total:0,product_name:'↳ Del'};expect(productCostDisplay(row as any)).toEqual({totalCost:40,displayUnitPrice:0,marginPercent:0,displayName:'Del'});expect(costSummaryDisplay({products:[row],summary:{revenue:0,margin:-40,costs:40}} as any)).toEqual({comparable:true,marginPercent:0,assemblyCostTotal:8,handlingCostTotal:12,purchaseCostTotal:20});});
});
import { legacyCostDifferences } from './operations-product-presentation';
import { workspaceTransportGroups } from './operations-project-workspace-presentation';
describe('remaining canonical display actions',()=>{
 it('keeps delivered assignments in Utförda even when supplier accepted',()=>{const rows=[{id:'a',planning_status:'preliminary'},{id:'b',partner_response:'accepted'},{id:'c',partner_response:'accepted',status:'delivered'}];expect(workspaceTransportGroups(rows).map(g=>[g.title,g.items.map(i=>i.id)])).toEqual([['Preliminära',['a']],['Bekräftade',['b']],['Utförda',['c']]]);expect(workspaceTransportDisplay(rows[1])).toMatchObject({nextPlanningStatus:'preliminary',planningActionLabel:'Gör preliminär'});});
 it('does not compare different currencies',()=>{expect(costSummaryDisplay({currency:'EUR',cost_currency:'SEK',summary:{revenue:100,costs:50,margin:50},products:[]})).toMatchObject({comparable:false});});
 it('reconciles only changed fields on exact matching Booking row, preserving unmatched rows',()=>{const products=[{id:'p',assembly_cost:10,handling_cost:5,purchase_cost:0}];const legacy=[{id:'same',product_id:'p',assembly_cost:10},{id:'changed',product_id:'p',assembly_cost:20},{id:'missing',product_id:'unknown',assembly_cost:2},{id:'other',product_id:'p',booking_id:'other',assembly_cost:99}];const out=legacyCostDifferences(legacy,products,'booking');expect(out.map(i=>i.row.id)).toEqual(['changed','missing']);expect(out[0]).toMatchObject({costs:{assembly_cost:20},expected:{assembly_cost:10}});expect(out[1].product).toBeUndefined();});
});
