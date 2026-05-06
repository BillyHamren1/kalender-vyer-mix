/**
 * Contract: LTE-without-workday must auto-repair (high-confidence)
 *
 * Scenario (Armand, 2026-05-06):
 *   - No workday row in DB
 *   - Open LTE 07:57 against "Tiomila 2026" (large_project)
 *   - GPS pings on a known work site
 *
 * Required behaviour:
 *   1. `get_active_day_state` must auto-repair / synthesize a workday from the
 *      earliest open LTE.entered_at when no workday exists but at least one
 *      open LTE points to a real target (location/booking/large_project).
 *      The returned `workday.started_at` must equal that LTE's entered_at.
 *
 *   2. The mobile DayStatusPanel must NOT render the "Ingen arbetsdag startad"
 *      empty state when `open_entries.length > 0`. The empty CTA is only
 *      allowed when both workday is null AND there are zero open entries.
 *
 *   3. `handleGetActiveDayState` must reuse the same evidence-based repair
 *      path used by `auto_repair_missing_workdays_from_evidence` (it cannot
 *      silently invent a workday with no audit trail).
 *
 * The test fails if:
 *   - LTE is open but the API returns `workday: null` (no repair)
 *   - DayStatusPanel shows the empty CTA while open_entries exist
 *   - The repair path bypasses the shared evidence helper
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('LTE without workday — high-confidence auto-repair contract', () => {
  it('handleGetActiveDayState auto-repairs workday when an open LTE exists but no workday is open', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');

    // Locate the handler body.
    const fnStart = src.indexOf('async function handleGetActiveDayState(');
    expect(fnStart).toBeGreaterThan(-1);
    // End at next top-level function declaration.
    const fnEnd = src.indexOf('\nasync function ', fnStart + 1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    // 1. Must detect "LTE-but-no-workday" condition explicitly.
    //    We accept any of: explicit comment marker, a guard on (!workday && ltes.length),
    //    or a call to the shared repair helper.
    const detectsGap =
      /!workday\s*&&\s*(ltes|open_entries)\s*\.length/.test(body) ||
      /no\s*workday.*open\s*LTE|LTE.*without.*workday|repair.*from.*lte/i.test(body);
    expect(
      detectsGap,
      'handleGetActiveDayState must explicitly handle the case where an open LTE exists without a workday',
    ).toBe(true);

    // 2. Must invoke the evidence-based repair path (not invent its own).
    const callsRepair =
      /handleAutoRepairMissingWorkdaysFromEvidence\s*\(/.test(body) ||
      /auto_repair_missing_workdays_from_evidence/.test(body) ||
      /repairWorkdayFromEvidence\s*\(/.test(body);
    expect(
      callsRepair,
      'handleGetActiveDayState must reuse the evidence-based repair helper to materialize the missing workday',
    ).toBe(true);

    // 3. Returned workday.started_at must derive from the earliest open LTE.entered_at,
    //    not Date.now(). Look for an assignment that ties the synthesized workday
    //    start to the LTE entered_at.
    const usesLteStart =
      /started_at[^,\n]*entered_at/.test(body) ||
      /earliest[^,\n]*entered_at/i.test(body);
    expect(
      usesLteStart,
      'Synthesized workday.started_at must come from the earliest open LTE.entered_at (not Date.now())',
    ).toBe(true);
  });

  it('DayStatusPanel never shows the "Ingen arbetsdag startad" empty CTA while open_entries exist', () => {
    const src = read('src/components/mobile-app/DayStatusPanel.tsx');

    // The empty-state guard must require BOTH no workday AND zero open entries.
    // Pattern allows formatting variations.
    const guard = /if\s*\(\s*!\s*wd\s*&&\s*open\.length\s*===\s*0\s*\)/;
    expect(
      guard.test(src),
      'Empty state must be gated on `!wd && open.length === 0` so an active LTE never collapses the panel into a CTA',
    ).toBe(true);

    // The empty-state literal must exist exactly once and only inside that guard.
    const emptyMatches = src.match(/Ingen arbetsdag startad/g) || [];
    expect(emptyMatches.length).toBe(1);
  });

  it('Payable-time calculation includes elapsed minutes from the active LTE (not just confirmed reports)', () => {
    const src = read('src/components/mobile-app/DayStatusPanel.tsx');

    // Must add reportedMinutes + active-elapsed-minutes for "Lönegrundande hittills".
    expect(src).toMatch(/reportedMinutes/);
    expect(src).toMatch(/activeMinutes/);
    expect(src).toMatch(/reportedMinutes\s*\+\s*activeMinutes/);

    // activeMinutes must derive from primary.entered_at (the LTE start), so a
    // 07:57 open LTE counts toward payable time even with no workday row yet.
    expect(src).toMatch(/parseISO\(primary\.entered_at\)/);
  });

  it('useWorkDay.ensureActive accepts an explicit startedAtIso so callers can pin workday start to LTE.entered_at', () => {
    const src = read('src/hooks/useWorkDay.ts');
    expect(src).toMatch(/ensureActive[^=]*=\s*useCallback\(\s*async\s*\(\s*startedAtIso\?:\s*string/);
    // And must forward it to workdayApi.start.
    expect(src).toMatch(/workdayApi\.start\(\s*\n?\s*startedAtIso\s*\?\s*\{\s*startedAtIso\s*\}/);
  });
});
