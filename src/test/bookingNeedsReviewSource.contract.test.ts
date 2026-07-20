/**
 * Kontrakt: bookings.needs_review får ENDAST sättas av externa Booking-källor
 * (service_role / booking-import / booking-webhook). Interna UI-ändringar
 * (authenticated) ska loggas i booking_changes men inte flagga
 * "Uppdaterade bokningar"-listan.
 *
 * Detta test låser SQL-källan i den senaste migration som definierar
 * public.track_booking_changes så att framtida regressioner upptäcks
 * vid kodgranskning utan att kräva live-DB.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function loadLatestTrackBookingChangesSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let latest = '';
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    if (/CREATE OR REPLACE FUNCTION public\.track_booking_changes/i.test(sql)) {
      latest = sql;
    }
  }
  if (!latest) throw new Error('Hittade ingen migration som definierar track_booking_changes');
  return latest;
}

describe('booking needs_review source contract', () => {
  const sql = loadLatestTrackBookingChangesSql();

  it('läser explicit källa från request-header eller GUC', () => {
    expect(sql).toMatch(/x-lovable-change-source/);
    expect(sql).toMatch(/current_setting\(\s*'app\.current_user'/);
  });

  it('klassificerar ENDAST booking-import / booking-webhook som externt (service_role räknas inte)', () => {
    expect(sql).toMatch(
      /is_external_source\s*:=\s*COALESCE\(\s*header_source\s*,\s*guc_source\s*\)\s+IN\s*\(\s*'booking-import'\s*,\s*'booking-webhook'\s*\)/
    );
    // Regressionsvakt: den gamla regeln som inkluderade service_role får inte återuppstå.
    expect(sql).not.toMatch(/is_external_source\s*:=[^;]*'service_role'/);
  });

  it('sätter NEW.needs_review := true ENDAST när is_external_source är sant', () => {
    const match = sql.match(/IF\s+has_external_changes[\s\S]{0,400}NEW\.needs_review\s*:=\s*true/i);
    expect(match, 'needs_review-blocket saknas').toBeTruthy();
    expect(match![0]).toContain('is_external_source');
  });

  it('loggar fortfarande booking_changes oavsett källa', () => {
    expect(sql).toMatch(/INSERT INTO public\.booking_changes/);
  });
});
