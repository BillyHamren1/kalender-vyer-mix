// Hämtar canonical single-booking-status från Booking-modulen.
// Ren läsning — inga mutationer.

import {
  parseSingleBookingSourceResponse,
  type SingleBookingSourceResult,
} from "../_shared/singleBookingSource.ts";

export const EXPORT_BASE =
  "https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings";

export async function fetchExternalStatus(
  bookingId: string,
  organizationId: string,
  importApiKey: string,
): Promise<{ ok: true; parsed: SingleBookingSourceResult } | { ok: false; error: string }> {
  const params = new URLSearchParams({ organization_id: organizationId, booking_id: bookingId });
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(`${EXPORT_BASE}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${importApiKey}`,
        "x-api-key": importApiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${text.substring(0, 200)}` };
    }
    const json = await resp.json();
    const normalized = Array.isArray(json?.data) || json?.found !== undefined
      ? json
      : { data: json?.data ? [json.data] : [] };
    const parsed = parseSingleBookingSourceResponse(
      normalized,
      { bookingId, organizationId },
      { ok: true, status: 200 },
    );
    return { ok: true, parsed };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}
