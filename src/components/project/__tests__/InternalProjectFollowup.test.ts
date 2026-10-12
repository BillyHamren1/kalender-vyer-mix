import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({pages:[] as any[], calls:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:(key:string,id:string)=>({order:()=>({range:async(from:number,to:number)=>{state.calls.push({key,id,from,to});return state.pages.shift();}})})})})}}));
import {readInternalProjectTime} from '../InternalProjectFollowup';
const row=(id:string,status='submitted',rate_source:string|null='staff_members',cost:number|null=300)=>({id,minutes:60,submission_status:status,rate_source,cost});
beforeEach(()=>{state.pages=[];state.calls=[];});
describe('internal project registered time reader',()=>{
 it('reads beyond first 500 rows and retains exact project target',async()=>{
  state.pages=[{data:Array.from({length:500},(_,i)=>row(String(i)))},{data:[row('500','approved')]}];
  const result=await readInternalProjectTime('project-exact');
  expect(result.hours).toBe(501);expect(result.approved).toBe(300);expect(result.preliminary).toBe(150000);
  expect(state.calls).toEqual([{key:'project_id',id:'project-exact',from:0,to:499},{key:'project_id',id:'project-exact',from:500,to:999}]);
 });
 it('preserves missing rate as incomplete and excludes rejected reports',async()=>{
  state.pages=[{data:[row('1','submitted','missing_rate',0),row('2','rejected'),row('3','approved','staff_members'),row('4','submitted',null,null)]}];
  const result=await readInternalProjectTime('project');expect(result.hours).toBe(3);expect(result.missing).toBe(2);expect(result.approved).toBe(300);
 });
 it('retains corrected submissions as preliminary, matching the canonical writer',async()=>{
  state.pages=[{data:[row('1','corrected')]}];
  const result=await readInternalProjectTime('project');expect(result.hours).toBe(1);expect(result.preliminary).toBe(300);
 });
 it('does not certify an empty projection as zero activity',async()=>{
  state.pages=[{data:[]}];const result=await readInternalProjectTime('project');
  expect(result.hours).toBeNull();expect(result.hasEvidence).toBe(false);
 });
 it('does not turn backend failure into zero cost',async()=>{
  state.pages=[{data:null,error:new Error('permission denied')}];
  await expect(readInternalProjectTime('project')).rejects.toThrow('permission denied');
 });
 it('does not render corrupt numbers as complete costs or hours',async()=>{
  state.pages=[{data:[{...row('1'),minutes:NaN},row('2','approved','staff_members',-1),row('3','approved','staff_members',Infinity)]}];
  const result=await readInternalProjectTime('project');expect(result.hours).toBeNull();expect(result.missing).toBe(3);
 });
 it('does not accept unknown rate provenance as complete',async()=>{
  state.pages=[{data:[row('1','approved','new-unverified-source')]}];
  expect((await readInternalProjectTime('project')).missing).toBe(1);
 });
});
