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

/** Alltid SENASTE migrationen som definierar RPC:n (framåtriktade CREATE OR REPLACE). */
const migrationSql = (() => {
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
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

describe('Säkerhetsuppföljning (org-scope, restore-guard, audit)', () => {
  it('scopar båda leden i den rekursiva booking_products-CTE:n till organisationen', () => {
    const cte = migrationSql.slice(
      migrationSql.indexOf('WITH RECURSIVE tree AS'),
      migrationSql.indexOf('SELECT array_agg(pli.id)'),
    );
    expect(cte).toContain('WHERE bp.id = v_root_product');
    expect(cte).toContain('AND bp.organization_id = _organization_id');
    expect(cte).toContain('WHERE c.organization_id = _organization_id');
  });

  it('scopar allocation-kontrollen till organisationen', () => {
    expect(migrationSql).toContain('WHERE a.packing_list_item_id = pli.id');
    expect(migrationSql).toContain('AND a.organization_id = _organization_id');
  });

  it('återställer endast planning-exkluderade rader och failar annars', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'not_planning_excluded'");
    expect(migrationSql).toContain('IF v_root.planning_excluded_at IS NULL THEN');
    expect(migrationSql).toContain('AND pli.planning_excluded_at IS NOT NULL');
  });

  it('auditerar endast rader vars läge faktiskt ändrades', () => {
    expect(migrationSql).toContain('RETURNING id');
    expect(migrationSql).toContain('SELECT array_agg(id) INTO v_changed_ids FROM upd');
    expect(migrationSql).toContain('WHERE pli.id = ANY(v_changed_ids)');
    expect(migrationSql).not.toContain('WHERE pli.id = ANY(v_ids);');
  });

  it('gör fortfarande inga DELETE och rör aldrig bookings/booking_products', () => {
    expect(/\bDELETE\s+FROM\b/i.test(migrationSql)).toBe(false);
    expect(/UPDATE\s+public\.booking_products/i.test(migrationSql)).toBe(false);
    expect(/UPDATE\s+public\.bookings/i.test(migrationSql)).toBe(false);
    expect(/INSERT\s+INTO\s+public\.booking(s|_products)/i.test(migrationSql)).toBe(false);
  });

  it('edge-funktionen är POST-only men tillåter OPTIONS', () => {
    expect(edgeFn).toContain("if (req.method === 'OPTIONS')");
    expect(edgeFn).toContain("req.method !== 'POST'");
    expect(edgeFn).toContain('method_not_allowed');
  });

  it('edge-funktionen har svensk mapping för not_planning_excluded', () => {
    expect(edgeFn).toContain('not_planning_excluded:');
    expect(edgeFn).toContain('kan därför inte återställas härifrån');
  });

  it('UI räknar paketdelar även vid restore', () => {
    expect(view).toContain('const affected = collectPackageRows(item);');
    expect(view).not.toContain("mode === 'exclude' ? collectPackageRows(item) : [item]");
  });

  it('UI visar Återställ endast för planning-exkluderade rader', () => {
    expect(view).toContain('isEditMode && canEdit && !!item.planning_excluded_at');
  });

  it('bannern beskriver planning-redigering men scanner-only packning', () => {
    expect(view).not.toContain('Den här webbvyn är skrivskyddad — kolli, +/-, exkludering');
    expect(view).toContain('I planeringsläget kan du justera vilka rader som ska packas');
    expect(view).toContain('hanteras enbart i skannern');
  });
});
