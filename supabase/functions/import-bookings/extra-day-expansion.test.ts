// Regressionstest för bug: booking-uppdatering återspeglades inte i Planning
// eftersom BSA-expansion återuppstod gamla rig-datum när bokningens rigdaydate
// flyttades. Vi verifierar den nya in-window-expansionslogiken renderad som en
// ren funktion (samma regel som i index.ts reconcileCalendarEvents).
//
// Detta är ett *kontraktstest* — det importerar inte hela edge-funktionen
// (som har många Supabase-beroenden), utan reimplementerar den lilla logiken
// och låser dess beteende. Vid framtida ändring i index.ts måste samma
// förändring speglas här.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type ExistingEvt = { event_type: string; source_date: string | null; start_time?: string | null };

function expandWithinWindow(input: {
  rigDates: string[];
  eventDates: string[];
  rigdownDates: string[];
  bookingDates: { rig?: string | null; event?: string | null; rigdown?: string | null };
  existingEvents: ExistingEvt[];
}): { rigDates: string[]; rigdownDates: string[] } {
  let rigDates = [...input.rigDates];
  let rigdownDates = [...input.rigdownDates];

  const allBookingDates: string[] = [
    ...(input.bookingDates.rig ? [input.bookingDates.rig] : []),
    ...(input.bookingDates.event ? [input.bookingDates.event] : []),
    ...(input.bookingDates.rigdown ? [input.bookingDates.rigdown] : []),
    ...rigDates, ...input.eventDates, ...rigdownDates,
  ].filter(Boolean).sort();
  const windowStart = allBookingDates[0];
  const windowEnd = allBookingDates[allBookingDates.length - 1];
  if (!windowStart || !windowEnd) return { rigDates, rigdownDates };

  const rigSet = new Set<string>(rigDates);
  const evSet = new Set<string>(input.eventDates);
  const downSet = new Set<string>(rigdownDates);
  const evDate = input.bookingDates.event ?? null;

  for (const ev of input.existingEvents) {
    if (ev.event_type !== 'rig' && ev.event_type !== 'rigDown') continue;
    const d = ev.source_date || ev.start_time?.slice(0, 10) || '';
    if (!d) continue;
    if (d < windowStart || d > windowEnd) continue;
    if (rigSet.has(d) || evSet.has(d) || downSet.has(d)) continue;
    if (ev.event_type === 'rigDown' || (evDate && d > evDate)) downSet.add(d);
    else rigSet.add(d);
  }
  return { rigDates: [...rigSet].sort(), rigdownDates: [...downSet].sort() };
}

Deno.test('booking-update: gammal rig-dag UTANFÖR nytt fönster betraktas som stale', () => {
  // Bokning flyttades från rigdaydate 2026-06-03 → 2026-06-04
  const out = expandWithinWindow({
    rigDates: ['2026-06-04'],
    eventDates: ['2026-06-06'],
    rigdownDates: ['2026-06-07'],
    bookingDates: { rig: '2026-06-04', event: '2026-06-06', rigdown: '2026-06-07' },
    existingEvents: [
      { event_type: 'rig', source_date: '2026-06-03' }, // STALE (utanför fönster)
      { event_type: 'rig', source_date: '2026-06-04' },
      { event_type: 'rig', source_date: '2026-06-05' }, // legitim extra inom fönster
      { event_type: 'rigDown', source_date: '2026-06-07' },
    ],
  });
  // 06-03 ska INTE expanderas in → kommer raderas i steg 5
  assertEquals(out.rigDates.includes('2026-06-03'), false);
  // 06-05 ligger inom fönstret → bevaras
  assertEquals(out.rigDates.includes('2026-06-05'), true);
  assertEquals(out.rigDates, ['2026-06-04', '2026-06-05']);
  assertEquals(out.rigdownDates, ['2026-06-07']);
});

Deno.test('booking utan ändring: alla in-window-rader bevaras', () => {
  const out = expandWithinWindow({
    rigDates: ['2026-06-04'],
    eventDates: ['2026-06-06'],
    rigdownDates: ['2026-06-07'],
    bookingDates: { rig: '2026-06-04', event: '2026-06-06', rigdown: '2026-06-07' },
    existingEvents: [
      { event_type: 'rig', source_date: '2026-06-04' },
      { event_type: 'rig', source_date: '2026-06-05' },
      { event_type: 'rigDown', source_date: '2026-06-07' },
    ],
  });
  assertEquals(out.rigDates, ['2026-06-04', '2026-06-05']);
});

Deno.test('endag-bokning: ingen expansion', () => {
  const out = expandWithinWindow({
    rigDates: ['2026-07-01'],
    eventDates: [],
    rigdownDates: ['2026-07-01'],
    bookingDates: { rig: '2026-07-01', rigdown: '2026-07-01' },
    existingEvents: [
      { event_type: 'rig', source_date: '2026-07-01' },
      { event_type: 'rigDown', source_date: '2026-07-01' },
    ],
  });
  assertEquals(out.rigDates, ['2026-07-01']);
  assertEquals(out.rigdownDates, ['2026-07-01']);
});

Deno.test('booking-shrink: gammal rigDown bortom nytt fönster blir stale', () => {
  // rigdowndate flyttades från 2026-06-10 → 2026-06-07
  const out = expandWithinWindow({
    rigDates: ['2026-06-04'],
    eventDates: ['2026-06-06'],
    rigdownDates: ['2026-06-07'],
    bookingDates: { rig: '2026-06-04', event: '2026-06-06', rigdown: '2026-06-07' },
    existingEvents: [
      { event_type: 'rig', source_date: '2026-06-04' },
      { event_type: 'rigDown', source_date: '2026-06-07' },
      { event_type: 'rigDown', source_date: '2026-06-10' }, // STALE
    ],
  });
  assertEquals(out.rigdownDates.includes('2026-06-10'), false);
});
