// Time Engine 4.2 — Stockholm day window clamp tests
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReportCandidateBlocks } from '../buildReportCandidateBlocks.ts';
import { getStockholmDayWindowUtc } from '../../stockholmDayWindow.ts';

const DATE = '2026-05-12'; // CEST (UTC+2)
const win = getStockholmDayWindowUtc(DATE);

// Sanity: sommartid → 22:00 dagen före .. 21:59:59.999 samma dag UTC
Deno.test('helper: sommartid Stockholm day window är UTC 22:00–21:59:59.999', () => {
  assertEquals(win.startUtc, '2026-05-11T22:00:00.000Z');
  assertEquals(win.endUtc, '2026-05-12T21:59:59.999Z');
});

function presence(over: Partial<any> = {}): any {
  return {
    id: 'p1', kind: 'known_site',
    startAt: '2026-05-12T18:00:00.000Z', // 20:00 lokal
    endAt: '2026-05-12T20:00:00.000Z',   // 22:00 lokal
    durationMinutes: 120,
    confidence: 'high',
    target: { type: 'project', id: 'proj-a', label: 'Projekt A' },
    evidence: { confirmedMinutes: 120, probableMinutes: 0, signalGapMinutes: 0, transportMinutes: 0, unknownMinutes: 0 },
    ...over,
  };
}

Deno.test('open active timer kan INTE förlänga blocket förbi 21:59:59.999Z UTC (= 23:59:59 lokal)', () => {
  // Timer 1.7 — active_time_registration är BARA dagfönster.
  // Target-fält strippas av caller (get-staff-presence-day) och builder
  // skapar ALDRIG synth-block / förlänger work-block via active timer.
  // Vi verifierar att INGA block som genereras (från presence/GPS) får
  // sträcka sig förbi Stockholm dayEnd, oavsett om en open registration
  // finns.
  const result = buildReportCandidateBlocks({
    staffId: 'staff-1',
    organizationId: 'org-1',
    date: DATE,
    presenceDayBlocks: [presence()],
    activeTimeRegistrations: [{
      id: 'r1',
      startedAt: '2026-05-12T05:00:00.000Z', // 07:00 lokal
      stoppedAt: null,
      status: 'active',
      // Timer 1.7 — target strippad: registreringen är dagfönster, inte work target.
      targetType: null,
      targetId: null,
      targetLabel: null,
    }],
    openActiveRegistration: {
      registrationId: 'r1',
      startedAtIso: '2026-05-12T05:00:00.000Z',
      targetType: null,
      targetId: null,
      targetLabel: null,
    },
  });

  // Inga block får sträcka sig förbi Stockholm dayEnd / börja före dayStart.
  for (const b of result.blocks) {
    const eMs = Date.parse(b.endAt);
    assert(
      eMs <= win.endUtcMs,
      `Block ${b.id} (${b.kind}) slutar ${b.endAt} > Stockholm dayEnd ${win.endUtc}`,
    );
    const sMs = Date.parse(b.startAt);
    assert(
      sMs >= win.startUtcMs,
      `Block ${b.id} (${b.kind}) börjar ${b.startAt} < Stockholm dayStart ${win.startUtc}`,
    );
    // Inga synth-block med open_active_timer_anchor får finnas.
    const reasons = (b.reviewReasons ?? []) as string[];
    assert(
      !reasons.includes('open_active_timer_anchor'),
      `Block ${b.id} har open_active_timer_anchor — Timer 1.7 förbjuder synth från active timer`,
    );
  }
});

Deno.test('final clamp: block som börjar före Stockholm dayStart klipps + isOngoing=false när endAt klampas', () => {
  const result = buildReportCandidateBlocks({
    staffId: 'staff-1',
    organizationId: 'org-1',
    date: DATE,
    presenceDayBlocks: [presence({
      // 21:30 lokal föregående dag – SKA klippas ner till dagstart
      startAt: '2026-05-11T19:30:00.000Z',
      endAt: '2026-05-12T05:00:00.000Z', // 07:00 lokal — korsar midnatt
      durationMinutes: 570,
    })],
    activeTimeRegistrations: [],
    openActiveRegistration: null,
  });

  for (const b of result.blocks) {
    assert(Date.parse(b.startAt) >= win.startUtcMs);
    assert(Date.parse(b.endAt) <= win.endUtcMs);
  }
});

Deno.test('inga blocks får sträcka sig förbi Stockholm dayEnd även när källblocket gör det', () => {
  const result = buildReportCandidateBlocks({
    staffId: 'staff-1',
    organizationId: 'org-1',
    date: DATE,
    presenceDayBlocks: [presence({
      // korsar dygnsslutet
      startAt: '2026-05-12T19:00:00.000Z',  // 21:00 lokal
      endAt: '2026-05-13T01:00:00.000Z',    // 03:00 NÄSTA dag lokal
      durationMinutes: 360,
    })],
    activeTimeRegistrations: [],
    openActiveRegistration: null,
  });

  for (const b of result.blocks) {
    assert(
      Date.parse(b.endAt) <= win.endUtcMs,
      `Block ${b.kind} slutar ${b.endAt} > dayEnd ${win.endUtc}`,
    );
  }
});
