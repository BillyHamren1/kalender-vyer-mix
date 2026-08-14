/**
 * STEG 4N — Legacy BSA-RPC får inte anropas från någon aktiv runtime-väg.
 *
 * Legacy: recompute_booking_staff_for_day(p_booking_id, p_date) — saknar
 * organization_id och är därför cross-tenant-osäker.
 * Aktiv väg: recompute_booking_staff_for_day_v2(p_organization_id, ...)
 * via wrappern src/lib/calendar/recomputeBookingStaff.ts (fail-closed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const repoRoot = process.cwd();
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8');

const ACTIVE_CALLERS = [
  'src/hooks/useEventDragDrop.ts',
  'src/hooks/useMoveEventToTeam.ts',
  'src/hooks/useEventOperations.tsx',
  'src/components/Calendar/AddRiggDayDialog.tsx',
  'src/components/Calendar/MoveDayPopover.tsx',
  'src/components/Calendar/MoveEventDateDialog.tsx',
  'src/services/bookingPhaseDaysService.ts',
  'src/lib/calendar/phaseDaysWriter.ts',
];

const MIGRATIONS = readdirSync(join(repoRoot, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const LATEST_4N = MIGRATIONS.map((f) => read(join('supabase/migrations', f)))
  .filter((sql) => sql.includes('STEG 4N'))
  .pop() ?? '';

// ---- Mockad Supabase-klient -------------------------------------------------
const rpcCalls: Array<{ fn: string; args: any }> = [];
let orgIdResult: string | null = 'org-a';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

vi.mock('@/hooks/useOrganizationId', () => ({
  getOrganizationId: async () => orgIdResult,
}));

import { recomputeBookingStaffForDay } from '@/lib/calendar/recomputeBookingStaff';

beforeEach(() => {
  rpcCalls.length = 0;
  orgIdResult = 'org-a';
});

describe('STEG 4N — inga aktiva legacy-callers', () => {
  it('ingen aktiv caller anropar legacy-RPC direkt', () => {
    for (const f of ACTIVE_CALLERS) {
      const src = read(f);
      expect(src, `${f} får inte anropa legacy-RPC`).not.toMatch(
        /rpc\(\s*['"]recompute_booking_staff_for_day['"]/,
      );
      expect(src, `${f} ska gå via wrappern`).toMatch(/recomputeBookingStaffForDay\(/);
    }
  });

  it('import-bookings använder bara V2', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    expect(src).toContain("recompute_booking_staff_for_day_v2");
    expect(src).not.toMatch(/rpc\(\s*['"]recompute_booking_staff_for_day['"]/);
  });

  it('wrappern innehåller ingen legacy-fallback', () => {
    const src = read('src/lib/calendar/recomputeBookingStaff.ts');
    expect(src).not.toMatch(/rpc\(\s*['"]recompute_booking_staff_for_day['"]/);
  });
});

describe('STEG 4N — wrapper beteende', () => {
  it('frontend caller A (phaseDaysWriter-stil, explicit org) använder V2 + org', async () => {
    const res = await recomputeBookingStaffForDay('B-1', '2026-08-14', {
      organizationId: 'org-explicit',
    });
    expect(res.ok).toBe(true);
    expect(rpcCalls).toEqual([
      {
        fn: 'recompute_booking_staff_for_day_v2',
        args: { p_organization_id: 'org-explicit', p_booking_id: 'B-1', p_date: '2026-08-14' },
      },
    ]);
  });

  it('frontend caller B (kalender-flytt, härledd org) använder V2 + org', async () => {
    orgIdResult = 'org-a';
    const res = await recomputeBookingStaffForDay('B-2', '2026-08-15');
    expect(res.ok).toBe(true);
    expect(rpcCalls[0].fn).toBe('recompute_booking_staff_for_day_v2');
    expect(rpcCalls[0].args.p_organization_id).toBe('org-a');
  });

  it('saknad organization → ingen RPC alls (fail-closed)', async () => {
    orgIdResult = null;
    const res = await recomputeBookingStaffForDay('B-3', '2026-08-16');
    expect(res).toEqual({ ok: false, reason: 'missing_organization' });
    expect(rpcCalls).toHaveLength(0);
  });

  it('saknade argument → ingen RPC', async () => {
    const res = await recomputeBookingStaffForDay('', '2026-08-16');
    expect(res).toEqual({ ok: false, reason: 'missing_args' });
    expect(rpcCalls).toHaveLength(0);
  });

  it('Org A flytt skickar aldrig Org B:s organization_id', async () => {
    await recomputeBookingStaffForDay('SAME-BOOKING-ID', '2026-08-14', { organizationId: 'org-a' });
    await recomputeBookingStaffForDay('SAME-BOOKING-ID', '2026-08-14', { organizationId: 'org-b' });
    expect(rpcCalls.map((c) => c.args.p_organization_id)).toEqual(['org-a', 'org-b']);
    expect(new Set(rpcCalls.map((c) => c.fn))).toEqual(
      new Set(['recompute_booking_staff_for_day_v2']),
    );
  });
});

describe('STEG 4N — RPC-permissions', () => {
  it('migrationen återkallar EXECUTE på legacy-RPC', () => {
    expect(LATEST_4N).toMatch(
      /REVOKE ALL ON FUNCTION public\.recompute_booking_staff_for_day\(text, date\) FROM PUBLIC/,
    );
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(LATEST_4N).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.recompute_booking_staff_for_day\\(text, date\\) FROM ${role}`),
      );
    }
  });

  it('migrationen droppar inte legacy-funktionen', () => {
    expect(LATEST_4N).not.toMatch(/DROP FUNCTION[^;]*recompute_booking_staff_for_day\s*\(/);
  });

  it('migrationen gör ingen datamutation', () => {
    expect(LATEST_4N).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE)\b/i);
  });

  it('V2 är körbar för authenticated + service_role men inte anon', () => {
    expect(LATEST_4N).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.recompute_booking_staff_for_day_v2\(uuid, text, date\) TO authenticated/,
    );
    expect(LATEST_4N).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.recompute_booking_staff_for_day_v2\(uuid, text, date\) TO service_role/,
    );
    expect(LATEST_4N).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.recompute_booking_staff_for_day_v2\(uuid, text, date\) TO anon/,
    );
  });
});
