import { describe,it,expect,vi } from 'vitest';
vi.mock('../../../../supabase/functions/time-planning-proxy/workOrderAttach.ts',()=>({attachWorkOrders:async({candidates}:any)=>({byAssignment:new Map(),report:{candidateCount:candidates.length}})}));
import {buildWorkerProjection} from '../../../../supabase/functions/time-planning-proxy/workerProjection';
const id='11111111-1111-4111-8111-111111111111';
const project={id,organization_id:'org',booking_id:null,project_kind:'internal_project',status:'planning',name:'Ombyggnad',updated_at:'2026-10-12T10:00:00Z',deleted_at:null};
function adminFor(projects:any[], events?:any[]) {
 const queries:any[]=[];
 const data:Record<string,any[]>={staff_assignments:[{assignment_date:'2026-10-12',team_id:'team-1'}],calendar_events:events??[{id:'event',booking_id:`project-${id}`,resource_id:'team-1',source_date:'2026-10-12',start_time:'2026-10-12T08:00:00Z',end_time:'2026-10-12T12:00:00Z'}],projects,bookings:[]};
 return {queries,from(table:string){let rows=data[table]||[];const q:any={select:()=>q,order:()=>q,gte:()=>q,lte:()=>q,eq(k:string,v:any){queries.push({table,k,v});if(table==='projects')rows=rows.filter(r=>r[k]===v);return q;},in(k:string,values:any[]){if(table==='projects')rows=rows.filter(r=>values.includes(r[k]));return q;},is(k:string,v:any){if(table==='projects')rows=rows.filter(r=>r[k]===v);return q;},then(resolve:any){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};
}
describe('assigned internal projects join the signed Time projection',()=>{
 it('emits exact standalone project identity without booking/workorder fabrication',async()=>{
  const admin=adminFor([project]);const result=await buildWorkerProjection({admin,staff:{id:'staff'},organizationId:'org'});
  expect(result.ok).toBe(true);if (!result.ok) throw new Error('projection failed');expect(result.assignments).toHaveLength(1);
  expect(result.assignments![0].target).toMatchObject({kind:'project',externalId:id,label:'Ombyggnad',reporting:{state:'allowed'}});
  expect(result.assignments![0].workOrder).toBeUndefined();expect(result.workOrder).toEqual({candidateCount:0});
  expect(admin.queries).toContainEqual({table:'projects',k:'organization_id',v:'org'});
 });
 it.each(['completed','cancelled'])('does not export %s project as reportable',async status=>{
  const result=await buildWorkerProjection({admin:adminFor([{...project,status}]),staff:{id:'staff'},organizationId:'org'});expect(result.assignments).toEqual([]);
 });
 it('rejects other-tenant and customer project placeholders',async()=>{
  for(const p of [{...project,organization_id:'other'},{...project,project_kind:'customer'}]){
   const result=await buildWorkerProjection({admin:adminFor([p]),staff:{id:'staff'},organizationId:'org'});expect(result.assignments).toEqual([]);
  }
 });
 it('does not export an unassigned team date',async()=>{
  const result=await buildWorkerProjection({admin:adminFor([project],[{booking_id:`project-${id}`,resource_id:'team-2',source_date:'2026-10-12'}]),staff:{id:'staff'},organizationId:'org'});expect(result.assignments).toEqual([]);
 });
});
