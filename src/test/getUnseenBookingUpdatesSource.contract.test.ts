/**
 * Kontrakt: get_unseen_booking_updates() får ENDAST räkna ändringar från
 * externa Booking-källor (service_role / booking-import / booking-webhook).
 * Interna UI-ändringar (authenticated) loggas i booking_changes men ska
 * inte trigga granskningslistan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function loadLatestGetUnseenSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let latest = '';
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (/CREATE OR REPLACE FUNCTION public\.get_unseen_booking_updates/i.test(sql)) {
      latest = sql;
    }
  }
  if (!latest) throw new Error('Hittade ingen migration som definierar get_unseen_booking_updates');
  return latest;
}

describe('get_unseen_booking_updates source contract', () => {
  const sql = loadLatestGetUnseenSql();

  it('filtrerar booking_changes på extern källa', () => {
    expect(sql).toMatch(
      /bc\.changed_by\s+IN\s*\(\s*'service_role'\s*,\s*'booking-import'\s*,\s*'booking-webhook'\s*\)/i,
    );
  });

  it('begränsar till update/status_change', () => {
    expect(sql).toMatch(/bc\.change_type\s+IN\s*\(\s*'update'\s*,\s*'status_change'\s*\)/i);
  });
});
