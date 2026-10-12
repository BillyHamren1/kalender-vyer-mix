import { beforeEach, expect, it, vi } from 'vitest';
import { commercialCloseDecision } from '../../../supabase/functions/planning-api-proxy/commercial-close-boundary';
const state=vi.hoisted(()=>({booking:{} as any,error:null as Error|null,close:vi.fn(),reopen:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.booking,error:state.error})})})})}}));
vi.mock('@/services/planningApiService',()=>({markReadyForInvoicing:state.close,markReopenedInBooking:state.reopen}));
import {syncBookingsForInvoicing,reopenBookingsInInvoicing} from '../bookingCloseSyncService';
beforeEach(()=>{state.booking={id:'0000123',organization_id:'org',is_internal:false,internal_type:null};state.error=null;vi.clearAllMocks();});
it.each([syncBookingsForInvoicing,reopenBookingsInInvoicing])('blocks internal booking before external commercial operation',async sync=>{
 state.booking.is_internal=true;state.booking.internal_type='warehouse';
 expect((await sync(['0000123'])).failedIds).toEqual(['0000123']);
 expect(state.close).not.toHaveBeenCalled();expect(state.reopen).not.toHaveBeenCalled();
});
it.each([syncBookingsForInvoicing,reopenBookingsInInvoicing])('preserves exact customer booking identity and deduplicates calls',async sync=>{
 expect((await sync(['0000123','0000123'])).successIds).toEqual(['0000123']);
 expect(state.close.mock.calls.length+state.reopen.mock.calls.length).toBe(1);
 expect((state.close.mock.calls[0]??state.reopen.mock.calls[0])[0]).toBe('0000123');
});
it('never forwards unavailable or failed booking reads',async()=>{
 state.booking=null;expect((await syncBookingsForInvoicing(['0000123'])).failedIds).toHaveLength(1);
 state.error=new Error('denied');expect((await reopenBookingsInInvoicing(['0000123'])).failedIds).toHaveLength(1);
 expect(state.close).not.toHaveBeenCalled();expect(state.reopen).not.toHaveBeenCalled();
});
it('server boundary accepts only exact same-tenant commercial evidence',()=>{
 expect(commercialCloseDecision('0000123','org',state.booking)).toEqual({allowed:true});
 for(const row of [null,{...state.booking,is_internal:true},{...state.booking,is_internal:undefined},{...state.booking,internal_type:'warehouse'},{...state.booking,organization_id:'other'},{...state.booking,id:'123'}]) {
  expect(commercialCloseDecision('0000123','org',row).allowed).toBe(false);
 }
 expect(commercialCloseDecision('0000123',null,state.booking).allowed).toBe(false);
});
