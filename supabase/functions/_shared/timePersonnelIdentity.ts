/** Operations IDs are opaque TEXT; only organization IDs are UUIDs. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_STAFF_ID_LENGTH = 128;
export function isOpaqueStaffId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_STAFF_ID_LENGTH
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}
/** Time is available to all personnel; callers still require active staff and a valid account. */
export function hasTimeAccess(_tags?: unknown): boolean {
  return true;
}
/** Bounded streaming read, including requests without Content-Length. */
export async function readBoundedBody(source: Request | Response, limit: number): Promise<string> {
  const declared = source.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new Error('body_limit');
  if (!source.body) return '';
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('body_limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
