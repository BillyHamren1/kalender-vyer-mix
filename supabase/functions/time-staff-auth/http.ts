import { checkSharedSecret, handle, MAX_BODY_BYTES, SCHEMA, SECRET_HEADER, type Deps } from './core.ts';
import { readBoundedBody } from '../_shared/timePersonnelIdentity.ts';
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
/** No browser CORS or session issuance. The secret authenticates only this endpoint. */
export async function handleRequest(req: Request, secret: string | undefined, deps: () => Deps): Promise<Response> {
  // Supabase terminates TLS at its edge; the runtime sees http:// with x-forwarded-proto.
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  if (proto.split(',')[0].trim().toLowerCase() !== 'https') return reply(400, { schema: SCHEMA, error: 'https_required' });
  if (req.method !== 'POST') return reply(405, { schema: SCHEMA, error: 'method_not_allowed' });
  const denied = checkSharedSecret(secret, req.headers.get(SECRET_HEADER));
  if (denied) return reply(denied.status, denied.body);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') ?? '')) {
    return reply(400, { schema: SCHEMA, error: 'invalid_request' });
  }
  let raw: string;
  try { raw = await readBoundedBody(req, MAX_BODY_BYTES); }
  catch { return reply(400, { schema: SCHEMA, error: 'invalid_request' }); }
  try { const result = await handle(deps(), raw); return reply(result.status, result.body); }
  catch { return reply(503, { schema: SCHEMA, error: 'unavailable' }); }
}
