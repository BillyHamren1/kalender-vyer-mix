// Tunn klient mot externa Booking-systemets `update-booking-from-planning`.
// Pushar valfri delmängd av tillåtna fält. Kasta inte vid 4xx — returnera struktur
// så caller kan logga och köa retry.

export type ExternalWriteFields = {
  event_dates?: string[];
  rig_up_dates?: string[];
  rig_down_dates?: string[];
  rig_up_time?: string | null;
  rig_down_time?: string | null;
  operational_plan?: Record<string, unknown> | null;
  start_time_on_site?: string | null;
  operational_plan_updated_at?: string | null;
  // Kanoniska bokningsfält som Planning får uppdatera via central skrivväg.
  // OBS: Booking accepterar INTE rig_start_time/rig_end_time/event_*_time/
  // rigdown_*_time eller delivery_contact_email.
  rig_up_time?: string | null;
  rig_down_time?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  delivery_geocode?: { lat: number | null; lng: number | null } | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  internal_notes?: string | null;
  carry_more_than_10m?: boolean | null;
  ground_nails_allowed?: boolean | null;
  exact_time_needed?: boolean | null;
  exact_time_info?: string | null;
  rental_only?: boolean | null;
  status?: string | null;
};

export type ExternalWriteResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function pushBookingFieldsToExternal(params: {
  bookingId: string;
  organizationId: string;
  fields: ExternalWriteFields;
}): Promise<ExternalWriteResult> {
  const efUrl = Deno.env.get('EF_SUPABASE_URL');
  const apiKey = Deno.env.get('PLANNING_API_KEY');
  if (!efUrl || !apiKey) {
    return { ok: false, status: 0, body: { error: 'EF_SUPABASE_URL or PLANNING_API_KEY missing' } };
  }

  const url = `${efUrl}/functions/v1/update-booking-from-planning`;
  const payload = {
    booking_id: params.bookingId,
    organization_id: params.organizationId,
    source: 'planning',
    fields: params.fields,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: (err as Error).message } };
  }
}
