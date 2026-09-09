/**
 * Statiska säkerhetstester för Planning-redigering av packlistan.
 *
 * Skyddar de absoluta datareglerna:
 *  - aldrig DELETE av packrader
 *  - aldrig skrivning mot bookings / booking_products
 *  - endast status 'planning'
 *  - paketrekursion, touched/allocation-guards
 *  - JWT + organisationskontroll i edge-funktionen
 *  - audit + verifiering i samma transaktion
 *  - WMS respekterar planning_excluded_at
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const migrationSql = (() => {
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .find((sql) => sql.includes('planning_edit_packing_list_item'));
  return file ?? '';
})();

const edgeFn = read('supabase/functions/edit-packing-list/index.ts');
const wms = read('supabase/functions/_shared/wmsPackingList.ts');
const view = read('src/components/packing/DesktopChecklistView.tsx');
const service = read('src/services/desktopPackingService.ts');
const integrity = read('src/lib/packing/packingIntegrity.ts');
const history = read('src/components/packing/PackingHistoryDialog.tsx');

describe('RPC planning_edit_packing_list_item', () => {
  it('finns i en migration', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.planning_edit_packing_list_item');
    expect(migrationSql).toContain('planning_excluded_at');
  });

  it('raderar aldrig rader', () => {
    expect(/\bDELETE\s+FROM\b/i.test(migrationSql)).toBe(false);
    expect(/\bTRUNCATE\b/i.test(migrationSql)).toBe(false);
  });

  it('skriver aldrig mot bookings eller booking_products', () => {
    expect(/UPDATE\s+public\.booking_products/i.test(migrationSql)).toBe(false);
    expect(/INSERT\s+INTO\s+public\.booking_products/i.test(migrationSql)).toBe(false);
    expect(/UPDATE\s+public\.bookings/i.test(migrationSql)).toBe(false);
    expect(/INSERT\s+INTO\s+public\.bookings/i.test(migrationSql)).toBe(false);
    // booking_products får endast läsas för paketrekursionen
    expect(migrationSql).toContain('FROM public.booking_products');
  });

  it('tillåter endast status planning och låser rader', () => {
    expect(migrationSql).toContain("v_status <> 'planning'");
    expect(migrationSql).toContain('packing_not_in_planning');
    expect(migrationSql.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('expanderar paket rekursivt', () => {
    expect(migrationSql).toContain('WITH RECURSIVE tree');
    expect(migrationSql).toContain('c.parent_product_id = t.id');
  });

  it('blockerar packade/kollade/allokerade rader', () => {
    expect(migrationSql).toContain('quantity_packed, 0) > 0');
    expect(migrationSql).toContain('pli.parcel_id IS NOT NULL');
    expect(migrationSql).toContain('pli.packed_at IS NOT NULL');
    expect(migrationSql).toContain('pli.verified_at IS NOT NULL');
    expect(migrationSql).toContain('packing_list_item_allocations');
    expect(migrationSql).toContain('row_touched');
  });

  it('är scopead till packing_id + organization_id', () => {
    expect(migrationSql).toContain('WHERE id = _packing_id AND organization_id = _organization_id');
    expect(migrationSql).toContain('packing_id = _packing_id AND organization_id = _organization_id');
  });

  it('skriver audit och verifierar i samma transaktion', () => {
    expect(migrationSql).toContain('INSERT INTO public.packing_work_session_events');
    expect(migrationSql).toContain("'planning_exclude'");
    expect(migrationSql).toContain("'planning_restore'");
    expect(migrationSql).toContain("'planning_web'");
    expect(migrationSql).toContain("'booking_unchanged', true");
    expect(migrationSql).toContain('verification_failed');
  });

  it('exponeras inte publikt', () => {
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.planning_edit_packing_list_item');
    expect(migrationSql).toContain('TO service_role');
  });

  it('nollar planning_excluded_at vid restore', () => {
    expect(migrationSql).toContain('excluded = false, planning_excluded_at = NULL');
    expect(migrationSql).toContain('excluded = true, planning_excluded_at = now()');
  });
});

describe('edge-funktionen edit-packing-list', () => {
  it('validerar JWT och hämtar organisationen från profiles', () => {
    expect(edgeFn).toContain('auth.getUser(jwt)');
    expect(edgeFn).toContain("from('profiles')");
    expect(edgeFn).toContain("eq('user_id', user.id)");
    expect(edgeFn).toContain('organization_id');
  });

  it('tar aldrig organization_id från request-body', () => {
    expect(/body\?\.organization_id/.test(edgeFn)).toBe(false);
  });

  it('anropar endast RPC:n och rör inga tabeller direkt', () => {
    expect(edgeFn).toContain("rpc('planning_edit_packing_list_item'");
    expect(edgeFn).toContain('_organization_id: profile.organization_id');
    expect(/\.delete\(/.test(edgeFn)).toBe(false);
    expect(/from\('packing_list_items'\)/.test(edgeFn)).toBe(false);
    expect(/from\('bookings'\)/.test(edgeFn)).toBe(false);
    expect(/from\('booking_products'\)/.test(edgeFn)).toBe(false);
  });

  it('accepterar bara exclude/restore', () => {
    expect(edgeFn).toContain("mode !== 'exclude' && mode !== 'restore'");
  });
});

describe('WMS respekterar planning_excluded_at', () => {
  it('återställer aldrig en planning-exkluderad rad', () => {
    expect(wms).toContain('if (existingRow.excluded && !existingRow.planning_excluded_at) patch.excluded = false;');
    expect(wms).toContain('planning_excluded_at');
    expect(wms).toContain('planning_excluded_at?: string | null;');
  });
});

describe('Planning-UI', () => {
  it('visar redigering endast i planeringsläge och bekräftar alltid', () => {
    expect(view).toContain("packing?.status === 'planning'");
    expect(view).toContain('AlertDialog');
    expect(view).toContain('Ta bort');
    expect(view).toContain('Återställ');
    expect(view).toContain('paketdel');
  });

  it('går via edge-funktionen, inte direkt mot tabellen', () => {
    expect(view).toContain('planningEditPackingListItem');
    expect(service).toContain("functions.invoke('edit-packing-list'");
    expect(/from\('packing_list_items'\)[\s\S]{0,200}\.delete\(/.test(service)).toBe(false);
    expect(/\.delete\(\)/.test(service)).toBe(false);
  });

  it('blockerar knappen för packade/kollade rader', () => {
    expect(view).toContain('isRowTouched');
    expect(view).toContain('affected.some(isRowTouched)');
  });

  it('övriga desktop-mutatorer förblir blockerade', () => {
    expect(service).toContain('DESKTOP_PACKING_BLOCKED_MESSAGE');
  });
});

describe('Integritet och historik', () => {
  it('excluded_source_item är en varning, inte blockerande', () => {
    expect(integrity).toMatch(/type: 'excluded_source_item',[\s\S]{0,300}severity: 'warning'/);
  });

  it('historiken har svenska labels för planning-händelser', () => {
    expect(history).toContain('planning_exclude: "Borttagen i planering"');
    expect(history).toContain('planning_restore: "Återställd i planering"');
    expect(history).toContain('planning_exclude: "bg-violet');
  });
});
