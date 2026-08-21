import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Låser att packningens granskningsflagga endast sätts av EXTERNA bokningsändringar
 * och aldrig av Plannings egna skrivningar (tider, datum, placering, återimport).
 */
const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

const latestTriggerMigration = () => {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const withTrigger = files.filter((f) =>
    readFileSync(resolve(migrationsDir, f), 'utf8').includes('FUNCTION public.sync_packing_on_booking_change'),
  );
  expect(withTrigger.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, withTrigger[withTrigger.length - 1]), 'utf8');
};

describe('packing review flag source contract', () => {
  const sql = latestTriggerMigration();

  it('classifies external booking sources explicitly', () => {
    expect(sql).toContain("'x-lovable-change-source'");
    expect(sql).toContain("IN ('booking-import', 'booking-webhook')");
  });

  it('respects app.skip_review from Planning-initiated syncs', () => {
    expect(sql).toContain("current_setting('app.skip_review', true)");
    expect(sql).toContain('NOT should_skip_review');
  });

  it('never flags packings that are still in planning status', () => {
    const flagOccurrences = sql.match(/flag_review AND status IS DISTINCT FROM 'planning'/g) ?? [];
    expect(flagOccurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps cancelled bookings always visible for review', () => {
    expect(sql).toContain("needs_packing_review_reason = 'cancelled'");
  });

  it('makes no destructive changes', () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b/i);
  });

  it('keeps the import sending the external source header', () => {
    const importFn = readFileSync(resolve(process.cwd(), 'supabase/functions/import-bookings/index.ts'), 'utf8');
    expect(importFn).toContain("'x-lovable-change-source': 'booking-import'");
  });
});
