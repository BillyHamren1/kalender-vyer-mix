import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookingProjection } from './booking-projection.server.ts';
const org = '00000000-0000-4000-8000-000000000002';
const commercial = { booking_id:'00000000-0000-4000-8000-000000000001',organization_id:org,canonical_status:'Confirmed',updated_at:'2026-10-12T08:00:00Z' };
test('internal project without booking is rejected before database write',async()=>{let calls=0;const result=await applyBookingProjection(org,{project_id:'00000000-0000-4000-8000-000000000003',organization_id:org,canonical_status:'Confirmed',updated_at:commercial.updated_at},{db:{rpc:async()=>{calls++;return {data:{applied:true},error:null};}}});assert.deepEqual(result,{ok:false,error:'booking_id_required'});assert.equal(calls,0);});
test('foreign commercial organization is rejected before database write',async()=>{let calls=0;const result=await applyBookingProjection('00000000-0000-4000-8000-000000000004',commercial,{db:{rpc:async()=>{calls++;return {data:{applied:true},error:null};}}});assert.deepEqual(result,{ok:false,error:'organization_mismatch'});assert.equal(calls,0);});
test('existing confirmed customer booking retains one projection write',async()=>{let calls=0;const result=await applyBookingProjection(org,commercial,{db:{rpc:async(name,args)=>{calls++;assert.equal(name,'upsert_catering_booking_projection');assert.deepEqual(args,{p_payload:commercial});return {data:{applied:true},error:null};}}});assert.equal(result.ok,true);assert.equal(result.applied,true);assert.equal(calls,1);});
