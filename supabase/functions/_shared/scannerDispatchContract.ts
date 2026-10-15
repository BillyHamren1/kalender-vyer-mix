/** Shared wire contract: fail closed on tenant, identity and malformed owner state. */
export const record = (v: unknown): Record<string, any> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1000000000
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const lineKey = (v: unknown) => typeof v === 'string' && v.split('#').length === 2 && uuid(v.split('#')[0]) && (v.split('#')[1] === 'manual' || uuid(v.split('#')[1]))
const date = (v: unknown) => typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))
const fingerprint = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
export function validDispatchCommand(v: unknown): boolean {
 const r=record(v); if(!r || !count(r.expectedRevision)) return false
 const base=['command','expectedRevision']; let fields: string[]=[]
 switch(r.command) {
 case 'CREATE_PARCEL': fields=['label']; if(!text(r.label,80))return false;break
 case 'SET_ALLOCATION': fields=['parcelId','lineKey','quantity'];if(!uuid(r.parcelId)||!lineKey(r.lineKey)||!count(r.quantity))return false;break
 case 'SEAL_PARCEL':fields=['parcelId'];if(!uuid(r.parcelId))return false;break
 case 'REOPEN_PARCEL':fields=['parcelId','reason'];if(!uuid(r.parcelId)||!text(r.reason,500)||r.reason.length<3)return false;break
 case 'START_CONTROL':fields=['restartPacking'];if(r.restartPacking!==undefined && typeof r.restartPacking!=='boolean')return false;break
 case 'RECORD_COUNT':fields=['lineKey','quantity'];if(!lineKey(r.lineKey)||!count(r.quantity))return false;break
 case 'SIGN_HANDOFF':fields=['termsVersion','termsDigest'];if(r.termsVersion!=='utleverans-attest-1.0'||r.termsDigest!=='sha256:6ba64c9184f4b19d114e7967047b47f151b42edf1eab23996ee84d2774e5ae0f')return false;break
 case 'CLOSE':break
 default:return false
 }
 return keys(r,[...base,...fields])
}
export function parseDispatch(input: unknown, owner=false): {ok:true;value:Record<string,any>}|{ok:false;error:string} {
 const r=record(input);if(!r)return {ok:false,error:'invalid_body'}
 const base=['schema','scanner_contract_version','bookingId','reservationId','action']
 if(owner)base.push('organizationId','bookingNumber','actorId')
 if(r.schema!==(owner?'eventflow-scanner-bundle-dispatch.v1':'eventflow-scanner-dispatch-gateway.v1')||r.scanner_contract_version!=='scanner_contract_v1')return {ok:false,error:'unsupported_schema'}
 if(!uuid(r.bookingId)||!uuid(r.reservationId)||owner&&(!uuid(r.organizationId)||!uuid(r.actorId)||!text(r.bookingNumber,128)))return {ok:false,error:'invalid_identity'}
 if(r.action==='COMMAND') {base.push('operationId','request');if(!uuid(r.operationId)||!validDispatchCommand(r.request))return {ok:false,error:'invalid_command'}}
 else if(r.action!=='READ')return {ok:false,error:'invalid_action'}
 if(!keys(r,base))return {ok:false,error:'unexpected_field'}
 return {ok:true,value:r}
}
function quantities(value: unknown): boolean { const r=record(value);return !!r && Object.entries(r).every(([k,v])=>lineKey(k)&&count(v)) }
export function validDispatchState(value: unknown): boolean {
 const s=record(value); if(!s||!['PACKING','CONTROL','SIGNED','CLOSED'].includes(s.phase)||!quantities(s.counts)||!Array.isArray(s.parcels)||s.parcels.length>10000)return false
 const ids=new Set();for(const p of s.parcels){if(!record(p)||!uuid(p.id)||ids.has(p.id)||!text(p.label,80)||typeof p.sealed!=='boolean'||!quantities(p.allocations))return false;ids.add(p.id)}
 if(s.packFingerprint!==undefined&&!fingerprint(s.packFingerprint))return false
 if(s.signature!==undefined){const t=record(s.signature);if(!t||!uuid(t.actorId)||!date(t.signedAt)||!fingerprint(t.packFingerprint)||!count(t.signedRevision)||t.termsVersion!=='utleverans-attest-1.0'||t.termsDigest!=='sha256:6ba64c9184f4b19d114e7967047b47f151b42edf1eab23996ee84d2774e5ae0f')return false}
 return !['SIGNED','CLOSED'].includes(s.phase)||s.signature!==undefined
}
export function validDispatchProjection(v: unknown,reservationId: string): boolean {
 const r=record(v),p=record(r?.pack);if(!r||!p||r.schema!=='wms-dispatch-projection.v1'||r.reservationId!==reservationId||!count(r.revision)||!fingerprint(p.fingerprint)||!Array.isArray(p.lines)||p.lines.length>10000||typeof r.controlCurrent!=='boolean'||(r.signatureValid!==null&&typeof r.signatureValid!=='boolean')||typeof r.requiresRecontrol!=='boolean'||(r.state!==null&&!validDispatchState(r.state)))return false
 if(r.signatureValid===true&&(!r.state||!['SIGNED','CLOSED'].includes(r.state.phase)||r.state.signature.packFingerprint!==p.fingerprint||(!r.controlCurrent&&!(r.state.phase==='CLOSED'&&r.historicalHandoff===true&&r.signatureScope==='HANDOFF_HISTORY'&&r.requiresRecontrol===false))))return false
 const seen=new Set();for(const l of p.lines){if(!record(l)||!uuid(l.line_id)||l.type_id!==null&&!uuid(l.type_id)||l.key!==l.line_id+'#'+(l.type_id??'manual')||seen.has(l.key)||!count(l.required)||!count(l.packed))return false;seen.add(l.key)}
 return true
}
export const DISPATCH_REJECTION_REASONS = ['stale_dispatch_revision','reservation_not_confirmed','allocation_exceeds_packed','parcel_not_found','parcel_sealed','empty_parcel','restart_packing_required','line_not_packable','control_stale','dispatch_incomplete','invalid_allocated_instance_state','attestation_mismatch','dispatch_signed','signature_stale','package_structure_missing','ambiguous_compatible_components'] as const
export function validDispatchReceipt(v: unknown, expected: Record<string,any>): boolean {
 const r=record(v);if(!r||r.schema!=='wms-dispatch-receipt.v1'||r.operationId!==expected.operationId||r.reservationId!==expected.reservationId||!date(r.serverTimestamp)||typeof r.replayed!=='boolean')return false
 if(r.status==='REJECTED')return r.revision===null&&r.parcelId===null&&r.state===null&&DISPATCH_REJECTION_REASONS.includes(r.reason)
 return r.status==='COMMITTED'&&r.revision===expected.request.expectedRevision+1&&(r.parcelId===null||uuid(r.parcelId))&&validDispatchState(r.state)
}
export function validDispatchResponse(v: unknown, expected: Record<string,any>): boolean {
 const r=record(v);if(!r||r.schema!=='eventflow-scanner-dispatch-response.v1'||r.organizationId!==expected.organizationId||r.bookingId!==expected.bookingId||r.bookingNumber!==expected.bookingNumber||r.reservationId!==expected.reservationId||typeof r.dispatchCommandsEnabled!=='boolean')return false
 return expected.action==='READ'?validDispatchProjection(r.projection,expected.reservationId):validDispatchReceipt(r.receipt,expected)
}
