/**
 * Contract test: Calendar Team Model
 *
 * Locks in the architectural rule that:
 *   booking_staff_assignments (BSA) =
 *     deterministic mirror of (staff_assignments × calendar_events.resource_id)
 *
 * Staff belong to TEAMS (via staff_assignments). Bookings move between TEAMS
 * (via calendar_events.resource_id). BSA is recomputed via the SQL RPC
 * `recompute_booking_staff_for_day(booking_id, date)` — never mutated by hand
 * from move-flows.
 *
 * If you find yourself wanting to:
 *   - copy staff between teams when a booking moves
 *   - call handle_booking_move()
 *   - write to BSA from a drag/drop hook
 * STOP and read mem://features/planning/calendar-team-model-v1.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf-8');
}

describe('Calendar Team Model — contract', () => {
  it('useEventDragDrop calls recompute_booking_staff_for_day for source and target dates', () => {
    const src = read('src/hooks/useEventDragDrop.ts');
    const matches = src.match(/recompute_booking_staff_for_day/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('useEventOperations calls recompute_booking_staff_for_day on move', () => {
    const src = read('src/hooks/useEventOperations.tsx');
    expect(src).toMatch(/recompute_booking_staff_for_day/);
  });

  it('MoveEventDateDialog calls recompute_booking_staff_for_day', () => {
    const src = read('src/components/Calendar/MoveEventDateDialog.tsx');
    expect(src).toMatch(/recompute_booking_staff_for_day/);
  });

  it('import-bookings reconciler invokes recompute_booking_staff_for_day after BSA changes', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    expect(src).toMatch(/recompute_booking_staff_for_day/);
  });

  it('eventService.updateCalendarEvent handles 23505 unique-violation collisions', () => {
    const src = read('src/services/eventService.ts');
    expect(src).toMatch(/23505/);
  });

  it('handle_booking_move RPC is NOT called from move-flows (deprecated)', () => {
    const movers = [
      'src/hooks/useEventDragDrop.ts',
      'src/hooks/useEventOperations.tsx',
      'src/components/Calendar/MoveEventDateDialog.tsx',
    ];
    for (const f of movers) {
      const src = read(f);
      expect(src, `${f} must not call deprecated handle_booking_move`).not.toMatch(
        /handle_booking_move/,
      );
    }
  });
});
