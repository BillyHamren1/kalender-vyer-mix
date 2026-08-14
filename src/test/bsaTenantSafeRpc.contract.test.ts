/**
 * STEG 4I — Tenant-säker BSA-RPC.
 *
 * recompute_booking_staff_for_day (legacy) saknar organization_id och kan
 * korsa tenants när samma booking_id finns i två organisationer.
 * Normal Booking → Planning-sync får ENDAST använda V2-varianten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migDir = join(root, 'supabase/migrations');
const MIGRATION = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migDir, f), 'utf-8'))
  .filter((sql) => sql.includes('recompute_booking_staff_for_day_v2'))
  .join('\n\n');

const IMPORT = readFileSync(join(root, 'supabase/functions/import-bookings/index.ts'), 'utf-8');

/** Kroppen för V2-funktionen */
const V2 = (() => {
  const i = MIGRATION.indexOf('FUNCTION public.recompute_booking_staff_for_day_v2');
  const j = MIGRATION.indexOf('$function$;', i);
  return MIGRATION.slice(i, j);
})();

describe('STEG 4I — recompute_booking_staff_for_day_v2', () => {
  it('finns och tar organization_id som första parameter', () => {
    expect(V2).toContain('p_organization_id uuid');
    expect(V2).toContain('p_booking_id text');
    expect(V2).toContain('p_date date');
  });

  it('E — fail-closed när bokningen inte tillhör organisationen (0 mutations)', () => {
    expect(V2).toContain("b.organization_id = p_organization_id");
    expect(V2).toContain('booking_not_in_organization');
    const guardIdx = V2.indexOf('booking_not_in_organization');
    expect(V2.indexOf('DELETE FROM public.booking_staff_assignments')).toBeGreaterThan(guardIdx);
    expect(V2.indexOf('INSERT INTO public.booking_staff_assignments')).toBeGreaterThan(guardIdx);
  });

  it('D — saknade argument ger 0 mutations', () => {
    expect(V2).toContain('missing_arguments');
  });

  it('B — calendar_events-read är tenant-scopad på org + booking + datum', () => {
    const block = V2.slice(V2.indexOf('FROM public.calendar_events'));
    expect(block).toContain('organization_id = p_organization_id');
    expect(block).toContain('booking_id      = p_booking_id');
    expect(block).toContain('source_date     = p_date');
  });

  it('C — DELETE mot BSA innehåller alltid organization_id', () => {
    const del = V2.slice(
      V2.indexOf('DELETE FROM public.booking_staff_assignments'),
      V2.indexOf('RETURNING 1'),
    );
    expect(del).toContain('bsa.organization_id = p_organization_id');
    expect(del).toContain('bsa.booking_id      = p_booking_id');
    expect(del).toContain('bsa.assignment_date = p_date');
  });

  it('F — staff_assignments-läsning är tenant-scopad (både delete-subquery och insert)', () => {
    const matches = V2.match(/FROM public\.staff_assignments sa[\s\S]{0,240}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      expect(m).toContain('sa.organization_id = p_organization_id');
    }
  });

  it('A — INSERT sätter organization_id från parametern, aldrig härledd från annan rad', () => {
    const ins = V2.slice(V2.indexOf('INSERT INTO public.booking_staff_assignments'));
    expect(ins).toContain('p_organization_id');
    expect(V2).not.toContain('INTO v_org');
  });

  it('STEG 4M — ON CONFLICT är tenant-säker (organization_id först)', () => {
    const ins = V2.slice(V2.indexOf('INSERT INTO public.booking_staff_assignments'));
    expect(ins).toContain('ON CONFLICT (organization_id, booking_id, staff_id, assignment_date)');
    // Global (tenant-osäker) conflict target får inte finnas kvar i V2
    expect(ins).not.toMatch(/ON CONFLICT \(booking_id, staff_id, assignment_date\)/);
  });

  it('STEG 4M — tenant-säkert unique index finns och skapas idempotent utan datamutationer', () => {
    const m4m = readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(migDir, f), 'utf-8'))
      .filter((sql) => sql.includes('booking_staff_assignments_org_booking_staff_date_uidx'))
      .join('\n\n');

    expect(m4m).toContain('CREATE UNIQUE INDEX IF NOT EXISTS booking_staff_assignments_org_booking_staff_date_uidx');
    expect(m4m).toContain('(organization_id, booking_id, staff_id, assignment_date)');
    expect(m4m).not.toMatch(/DELETE FROM public\.booking_staff_assignments/i);
    expect(m4m).not.toMatch(/TRUNCATE/i);
  });

  it('STEG 4M — cross-tenant: samma booking/staff/datum i två orgs kollider inte under nya nyckeln', () => {
    // Simulerar unikhetsnyckeln som index-definitionen ger.
    const key = (r: { org: string; booking: string; staff: string; date: string }) =>
      [r.org, r.booking, r.staff, r.date].join('|');

    const orgA = { org: 'ORG_A', booking: '2604-144', staff: 'S1', date: '2026-08-14' };
    const orgB = { org: 'ORG_B', booking: '2604-144', staff: 'S1', date: '2026-08-14' };

    const rows = new Map<string, typeof orgA>();
    rows.set(key(orgA), orgA);
    expect(rows.has(key(orgB))).toBe(false); // ingen konflikt mellan tenants
    rows.set(key(orgB), orgB);
    expect(rows.size).toBe(2);

    // Recompute i ORG_A får aldrig röra ORG_B (delete-filter innehåller organization_id)
    const del = V2.slice(
      V2.indexOf('DELETE FROM public.booking_staff_assignments'),
      V2.indexOf('RETURNING 1'),
    );
    expect(del).toContain('bsa.organization_id = p_organization_id');
  });

  it('behåller SECURITY DEFINER med strikt search_path och begränsade grants', () => {
    expect(V2).toContain('SECURITY DEFINER');
    expect(V2).toContain("SET search_path TO 'public'");
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.recompute_booking_staff_for_day_v2/);
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.recompute_booking_staff_for_day_v2\(uuid, text, date\) TO anon/);
  });

  it('legacy-RPC:n raderas inte utan markeras deprecated', () => {
    expect(MIGRATION).not.toMatch(/DROP FUNCTION[^;]*recompute_booking_staff_for_day\s*\(/);
    expect(MIGRATION).toMatch(/COMMENT ON FUNCTION public\.recompute_booking_staff_for_day\(text, date\)[\s\S]*DEPRECATED/);
  });

  it('G — import-bookings använder endast V2 och skickar org, booking och datum', () => {
    expect(IMPORT).toContain("supabase.rpc('recompute_booking_staff_for_day_v2'");
    expect(IMPORT).not.toMatch(/rpc\('recompute_booking_staff_for_day'/);
    const call = IMPORT.slice(
      IMPORT.indexOf("recompute_booking_staff_for_day_v2"),
      IMPORT.indexOf("recompute_booking_staff_for_day_v2") + 400,
    );
    expect(call).toContain('p_organization_id: calendarOrgId');
    expect(call).toContain('p_booking_id: bookingData.id');
    expect(call).toContain('p_date: d');
  });

  it('BSA-datumread i syncen är org-scopad', () => {
    const idx = IMPORT.indexOf(".from('booking_staff_assignments')");
    const block = IMPORT.slice(idx, idx + 300);
    expect(block).toContain("organization_id");
  });
});
