/** Backwards-readable mobile token envelope with server-authenticated claims. */
export interface MobileMessageClaims { staffId: string; sessionId: string; timestamp: number; expiresAt: number }
const domain = 'eventflow.mobile-session.v1';
function valid(c: MobileMessageClaims): boolean {
  return typeof c.staffId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(c.staffId)
    && typeof c.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(c.sessionId)
    && Number.isSafeInteger(c.timestamp) && Number.isSafeInteger(c.expiresAt)
    && c.expiresAt > c.timestamp && c.expiresAt - c.timestamp <= 30 * 24 * 60 * 60 * 1000;
}
async function sign(c: MobileMessageClaims, secret: string): Promise<string> {
  if (secret.length < 32 || !valid(c)) throw new Error('mobile_session_signing_unavailable');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = JSON.stringify([domain, c.staffId, c.sessionId, c.timestamp, c.expiresAt]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function createMobileMessageToken(claims: MobileMessageClaims, secret: string): Promise<string> {
  return btoa(JSON.stringify({ ...claims, signature: await sign(claims, secret) }));
}
export async function verifyMobileMessageClaims(payload: unknown, secret: string, now = Date.now()): Promise<boolean> {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as MobileMessageClaims & { signature?: string };
  if (!valid(p) || p.timestamp > now + 60000 || p.expiresAt <= now || typeof p.signature !== 'string' || !/^[0-9a-f]{64}$/.test(p.signature) || secret.length < 32) return false;
  const expected = await sign(p, secret);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ p.signature.charCodeAt(i);
  return difference === 0;
}
