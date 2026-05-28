// @ts-nocheck
// notify-short-notice-bookings
// Tar emot ett gäng booking-ids, kollar vilka som är "kort varsel"
// (riggdag inom 7 dagar) och skickar
//   1) DM i webb-/mobil-inkorgen till alla admin/projekt/forsaljning
//   2) Mejl till samma mottagare (via send-transactional-email om
//      mall + email-domän finns konfigurerat — annars logg + no-op)
//
// Anropas fire-and-forget från import-bookings efter att nya bokningar
// importerats. Kan också anropas manuellt för retroaktiv notifiering.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  evaluateShortNotice,
  buildInAppMessage,
  buildEmailSubject,
  SHORT_NOTICE_NOTIFY_ROLES,
  type ShortNoticeRole,
} from '../_shared/shortNoticeBooking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPLATE_NAME = 'short-notice-booking';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const bookingIds: string[] = Array.isArray(body?.booking_ids)
      ? body.booking_ids.filter((x: unknown) => typeof x === 'string')
      : [];

    if (bookingIds.length === 0) {
      return json({ success: true, processed: 0, notified: 0, skipped: 0 });
    }

    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('id, booking_number, client, rigdaydate, eventdate, deliveryaddress, organization_id, status')
      .in('id', bookingIds);

    if (bErr) throw bErr;

    let notified = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const b of bookings || []) {
      if (b.status && String(b.status).toUpperCase() === 'CANCELLED') {
        skipped++;
        details.push({ booking_id: b.id, skipped: 'cancelled' });
        continue;
      }

      const evalRes = evaluateShortNotice({
        rigdaydate: b.rigdaydate,
        eventdate: b.eventdate,
      });

      if (!evalRes.isShortNotice) {
        skipped++;
        details.push({ booking_id: b.id, skipped: 'not_short_notice', days: evalRes.daysUntilRig });
        continue;
      }

      const payload = {
        bookingId: b.id,
        bookingNumber: b.booking_number,
        client: b.client,
        rigdaydate: b.rigdaydate,
        eventdate: b.eventdate,
        deliveryaddress: b.deliveryaddress,
        daysUntilRig: evalRes.daysUntilRig,
      };

      // Hämta mottagare: alla user_roles i org med admin/projekt/forsaljning.
      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', b.organization_id)
        .in('role', SHORT_NOTICE_NOTIFY_ROLES as unknown as string[]);

      if (rErr) {
        console.error('[notify-short-notice] role fetch failed', b.id, rErr);
        continue;
      }

      const userIds = Array.from(new Set((roles || []).map((r: any) => r.user_id as string)));
      if (userIds.length === 0) {
        details.push({ booking_id: b.id, skipped: 'no_recipients' });
        skipped++;
        continue;
      }

      // Hämta profiler för namn + email
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', userIds);

      const byUser = new Map<string, { email: string | null; name: string | null }>();
      for (const p of profiles || []) {
        byUser.set(p.user_id, { email: p.email ?? null, name: p.full_name ?? null });
      }

      // Idempotens: undvik dubblettnotis om vi redan skickat för bokningen.
      const dedupeKey = `short-notice:${b.id}`;
      const { data: existing } = await supabase
        .from('direct_messages')
        .select('id')
        .eq('sender_id', dedupeKey)
        .eq('organization_id', b.organization_id)
        .limit(1);

      if (existing && existing.length > 0) {
        details.push({ booking_id: b.id, skipped: 'already_notified' });
        skipped++;
        continue;
      }

      const inAppContent = buildInAppMessage(payload);
      const dmRows = userIds.map((uid) => ({
        sender_id: dedupeKey,
        sender_name: 'Systemet',
        sender_type: 'system',
        recipient_id: uid,
        recipient_name: byUser.get(uid)?.name ?? '',
        content: inAppContent,
        organization_id: b.organization_id,
        booking_id: b.id,
      }));

      const { error: dmErr } = await supabase.from('direct_messages').insert(dmRows);
      if (dmErr) {
        console.error('[notify-short-notice] dm insert failed', b.id, dmErr);
        continue;
      }

      // Mejl — bara om vi har en send-transactional-email pipeline.
      // Fail-soft: om mallen saknas eller email-domän inte är klar loggar
      // vi bara, vi bryter inte hela notifieringen.
      const emails = userIds
        .map((uid) => byUser.get(uid)?.email)
        .filter((e): e is string => !!e && /@/.test(e));

      const emailResults: any[] = [];
      for (const recipient of emails) {
        try {
          const res = await fetch(`${url}/functions/v1/send-transactional-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              templateName: TEMPLATE_NAME,
              recipientEmail: recipient,
              idempotencyKey: `short-notice-${b.id}-${recipient}`,
              templateData: {
                bookingNumber: b.booking_number,
                client: b.client,
                rigdaydate: b.rigdaydate,
                eventdate: b.eventdate,
                deliveryaddress: b.deliveryaddress,
                daysUntilRig: evalRes.daysUntilRig,
                subject: buildEmailSubject(payload),
                inAppMessage: inAppContent,
              },
            }),
          });
          emailResults.push({ recipient, status: res.status });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            console.warn('[notify-short-notice] email send non-200', recipient, res.status, txt);
          }
        } catch (err) {
          console.warn('[notify-short-notice] email send failed (no email infra?)', recipient, err);
          emailResults.push({ recipient, error: String(err) });
        }
      }

      notified++;
      details.push({
        booking_id: b.id,
        recipients: userIds.length,
        emails: emails.length,
        email_results: emailResults,
        days: evalRes.daysUntilRig,
      });
    }

    return json({ success: true, processed: bookingIds.length, notified, skipped, details });
  } catch (error) {
    console.error('[notify-short-notice] fatal', error);
    return json({ success: false, error: String(error?.message ?? error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
