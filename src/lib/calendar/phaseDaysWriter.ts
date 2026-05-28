/**
 * phaseDaysWriter
 * --------------------------------------------------------------------------
 * Gemensam skrivväg för fler rig/event/rigDown-dagar på en bokning.
 * Speglar EXAKT logiken i `src/components/Calendar/AddRiggDayDialog.tsx`:
 *
 *   1. För VARJE valt datum:
 *      - Slå upp befintlig calendar_events-rad (booking_id, event_type,
 *        source_date, organization_id).
 *      - Finns rad → uppdatera title/start_time/end_time/booking_number/
 *        delivery_address. Rör ALDRIG resource_id (project team stickiness).
 *      - Finns ingen rad → hämta sticky team för bokningen, lägg in ny
 *        calendar_events-rad med det team-id:t.
 *   2. ENDAST första (kronologiska) datumet speglas till
 *      bookings.<phase>date + bookings.<phase>_start_time/_end_time.
 *   3. För varje datum: `recompute_booking_staff_for_day` så BSA speglar
 *      teamets personal till bokningen.
 *
 * Returnerar antal lyckade dagar + ev. felmeddelanden per dag.
 *
 * HÅRDA REGLER:
 *  - Skapa ALDRIG nya datum-kolumner eller arrays på bookings.
 *  - Datum för bokningen lever i (rigdaydate/eventdate/rigdowndate) +
 *    calendar_events. Inget annat.
 *  - Skrivvägen är densamma för personalkalendern och stora projekt-planeraren.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  findExistingDayRow,
  getStickyTeamForBooking,
  getStickyTeamForLargeProject,
} from '@/lib/calendar/projectTeamStickiness';

export type PhaseEventType = 'rig' | 'event' | 'rigDown';

export interface PhaseDayWriteSpec {
  /** YYYY-MM-DD */
  date: string;
  startISO: string; // `${date}T${startTime}:00Z`
  endISO: string;
  isFirst: boolean;
}

/**
 * PURE helper — räknar ut per-dags-spec utifrån valda datum + tider.
 * Sorterar datum kronologiskt och markerar första som `isFirst`. Detta är
 * den biten som tidigare buggade (vi kapade dates till [0]).
 */
export function planPhaseDayWrites(
  dates: string[],
  startTime: string,
  endTime: string,
): PhaseDayWriteSpec[] {
  const cleaned = Array.from(
    new Set(
      dates
        .map((d) => (d ?? '').trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return cleaned.map((date, idx) => ({
    date,
    startISO: `${date}T${startTime}:00Z`,
    endISO: `${date}T${endTime}:00Z`,
    isFirst: idx === 0,
  }));
}

const PHASE_BOOKING_FIELDS: Record<
  PhaseEventType,
  { date: string; start: string; end: string }
> = {
  rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
  event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
  rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

export interface SavePhaseDaysInput {
  bookingId: string;
  largeProjectId?: string | null;
  eventType: PhaseEventType;
  /** YYYY-MM-DD list — får vara osorterad */
  dates: string[];
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  /**
   * Resource-id (team-1..5) att fallback:a på om bokningen ännu inte har
   * några calendar_events att härleda sticky-team ifrån. Valfritt — saknas
   * det och bokningen är "tom" hoppar vi calendar_events-inserten för den
   * dagen (booking-fältet räcker för att reconcilern skapar raden).
   */
  fallbackResourceId?: string | null;
  /** Titel på calendar_events-raden vid nyskapande (typ "Klientnamn"). */
  title?: string | null;
}

export interface SavePhaseDaysResult {
  successCount: number;
  failures: string[];
  totalDays: number;
}

export async function savePhaseDays(input: SavePhaseDaysInput): Promise<SavePhaseDaysResult> {
  const {
    bookingId,
    largeProjectId,
    eventType,
    dates,
    startTime,
    endTime,
    fallbackResourceId,
    title,
  } = input;

  const specs = planPhaseDayWrites(dates, startTime, endTime);
  if (specs.length === 0) {
    return { successCount: 0, failures: ['Inga giltiga datum'], totalDays: 0 };
  }

  // Hämta bokningens metadata (organization_id + adressfält + nummer/klient)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('organization_id, booking_number, deliveryaddress, delivery_city, client')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return {
      successCount: 0,
      failures: ['Kunde inte hämta bokningsdata'],
      totalDays: specs.length,
    };
  }

  const orgId = booking.organization_id as string;
  const effectiveTitle = (title ?? booking.client ?? booking.booking_number ?? 'Bokning') as string;
  const deliveryAddress =
    [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null;

  const failures: string[] = [];
  let successCount = 0;

  // ── Migrate stale rows ────────────────────────────────────────────────
  // Pre-fetch ALL existing rows for (booking, event_type) so we can
  // re-purpose a row whose source_date is no longer in the desired list
  // (typical case: user changed rigdaydate 06-04 → 06-03 — old row at
  // 06-04 must MOVE to 06-03, not coexist as a duplicate that the
  // import-bookings reconciler will later delete as stale).
  const desiredDateSet = new Set(specs.map((s) => s.date));
  const { data: allExistingRows } = await supabase
    .from('calendar_events')
    .select('id, source_date, resource_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId)
    .eq('event_type', eventType);

  const orphanRows = (allExistingRows ?? []).filter(
    (row: any) => row?.source_date && !desiredDateSet.has(row.source_date),
  );

  for (const spec of specs) {
    try {
      let existingRow = await findExistingDayRow(bookingId, orgId, eventType, spec.date);

      // No row on the new date — try to repurpose an orphan (preserves
      // resource_id = team stickiness).
      if (!existingRow && orphanRows.length > 0) {
        const orphan = orphanRows.shift()!;
        const { error: moveErr } = await supabase
          .from('calendar_events')
          .update({ source_date: spec.date })
          .eq('id', orphan.id);
        if (moveErr) throw moveErr;
        existingRow = { id: orphan.id, resource_id: orphan.resource_id };
      }

      if (existingRow) {
        // Befintlig dag → bara metadata + tider, ALDRIG resource_id
        const { error: updateErr } = await supabase
          .from('calendar_events')
          .update({
            title: effectiveTitle,
            start_time: spec.startISO,
            end_time: spec.endISO,
            booking_number: booking.booking_number,
            delivery_address: deliveryAddress,
          })
          .eq('id', existingRow.id);
        if (updateErr) throw updateErr;
      } else {
        // Ny dag → använd sticky team, fall tillbaka på fallbackResourceId
        const stickyTeam = await getStickyTeamForBooking(bookingId, orgId);
        const largeProjectStickyTeam =
          !stickyTeam && largeProjectId
            ? await getStickyTeamForLargeProject(largeProjectId, orgId, eventType, spec.date)
            : null;
        const targetResourceId = stickyTeam ?? largeProjectStickyTeam ?? fallbackResourceId ?? null;

        if (targetResourceId) {
          const { error: insertError } = await supabase.from('calendar_events').insert({
            title: effectiveTitle,
            start_time: spec.startISO,
            end_time: spec.endISO,
            resource_id: targetResourceId,
            booking_id: bookingId,
            event_type: eventType,
            organization_id: orgId,
            booking_number: booking.booking_number,
            delivery_address: deliveryAddress,
            source_date: spec.date,
          });
          if (insertError) throw insertError;
        } else {
          // Inget team kunde härledas — flagga som fel så UI kan visa
          // "datum bytt men kalender ej uppdaterad".
          console.warn(
            '[savePhaseDays] no sticky/fallback resourceId — skipping calendar_events insert for',
            spec.date,
          );
          failures.push(`${spec.date}: inget team kunde härledas — kalenderraden skapades inte`);
        }
      }

      // Endast första datumet → spegla till bokningens primära fält
      if (spec.isFirst) {
        const fields = PHASE_BOOKING_FIELDS[eventType];
        const { error: bkErr } = await supabase
          .from('bookings')
          .update({
            [fields.date]: spec.date,
            [fields.start]: spec.startISO,
            [fields.end]: spec.endISO,
          })
          .eq('id', bookingId);
        if (bkErr) throw bkErr;
      }

      // Recompute BSA för dagen så personalen speglas från det valda teamet
      try {
        await supabase.rpc('recompute_booking_staff_for_day' as any, {
          p_booking_id: bookingId,
          p_date: spec.date,
        });
      } catch (rpcErr) {
        console.warn('[savePhaseDays] BSA recompute failed (non-fatal)', rpcErr);
      }

      successCount += 1;
    } catch (perDayErr: any) {
      const msg = perDayErr?.message || perDayErr?.hint || String(perDayErr);
      failures.push(`${spec.date}: ${msg}`);
    }
  }

  return { successCount, failures, totalDays: specs.length };
}
