// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({booking:{} as any,org:'org',handler:undefined as any,fetch:vi.fn(),user:true,internalProjects:[] as any[],projectError:null as Error|null,profileFilters:[] as any[],profileError:null as Error|null,bookingError:null as Error|null}));
vi.mock('https://esm.sh/@supabase/supabase-js@2',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:state.user?{id:'actor'}:null},error:null})},from:(table:string)=>{
 const q={select:()=>q,eq:(key:string,value:unknown)=>{if(table==='profiles')state.profileFilters.push([key,value]);return q;},or:()=>q,limit:async()=>({data:state.internalProjects,error:state.projectError}),maybeSingle:async()=>({data:table==='profiles'?(state.profileFilters.some(([key,value])=>key==='user_id'&&value==='actor')?{id:'distinct-profile-pk',user_id:'actor',organization_id:state.org}:null):state.booking,error:table==='profiles'?state.profileError:state.bookingError})};return q;
}})}));
vi.stubGlobal('Deno',{env:{get:(key:string)=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test',EF_SUPABASE_URL:'https://booking.invalid',PLANNING_API_KEY:'test'}[key])},serve:(handler:any)=>{state.handler=handler;}});
await import('../../../supabase/functions/planning-api-proxy/index');
beforeEach(()=>{state.booking={id:'0000123',organization_id:'org',is_internal:false,internal_type:null};state.org='org';state.user=true;state.internalProjects=[];state.projectError=null;state.profileFilters=[];state.profileError=null;state.bookingError=null;state.fetch.mockReset();state.fetch.mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',state.fetch);});
const request=(type:string)=>new Request('https://proxy.invalid',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({type,method:'POST',booking_id:'0000123',data:{status:'READY_FOR_INVOICING'}})});
it.each(['close_project','reopen_project'])('actual %s handler blocks Lager before upstream fetch',async type=>{
 state.booking.is_internal=true;state.booking.internal_type='warehouse';const res=await state.handler(request(type));
 expect(res.status).toBe(409);expect(state.fetch).not.toHaveBeenCalled();
});
it('actual handler blocks unavailable and cross-tenant evidence',async()=>{
 state.booking.organization_id='foreign';expect((await state.handler(request('close_project'))).status).toBe(403);expect(state.fetch).not.toHaveBeenCalled();
});
it.each(['close_project','reopen_project'])('actual customer %s preserves leading-zero owner ID in upstream request',async type=>{
 expect((await state.handler(request(type))).status).toBe(200);
 expect(state.profileFilters).toContainEqual(['user_id','actor']);expect(state.fetch).toHaveBeenCalledTimes(1);expect(new URL(state.fetch.mock.calls[0][0]).searchParams.get('booking_id')).toBe('0000123');
});
it('actual unauthenticated handler never performs upstream mutation',async()=>{
 state.user=false;expect((await state.handler(request('close_project'))).status).toBe(401);expect(state.fetch).not.toHaveBeenCalled();
});

it('normalizes variant action spelling before applying the same guard',async()=>{
 state.booking.is_internal=true;expect((await state.handler(request(' CLOSE_PROJECT '))).status).toBe(409);expect(state.fetch).not.toHaveBeenCalled();
});
it('blocks an internal linked project even when booking classification is commercial',async()=>{
 state.internalProjects=[{id:'internal'}];expect((await state.handler(request('close_project'))).status).toBe(409);expect(state.fetch).not.toHaveBeenCalled();
});
it('fails closed if linked-project evidence cannot be read',async()=>{
 state.projectError=new Error('permission denied');expect((await state.handler(request('close_project'))).status).toBe(500);expect(state.fetch).not.toHaveBeenCalled();
});

it.each(['profileError','bookingError'] as const)('fails closed on %s before upstream mutation',async key=>{
 state[key]=new Error('read failure');expect((await state.handler(request('close_project'))).status).toBe(500);expect(state.fetch).not.toHaveBeenCalled();
});
it('requires POST for normalized commercial commands',async()=>{
 const req=new Request('https://proxy.invalid',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({type:' CLOSE_PROJECT ',method:'GET',booking_id:'0000123'})});
 expect((await state.handler(req)).status).toBe(405);expect(state.fetch).not.toHaveBeenCalled();
});
