/** Locked read request contract. Membership/tenant authorization is server-side;
 * this validator does not authorize a source by validating its labels. */
export interface BookingCommercialReadRequest {
 schema_version:'operations-booking-commercial-read.v1';operations_organization_id:string;
 economic_scope_id:string;scope_revision:number;finance_organization_id:string;
 finance_project_id:string;booking_source_organization_id:string;booking_source_id:string;
 requested_source_sequence:number|null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestKeys=['schema_version','operations_organization_id','economic_scope_id','scope_revision','finance_organization_id','finance_project_id','booking_source_organization_id','booking_source_id','requested_source_sequence'];
const requestUUIDKeys=['operations_organization_id','economic_scope_id','finance_organization_id','finance_project_id','booking_source_organization_id','booking_source_id'] as const;
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function positive(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>0;}
export function validateBookingCommercialReadRequest(value:unknown):BookingCommercialReadRequest {
 if(!exact(value,requestKeys)||value.schema_version!=='operations-booking-commercial-read.v1'||!requestUUIDKeys.every(key=>typeof value[key]==='string'&&UUID.test(value[key] as string))||!positive(value.scope_revision)||(value.requested_source_sequence!==null&&!positive(value.requested_source_sequence)))throw new Error('invalid_booking_commercial_read_request');
 const normalized={...value};for(const key of requestUUIDKeys)normalized[key]=(value[key] as string).toLowerCase();
 return normalized as unknown as BookingCommercialReadRequest;
}

export interface BookingCommercialEvidenceRow {source_row_id:string;source_row_revision:number;net_minor:number;vat_minor:number;quantity:string;}
export interface BookingCommercialReadResponse extends Omit<BookingCommercialReadRequest,'schema_version'> {
 schema_version:'finance-booking-commercial-evidence-read.v1';state:'received'|'no_evidence'|'source_disappeared';
 receipt_id:string|null;source_sequence:number|null;commercial_snapshot_id:string|null;commercial_revision:number|null;
 currency:string|null;invoiceable_net_minor:number|null;invoiceable_vat_minor:number|null;lifecycle_status:'confirmed'|'cancelled'|null;
 source_disappeared:boolean|null;rows:BookingCommercialEvidenceRow[];latest_received_sequence:number|null;is_latest_received:boolean;
 observed_at:string|null;received_at:string|null;as_of:string;upstream_currentness:'unverified';evidence_fingerprint:string|null;
}
const responseKeys=['schema_version',...requestKeys.filter(key=>key!=='schema_version'),'state','receipt_id','source_sequence','commercial_snapshot_id','commercial_revision','currency','invoiceable_net_minor','invoiceable_vat_minor','lifecycle_status','source_disappeared','rows','latest_received_sequence','is_latest_received','observed_at','received_at','as_of','upstream_currentness','evidence_fingerprint'];
const evidenceUUIDKeys=['receipt_id','commercial_snapshot_id'] as const;
const missingEvidenceKeys=['receipt_id','source_sequence','commercial_snapshot_id','commercial_revision','currency','invoiceable_net_minor','invoiceable_vat_minor','lifecycle_status','source_disappeared','observed_at','received_at','evidence_fingerprint'] as const;
function boundedText(value:unknown,max:number):value is string{return typeof value==='string'&&value.length>0&&Array.from(value).length<=max&&value.trim()===value&&!value.includes('\0')&&new TextDecoder().decode(new TextEncoder().encode(value))===value;}
function timestamp(value:unknown):value is string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10)),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);return year>0&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&Number(value.slice(11,13))<24&&Number(value.slice(14,16))<60&&Number(value.slice(17,19))<60;}

/** Compact positional immutable evidence. Volatile latest/as_of and requested
 * selector are excluded so a historical receipt retains its saved identity.
 * Hash integrity is not endpoint/source authentication or upstream currentness. */
export async function bookingCommercialEvidenceFingerprint(response:BookingCommercialReadResponse):Promise<string|null> {
 if(response.state==='no_evidence')return null;
 const canonicalUUID=(value:string|null)=>value===null?null:value.toLowerCase();
 const document=['finance-booking-commercial-evidence-read.v1',canonicalUUID(response.operations_organization_id),canonicalUUID(response.economic_scope_id),response.scope_revision,canonicalUUID(response.finance_organization_id),canonicalUUID(response.finance_project_id),canonicalUUID(response.booking_source_organization_id),canonicalUUID(response.booking_source_id),
  canonicalUUID(response.receipt_id),response.source_sequence,canonicalUUID(response.commercial_snapshot_id),response.commercial_revision,response.currency,response.invoiceable_net_minor,response.invoiceable_vat_minor,response.lifecycle_status,response.source_disappeared,
  response.rows.map(row=>[row.source_row_id,row.source_row_revision,row.net_minor,row.vat_minor,row.quantity]),response.observed_at,response.received_at];
 const bytes=new TextEncoder().encode(JSON.stringify(document));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** Validate copied source evidence; sums check source consistency and never
 * reconstruct product prices, VAT or personnel/forecast calculations. */
export async function validateBookingCommercialReadResponse(value:unknown,expectedValue:BookingCommercialReadRequest):Promise<BookingCommercialReadResponse> {
 const expected=validateBookingCommercialReadRequest(expectedValue);
 if(!exact(value,responseKeys)||value.schema_version!=='finance-booking-commercial-evidence-read.v1'||value.upstream_currentness!=='unverified'||!timestamp(value.as_of)||!['received','no_evidence','source_disappeared'].includes(value.state as string)||typeof value.is_latest_received!=='boolean'||!Array.isArray(value.rows)||value.rows.length>1000)throw new Error('invalid_booking_commercial_read_response');
 for(const key of requestUUIDKeys){if(typeof value[key]!=='string'||!UUID.test(value[key] as string)||(value[key] as string).toLowerCase()!==expected[key])throw new Error('booking_commercial_read_scope_mismatch');}
 if(value.scope_revision!==expected.scope_revision||value.requested_source_sequence!==expected.requested_source_sequence)throw new Error('booking_commercial_read_scope_mismatch');
 if(value.latest_received_sequence!==null&&!positive(value.latest_received_sequence))throw new Error('invalid_booking_commercial_received_sequence');
 if(value.state==='no_evidence'){
  if(!missingEvidenceKeys.every(key=>value[key]===null)||value.rows.length!==0||value.is_latest_received!==false||(expected.requested_source_sequence===null&&value.latest_received_sequence!==null))throw new Error('unavailable_booking_commercial_evidence_has_values');
  return value as unknown as BookingCommercialReadResponse;
 }
 if(!evidenceUUIDKeys.every(key=>typeof value[key]==='string'&&UUID.test(value[key] as string))||!positive(value.source_sequence)||!positive(value.commercial_revision)||!positive(value.latest_received_sequence)||value.latest_received_sequence<value.source_sequence||value.is_latest_received!==(value.latest_received_sequence===value.source_sequence)||
  (expected.requested_source_sequence===null&&value.is_latest_received!==true)||(expected.requested_source_sequence!==null&&value.source_sequence!==expected.requested_source_sequence)||
  typeof value.currency!=='string'||!/^[A-Z]{3}$/.test(value.currency)||!Number.isSafeInteger(value.invoiceable_net_minor)||Number(value.invoiceable_net_minor)<0||!Number.isSafeInteger(value.invoiceable_vat_minor)||Number(value.invoiceable_vat_minor)<0||
  !['confirmed','cancelled'].includes(value.lifecycle_status as string)||typeof value.source_disappeared!=='boolean'||(value.state==='source_disappeared')!==value.source_disappeared||(value.source_disappeared&&value.lifecycle_status!=='cancelled')||!timestamp(value.observed_at)||!timestamp(value.received_at)||typeof value.evidence_fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(value.evidence_fingerprint))throw new Error('invalid_booking_commercial_saved_evidence');
 const ids=new Set<string>();let net=0n,vat=0n;
 for(const row of value.rows){if(!exact(row,['source_row_id','source_row_revision','net_minor','vat_minor','quantity'])||!boundedText(row.source_row_id,128)||ids.has(row.source_row_id)||!positive(row.source_row_revision)||!Number.isSafeInteger(row.net_minor)||!Number.isSafeInteger(row.vat_minor)||typeof row.quantity!=='string'||row.quantity.length>64||! /^-?(?:0|[1-9][0-9]*)(?:\.\d+)?$/.test(row.quantity))throw new Error('invalid_booking_commercial_saved_row');
  ids.add(row.source_row_id);net+=BigInt(row.net_minor as number);vat+=BigInt(row.vat_minor as number);
 }
 if(net!==BigInt(value.invoiceable_net_minor as number)||vat!==BigInt(value.invoiceable_vat_minor as number))throw new Error('booking_commercial_saved_row_totals_mismatch');
 const response=value as unknown as BookingCommercialReadResponse;
 if(await bookingCommercialEvidenceFingerprint(response)!==response.evidence_fingerprint)throw new Error('booking_commercial_evidence_fingerprint_mismatch');
 return response;
}
