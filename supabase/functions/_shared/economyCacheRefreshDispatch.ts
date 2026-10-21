type EconomyRefreshArgs = {
  supabaseUrl: string | null | undefined;
  serviceRoleKey: string | null | undefined;
  organizationId: string | null | undefined;
  bookingIds: string[];
  fetcher?: typeof fetch;
  logger?: Pick<Console, 'warn'>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Dispatch a targeted background refresh and contain/log transport failures. */
export function dispatchEconomyCacheRefresh(args: EconomyRefreshArgs): Promise<void> | null {
  if (!args.supabaseUrl || !args.serviceRoleKey || !args.organizationId) return null;
  const bookingIds = [...new Set(args.bookingIds.filter((id) => UUID.test(id)))].slice(0, 200);
  if (bookingIds.length === 0) return null;

  const fetcher = args.fetcher ?? fetch;
  const logger = args.logger ?? console;
  const url = `${args.supabaseUrl.replace(/\/+$/, '')}/functions/v1/refresh-economy-cache`;

  return fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.serviceRoleKey}`,
    },
    body: JSON.stringify({ organization_id: args.organizationId, booking_ids: bookingIds }),
  }).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }).catch((error) => {
    logger.warn('[import-bookings] economy refresh dispatch failed', error);
  });
}
