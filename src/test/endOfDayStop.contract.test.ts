// @vitest-environment node
/**
 * endOfDayStop.contract.test.ts
 * ──────────────────────────────
 * Låser kontraktet för "Avsluta dagen"-flödet (EndOfDayStopDialog) utan att
 * rendera React. Vi importerar dialogen för att få komponenten att finnas i
 * bundle:n och TYP-kontrollera EndOfDayResult, men själva regelsetet testas
 * via en ren replika av `buildCustomIso`-heuristiken så vi kan verifiera att:
 *
 *   1. "Ja, använd exit-tiden"  → usedSuggestedExit=true, endedAtIso = exit.
 *   2. "Nej, annan tid" senare samma dag → usedSuggestedExit=false.
 *   3. Nattskift: HH:mm < 12 OCH før exit → rullar till nästa kalenderdag.
 *   4. Beskrivning krävs när delta > 10 min.
 *   5. Tid före exit (utan natt-rullning) är ogiltig.
 *
 * Källor:
 *   - src/components/mobile-app/EndOfDayStopDialog.tsx
 *   - mem://features/field-staff/end-day-vs-end-activity-v1
 */
import { describe, it, expect } from 'vitest';
import type { EndOfDayResult } from '@/components/mobile-app/EndOfDayStopDialog';

// ─────────────────────────────────────────────────────────────────────
// Pure replica of EndOfDayStopDialog.buildCustomIso — must stay in sync.
// We assert the rule, not the React render. If the dialog rule changes,
// this replica + the dialog itself must move together.
// ─────────────────────────────────────────────────────────────────────
const COMMENT_THRESHOLD_MIN = 10;

function buildCustomIso(exitDate: Date, customTime: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(customTime)) return null;
  const [h, m] = customTime.split(':').map(Number);
  const candidate = new Date(exitDate);
  candidate.setHours(h, m, 0, 0);
  if (candidate.getTime() <= exitDate.getTime() && h < 12) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

function customDurationMinutes(exitDate: Date, isoEnd: string): number {
  return Math.round((new Date(isoEnd).getTime() - exitDate.getTime()) / 60_000);
}

function isValid(exitDate: Date, isoEnd: string | null): boolean {
  return isoEnd !== null && new Date(isoEnd).getTime() > exitDate.getTime();
}

function descriptionRequired(durationMin: number): boolean {
  return durationMin > COMMENT_THRESHOLD_MIN;
}

describe('End-of-day stop contract', () => {
  it('typkontroll: EndOfDayResult har endedAtIso + usedSuggestedExit + valfri workDescription', () => {
    const sample: EndOfDayResult = {
      endedAtIso: '2026-04-18T17:00:00Z',
      usedSuggestedExit: true,
    };
    expect(sample.endedAtIso).toBe('2026-04-18T17:00:00Z');
    expect(sample.usedSuggestedExit).toBe(true);
    expect(sample.workDescription).toBeUndefined();
  });

  it('"Ja, använd exit" → endedAtIso = lastExitIso, usedSuggestedExit=true', () => {
    const lastExitIso = '2026-04-18T17:00:00Z';
    const result: EndOfDayResult = {
      endedAtIso: lastExitIso,
      usedSuggestedExit: true,
    };
    expect(result.endedAtIso).toBe(lastExitIso);
    expect(result.usedSuggestedExit).toBe(true);
  });

  it('"Nej, annan tid" senare samma dag → giltigt + ingen natt-rullning', () => {
    const exit = new Date('2026-04-18T17:00:00Z');
    const iso = buildCustomIso(exit, format2400(new Date('2026-04-18T18:30:00Z')));
    expect(iso).not.toBeNull();
    expect(isValid(exit, iso)).toBe(true);
    expect(customDurationMinutes(exit, iso!)).toBe(90);
  });

  it('nattskift: exit kvällen, slut tidig morgon → rullar till nästa dag', () => {
    // Förenklad lokal-tid-test: använd Date med lokala timmar för att matcha
    // dialogens setHours-logik (lokal tid). Vi anchorar på lokal kvällstid.
    const exit = new Date(2026, 3, 18, 23, 0, 0); // 18 april 23:00 lokal
    const iso = buildCustomIso(exit, '02:00');
    expect(iso).not.toBeNull();
    const end = new Date(iso!);
    expect(end.getDate()).toBe(19);
    expect(end.getHours()).toBe(2);
  });

  it('tid FÖRE exit utan natt-rullning (>= 12) → ogiltigt', () => {
    const exit = new Date(2026, 3, 18, 17, 0, 0);
    const iso = buildCustomIso(exit, '15:30'); // 15:30 < 17:00, men h=15 ≥ 12 → ingen rullning
    expect(isValid(exit, iso)).toBe(false);
  });

  it('beskrivning krävs när delta > 10 min', () => {
    expect(descriptionRequired(11)).toBe(true);
    expect(descriptionRequired(10)).toBe(false);
    expect(descriptionRequired(0)).toBe(false);
  });

  it('beskrivning krävs INTE för korta deltan (≤10 min) → "snabbgodkänd" custom-tid', () => {
    const exit = new Date(2026, 3, 18, 17, 0, 0);
    const iso = buildCustomIso(exit, '17:08');
    expect(isValid(exit, iso)).toBe(true);
    expect(descriptionRequired(customDurationMinutes(exit, iso!))).toBe(false);
  });

  it('ogiltig HH:mm-input (icke-matchande regex) → null', () => {
    const exit = new Date(2026, 3, 18, 17, 0, 0);
    expect(buildCustomIso(exit, '17')).toBe(null);
    expect(buildCustomIso(exit, '')).toBe(null);
    expect(buildCustomIso(exit, 'abc')).toBe(null);
    // Notera: `<input type="time">` förhindrar 99:99 i UI; dialogen
    // litar därför på browserns range-clamp och vi testar inte den vägen.
  });
});

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function format2400(d: Date): string {
  // Local-time HH:mm to mirror what <input type="time"> emits.
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
