/** Scoped Operations→Finance transport. A successful HTTP status is not an ack. */
export const FINANCE_PERSONNEL_ROUTE = 'operations-personnel-cost-receive';
export const FINANCE_PERSONNEL_MAX_BYTES = 256 * 1024;
const encoder = new TextEncoder();
const uuid = (v: unknown): v is string => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export async function readBoundedBody(body:ReadableStream<Uint8Array>|null,limit:number,timeoutMs=15000):Promise<Uint8Array>{
  if(!body)throw new Error('empty_body');const reader=body.getReader();let bytes=new Uint8Array();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('body_read_timeout')),timeoutMs);});
  try{while(true){const c=await Promise.race([reader.read(),timeout]);if(c.done)break;
    if(bytes.length+c.value.length>limit)throw new Error('body_too_large');
    const combined=new Uint8Array(bytes.length+c.value.length);combined.set(bytes);combined.set(c.value,bytes.length);bytes=combined;}
    return bytes;
  }catch(error){void reader.cancel().catch(()=>{});throw error;}finally{clearTimeout(timer);}
}
export const rawBodySha256 = async (body: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
export interface PersonnelOutboxClaim {
  id: string; organization_id: string; source_time_stream_id: string; source_revision: number;
  raw_body: string; body_sha256: string; destination_organization_id: string;
  key_id: string; endpoint_url: string; lease_owner: string; lease_token: string;
}
export interface PersonnelTransportReceipt {
  schema: 'operations-personnel-cost-receipt-v1'; outcome: 'accepted' | 'replayed' | 'stale';
  source_organization_id: string; source_time_stream_id: string;
  requested_source_revision: number; applied_source_revision: number; current_source_revision: number;
  request_body_sha256: string; snapshot_receipt_id: string; snapshot_fingerprint: string;
  receipt_id: string; destination_organization_id: string; shadow_only: true;
}
export function trustedFinanceEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    !url.pathname.endsWith('/functions/v1/' + FINANCE_PERSONNEL_ROUTE)) throw new Error('untrusted_finance_endpoint');
  return url.href;
}
export async function signFinancePersonnelRequest(
  rawBody: string, keyId: string, secret: string,
  options: { now?: Date; nonce?: string } = {},
): Promise<Record<string, string>> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(keyId) || encoder.encode(secret).byteLength < 32 ||
    encoder.encode(rawBody).byteLength > FINANCE_PERSONNEL_MAX_BYTES) throw new Error('invalid_transport_configuration');
  const timestamp = String(Math.floor((options.now ?? new Date()).getTime() / 1000));
  const nonce = options.nonce ?? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !/^\d+$/.test(timestamp)) throw new Error('invalid_transport_attempt');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = ['POST', FINANCE_PERSONNEL_ROUTE, 'operations-personnel-cost-v1', keyId, timestamp, nonce, rawBody].join('\n');
  return {
    'content-type': 'application/json', 'x-eventflow-key-id': keyId,
    'x-eventflow-timestamp': timestamp, 'x-eventflow-nonce': nonce,
    'x-eventflow-signature': 'v1=' + hex(await crypto.subtle.sign('HMAC', key, encoder.encode(signed))),
  };
}
export function verifyPersonnelTransportReceipt(value: unknown, claim: PersonnelOutboxClaim, status: number): PersonnelTransportReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_finance_receipt');
  const r = value as PersonnelTransportReceipt;
  const keys = ['schema','outcome','source_organization_id','source_time_stream_id','requested_source_revision',
    'applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id',
    'snapshot_fingerprint','receipt_id','destination_organization_id','shadow_only'];
  if (Object.keys(r).length !== keys.length || Object.keys(r).some(k => !keys.includes(k)) ||
    r.schema !== 'operations-personnel-cost-receipt-v1' || r.shadow_only !== true ||
    r.source_organization_id !== claim.organization_id || r.source_time_stream_id !== claim.source_time_stream_id ||
    r.requested_source_revision !== claim.source_revision || r.request_body_sha256 !== claim.body_sha256 ||
    r.destination_organization_id !== claim.destination_organization_id || !uuid(r.receipt_id) ||
    !uuid(r.snapshot_receipt_id) || !/^[0-9a-f]{64}$/.test(r.snapshot_fingerprint) ||
    !integer(r.applied_source_revision) || !integer(r.current_source_revision)) throw new Error('unbound_finance_receipt');
  if (status === 200 && ['accepted', 'replayed'].includes(r.outcome) &&
    r.applied_source_revision === claim.source_revision && r.current_source_revision >= r.applied_source_revision) return r;
  if (status === 409 && r.outcome === 'stale' && r.applied_source_revision === r.current_source_revision &&
    r.current_source_revision > claim.source_revision) return r;
  throw new Error('inconsistent_finance_receipt');
}
export type PersonnelDispatchResult = { outcome: 'delivered' | 'superseded'; receipt: PersonnelTransportReceipt } |
  { outcome: 'retry' | 'blocked'; error: string };
export async function dispatchPersonnelOutboxClaim(
  claim: PersonnelOutboxClaim,
  config: { enabled: boolean; endpoint: string; keyId: string; secret: string; timeoutMs?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<PersonnelDispatchResult> {
  if (!config.enabled) return { outcome: 'blocked', error: 'transport_disabled' };
  try {
    const endpoint = trustedFinanceEndpoint(config.endpoint);
    if (endpoint !== trustedFinanceEndpoint(claim.endpoint_url) || claim.key_id !== config.keyId ||
      !uuid(claim.id) || !uuid(claim.organization_id) || !uuid(claim.destination_organization_id) ||
      !integer(claim.source_revision) || await rawBodySha256(claim.raw_body) !== claim.body_sha256)
      return { outcome: 'blocked', error: 'outbox_configuration_or_payload_mismatch' };
    const headers = await signFinancePersonnelRequest(claim.raw_body, config.keyId, config.secret);
    const response = await fetchImpl(endpoint, { method: 'POST', body: claim.raw_body, headers,
      redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs ?? 10000) });
    // Limit receipt separately: receiver errors must not leak response bodies into logs.
    if (!['200', '409'].includes(String(response.status))) {
      void response.body?.cancel().catch(()=>{});
      return { outcome: response.status === 403 || response.status === 422 ? 'blocked' : 'retry', error: 'finance_http_' + response.status };
    }
    const bytes = await readBoundedBody(response.body,16384,config.timeoutMs??10000);
    const receipt = verifyPersonnelTransportReceipt(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), claim, response.status);
    return { outcome: receipt.outcome === 'stale' ? 'superseded' : 'delivered', receipt };
  } catch {
    // Network timeout includes unknown commit outcome. Retry the immutable body.
    return { outcome: 'retry', error: 'finance_ack_unknown' };
  }
}
