/** Server proposal only: no secrets or caller-selected tenant are persisted. */
export async function dispatchEconomyRefresh(input: {
  organizationId: string; bookingIds: string[]; url: string; serviceKey: string;
  request?: typeof fetch;
}) {
  const ids = [...new Set(input.bookingIds)];
  const failed: string[] = [];
  const request = input.request ?? fetch;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let succeeded = false;
    for (let attempt = 0; attempt < 2 && !succeeded; attempt++) {
      try {
        const response = await request(input.url, {
          method: 'POST', signal: AbortSignal.timeout(30000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.serviceKey}` },
          body: JSON.stringify({ organization_id: input.organizationId, booking_ids: chunk }),
        });
        const body = await response.json();
        succeeded = response.ok && !body.error && body.refreshed === chunk.length;
      } catch { /* retry once; retain the exact failed chunk below */ }
    }
    if (!succeeded) failed.push(...chunk);
  }
  if (failed.length) throw new EconomyDispatchError(failed);
}
export class EconomyDispatchError extends Error {
  readonly retryable = true;
  constructor(readonly bookingIds: string[]) { super('economy_refresh_dispatch_failed:retryable'); }
}
