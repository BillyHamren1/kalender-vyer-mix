/**
 * STEG 4J — Calendar reconcile ska vara VERKLIGT fail-closed.
 *
 * Ett DB-/RPC-fel i planning guard, existing events, large project-resolution,
 * BSA eller team-placement får ALDRIG returnera ok:true. Legitima skips
 * (needs_planning, ny obunden bokning) ska däremot fortsätta vara ok:true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf-8',
);

/** Plockar ut hela reconcileCalendarEvents-funktionen. */
const reconcileBody = (() => {
  const start = SRC.indexOf('async function reconcileCalendarEvents(');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n * Smart team assignment', start);
  return SRC.slice(start, end > start ? end : start + 40000);
})();

const teamAssignBody = (() => {
  const start = SRC.indexOf('const assignTeamAndTime = async (');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('const getProductsSignature', start);
  return SRC.slice(start, end);
})();

describe('STEG 4J — planning guard reads är fail-closed', () => {
  const cases: Array<[string, string]> = [
    ['project planning_status', 'calendar_project_guard_read_failed'],
    ['parent booking', 'calendar_parent_booking_read_failed'],
    ['large_project planning_status', 'calendar_large_project_guard_read_failed'],
    ['calendar_events count', 'calendar_events_count_read_failed'],
  ];

  for (const [label, code] of cases) {
    it(`${label} read error → ok:false med ${code}`, () => {
      expect(reconcileBody).toContain(`ok: false, error: \`${code}`);
    });
  }

  it('unexpected exception i planning guard → ok:false', () => {
    const idx = reconcileBody.indexOf('FAIL-CLOSED planning_status guard threw');
    expect(idx).toBeGreaterThan(-1);
    const after = reconcileBody.slice(idx, idx + 300);
    expect(after).toContain('ok: false');
    expect(after).not.toContain('return { ok: true }');
  });

  it('legitim needs_planning är fortfarande safe skip (ok:true)', () => {
    for (const marker of [
      'SKIP booking ${bookingData.id}: linked project is needs_planning',
      'is needs_planning`);',
    ]) {
      const idx = reconcileBody.indexOf(marker);
      expect(idx, marker).toBeGreaterThan(-1);
      expect(reconcileBody.slice(idx, idx + 160)).toContain('return { ok: true }');
    }
  });

  it('legitim ny bokning utan projekt/LP och utan events är safe skip (ok:true)', () => {
    const idx = reconcileBody.indexOf('awaiting manual planning');
    expect(idx).toBeGreaterThan(-1);
    expect(reconcileBody.slice(idx, idx + 160)).toContain('return { ok: true }');
  });
});

describe('STEG 4J — existing calendar events read', () => {
  it('läses med error-destrukturering', () => {
    expect(reconcileBody).toContain('const { data: existingEvents, error: existingEventsError }');
  });

  it('läsfel → ok:false innan några mutationer', () => {
    expect(reconcileBody).toContain('calendar_existing_events_read_failed');
    const readIdx = reconcileBody.indexOf('existingEventsError');
    const firstInsert = reconcileBody.indexOf(".from('calendar_events')\n        .insert(");
    const failIdx = reconcileBody.indexOf('calendar_existing_events_read_failed');
    expect(failIdx).toBeGreaterThan(readIdx);
    if (firstInsert > -1) expect(failIdx).toBeLessThan(firstInsert);
  });

  it('inga oskyddade reads utan .error kvar i reconcile-funktionen (canonical)', () => {
    const unguarded = reconcileBody
      .split('\n')
      .filter((l) => /const \{ data: \w+ \} = await supabase/.test(l));
    expect(unguarded, `Oskyddade reads:\n${unguarded.join('\n')}`).toEqual([]);
  });
});

describe('STEG 4J — large project resolution', () => {
  it('DB-fel i LP-resolution → ok:false', () => {
    const idx = reconcileBody.indexOf('FAIL-CLOSED large project resolution failed');
    expect(idx).toBeGreaterThan(-1);
    const after = reconcileBody.slice(idx, idx + 300);
    expect(after).toContain('calendar_large_project_resolution_failed');
    expect(after).not.toContain('return { ok: true }');
  });
});

describe('STEG 4J — post-reconcile audit read', () => {
  it('är explicit klassad som BEST-EFFORT observability', () => {
    expect(reconcileBody).toContain('BEST-EFFORT');
    expect(reconcileBody).toContain('const { data: postReconcileEvents, error: postReconcileError }');
  });

  it('läsfel ger inte falsk mismatch och påverkar inte canonical result', () => {
    expect(reconcileBody).toContain('const hasMismatch = !postReconcileError &&');
    expect(reconcileBody).toContain('best_effort_audit_read_failed');
  });
});

describe('STEG 4J — BSA är canonical', () => {
  it('existingBsaDates läses tenant-scopat och med .error', () => {
    expect(reconcileBody).toContain('const { data: existingBsaDates, error: existingBsaError }');
    const idx = reconcileBody.indexOf('existingBsaDates');
    const block = reconcileBody.slice(idx, idx + 400);
    expect(block).toContain("eq('organization_id', calendarOrgId)");
    expect(block).toContain("eq('booking_id', bookingData.id)");
    expect(block).toContain('bsa_existing_dates_read_failed');
  });

  it('RPC-fel döljs inte som lyckad recompute', () => {
    const idx = reconcileBody.indexOf('recompute_booking_staff_for_day_v2');
    const block = reconcileBody.slice(idx, idx + 1600);
    expect(block).toContain('bsa_recompute_rpc_failed');
    expect(block).toContain('bsa_recompute_rejected');
    expect(block).not.toContain('console.warn(`[BSA Recompute] RPC error');
    expect(reconcileBody).toContain('if (bsaError) {');
  });
});

describe('STEG 4J — team availability / placement', () => {
  it('availability-read har .error och fail-closar', () => {
    expect(teamAssignBody).toContain('error: availabilityError');
    expect(teamAssignBody).toContain('team_availability_read_failed');
  });

  it('stickiness-fel fail-closar istället för tyst round-robin', () => {
    expect(teamAssignBody).toContain('team_stickiness_read_failed');
    expect(teamAssignBody).not.toContain('falling back to round-robin');
  });

  it('yttre catch returnerar fel istället för tyst fallback', () => {
    expect(teamAssignBody).toContain('team_assignment_failed');
  });

  it('call-site blockerar insert vid placement.error och gör reconcile partial', () => {
    const idx = reconcileBody.indexOf('if (placement.error)');
    expect(idx).toBeGreaterThan(-1);
    const block = reconcileBody.slice(idx, idx + 400);
    expect(block).toContain('calendar_placement_failed');
    expect(block).toContain('continue;');
  });
});

describe('STEG 4J — error propagation till caller', () => {
  it('huvudvägen pushar res.error till results.errors och räknar failed', () => {
    const idx = SRC.indexOf('const res = await reconcileCalendarEvents(');
    const block = SRC.slice(idx, idx + 500);
    expect(block).toContain('if (!res.ok)');
    expect(block).toContain('results.failed++');
    expect(block).toContain('results.errors.push');
  });

  it('localOnly-vägen returnerar failed outcome istället för att ignorera resultatet', () => {
    const idx = SRC.indexOf('[LocalOnly] Skipping external API');
    const block = SRC.slice(idx, idx + 3000);
    expect(block).toContain('const localRes = await reconcileCalendarEvents(');
    expect(block).toContain('if (!localRes.ok)');
    expect(block).toContain("outcome: 'failed'");
    expect(block).not.toMatch(/^\s*await reconcileCalendarEvents\(/m);
  });

  it('failed/partial är inte success-outcome → ingen completion/cursor-förflyttning', () => {
    const contract = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/singleBookingResult.ts'),
      'utf-8',
    );
    expect(contract).toContain("SUCCESS_OUTCOMES: readonly SingleBookingOutcome[] = ['applied', 'already_current']");
  });
});
