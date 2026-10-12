import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({project:{} as any,tables:[] as string[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:(table:string)=>{
 state.tables.push(table);if(table!=='projects')throw new Error('Unexpected write path '+table);
 const q={select:()=>q,eq:()=>q,single:async()=>({data:state.project,error:null})};return q;
}}}));
vi.mock('@/services/booking/bookingPackingSyncService',()=>({syncBookingToPacking:vi.fn()}));
vi.mock('@/services/staffAssignmentCore',()=>({assignStaffToTeamCore:vi.fn()}));
import {createWarehouseProjectFromInbox} from '../warehouseProjectService';
beforeEach(()=>{state.tables=[];});
it.each([{is_internal:false,project_kind:'internal_project'},{is_internal:false,project_kind:'internal_activity'},{is_internal:true,project_kind:null}])('blocks stale internal inbox conversion before packing or reservation writes %#',async classification=>{
 state.project={id:'source',...classification};
 await expect(createWarehouseProjectFromInbox({source_type:'project',source_id:'source',organization_id:'org'} as any,{name:'Internal',packStart:'2026-10-12',packEnd:'2026-10-12',returnStart:null,returnEnd:null})).rejects.toThrow('saknar aktiverat materialflöde');
 expect(state.tables).toEqual(['projects']);
});
