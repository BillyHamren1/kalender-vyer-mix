const REQUEST_DOMAIN = 'finance-operations-project-metadata.v1';
const ACK_DOMAIN = 'finance-operations-project-metadata-ack.v1';
const DESTINATION = 'finance-project-metadata-v1';
type Config = { enabled: boolean; triggerSecret: string; issuer: string; signingSecret: string; destinationUrl: string; allowedUrl: string };
type Claim = { lease_token: string; destination: string; body: string };
type Dependencies = { config: Config; claim: () => Promise<Claim | null>; finish: (token: string, ack: unknown, failure: string | null) => Promise<boolean>; fetch: typeof fetch; now?: () => number; nonce?: () => string };
const encoder = new TextEncoder();
export async function signature(secret: string, domain: string, issuer: string, timestamp: string, nonce: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode([domain, issuer, timestamp, nonce, body].join('\n'))));
  return 'v1=' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff === 0; }
function configured(c: Config) {
  try { const u = new URL(c.destinationUrl); return c.enabled && c.triggerSecret.length >= 32 && c.signingSecret.length >= 32 && /^[A-Za-z0-9_-]{1,64}$/.test(c.issuer) && u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && c.destinationUrl === c.allowedUrl; } catch { return false; }
}
export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    if (!configured(deps.config)) return Response.json({ error: 'dispatcher_disabled' }, { status: 503 });
    if (!equal(req.headers.get('authorization') ?? '', 'Bearer ' + deps.config.triggerSecret)) return new Response(null, { status: 401 });
    // No caller-supplied receipt, tenant, destination or financial payload is accepted.
    if ((await req.text()).trim() !== '') return Response.json({ error: 'body_not_allowed' }, { status: 400 });
    let claim: Claim | null;
    try { claim = await deps.claim(); } catch { return Response.json({ error: 'claim_failed' }, { status: 503 }); }
    if (!claim) return Response.json({ delivered: false, idle: true });
    let failure = 'transport_failure';
    try {
      if (claim.destination !== DESTINATION || encoder.encode(claim.body).length > 16384) throw new Error('invalid_claim');
      const envelope = JSON.parse(claim.body);
      const timestamp = String((deps.now ?? Date.now)());
      const nonce = (deps.nonce ?? (()=>crypto.randomUUID()))();
      const headers = { 'content-type': 'application/json', 'x-operations-issuer': deps.config.issuer, 'x-operations-timestamp': timestamp, 'x-operations-nonce': nonce,
        'x-operations-signature': await signature(deps.config.signingSecret, REQUEST_DOMAIN, deps.config.issuer, timestamp, nonce, claim.body) };
      const response = await deps.fetch(deps.config.destinationUrl, { method:'POST',headers,body:claim.body,redirect:'error',signal:AbortSignal.timeout(15000) });
      if (!response.ok) { failure=response.status>=400&&response.status<500&&![408,429].includes(response.status)?'remote_rejected':'transport_failure'; throw new Error('rejected'); }
      failure='invalid_ack';
      // Bounded read avoids trusting remote Content-Length.
      const reader=response.body?.getReader(); if (!reader) throw new Error('empty');
      const chunks: Uint8Array[]=[];let size=0;
      while (true) { const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw new Error('large');}chunks.push(part.value); }
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const rawAck=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if (response.headers.get('x-operations-issuer')!==deps.config.issuer || response.headers.get('x-operations-timestamp')!==timestamp || response.headers.get('x-operations-nonce')!==nonce ||
          !equal(response.headers.get('x-operations-signature')??'',await signature(deps.config.signingSecret,ACK_DOMAIN,deps.config.issuer,timestamp,nonce,rawAck))) throw new Error('signature');
      const ack=JSON.parse(rawAck);
      if (Object.keys(ack).sort().join(',') !== ['schema','issuer','destination','source_organization_id','source_project_id','revision','fingerprint','replayed'].sort().join(',') ||
          ack.destination!==DESTINATION || ack.schema!==ACK_DOMAIN || ack.issuer!==deps.config.issuer || typeof ack.replayed!=='boolean' ||
          ['source_organization_id','source_project_id','revision','fingerprint'].some(k=>ack[k]!==envelope[k])) throw new Error('identity');
      const finished=await deps.finish(claim.lease_token,{...ack,destination:DESTINATION},null);
      return Response.json({delivered:finished},{status:finished?200:409});
    } catch {
      // If remote commit happened before timeout, retry the same immutable receipt with a new nonce.
      try { await deps.finish(claim.lease_token,null,failure); } catch { /* lease expiry recovers ambiguous DB failure */ }
      return Response.json({delivered:false,error:failure},{status:502});
    }
  };
}
