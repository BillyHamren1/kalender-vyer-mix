import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({project:{} as any,sync:vi.fn(async()=>({failedIds:[],successIds:[],errors:[]})),updates:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:state.project,error:null})})}),update:(value:unknown)=>({eq:async()=>{state.updates.push(value);return {error:null};}})})}}));
vi.mock('@/services/bookingCloseSyncService',()=>({syncBookingsForInvoicing:state.sync}));
vi.mock('@/services/jobCompletionAnalyticsService',()=>({recordJobCompletion:async()=>{}}));
vi.mock('@/services/bookingAssignmentService',()=>({recomputeBookingAssignment:async()=>{}}));
vi.mock('@/services/booking/liveBookingService',()=>({fetchLiveBookingAttachments:async()=>[]}));
import {updateProjectStatus} from '../projectService';
beforeEach(()=>{state.updates=[];state.sync.mockClear();});
it('finite internal completion has no Booking side effect',async()=>{
 state.project={booking_id:null,is_internal:false,project_kind:'internal_project'};
 await updateProjectStatus('finite','completed');
 expect(state.sync).not.toHaveBeenCalled();expect(state.updates).toHaveLength(1);
});
it('permanent Lager completion must not signal commercial invoicing',async()=>{
 state.project={booking_id:'lager-booking',is_internal:true,project_kind:null};
 await updateProjectStatus('lager','completed');
 expect(state.sync).not.toHaveBeenCalled();
});
