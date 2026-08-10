/**
 * STEG 3L — import-bookings är helt icke-destruktiv för CANCELLED status.
 * Normal sync (single/batch/incremental/full/historical) får ALDRIG utföra
 * destruktiv cancellation, oavsett AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const IMPORT = read('supabase/functions/import-bookings/index.ts');
const RECONCILE = read('supabase/functions/reconcile-booking-status/index.ts');
const CONTRACT = read('supabase/functions/_shared/singleBookingResult.ts');

const bulkBlock = (() => {
  const start = IMPORT.indexOf('// STEG 3L: CANCELLED i normal sync');
  const end = IMPORT.indexOf('// Extract client name', start);
  return IMPORT.slice(start, end);
})();

const singleBlock = (() => {
  const start = IMPORT.indexOf("if (decision.allowed && decision.action === 'cancellation')");
  const end = IMPORT.indexOf("if (parsedSource.kind === 'error')", start);
  return IMPORT.slice(start, end);
})();

describe('import-bookings innehåller inga cancellation-call-sites', () => {
  it('inga anrop till applyBookingCancellation', () => {
    expect(IMPORT).not.toContain('applyBookingCancellation');
  });

  it('inga anrop till apply_booking_cancellation_atomic', () => {
    expect(IMPORT).not.toContain('apply_booking_cancellation_atomic');
  });

  it('cancellation-handlern importeras inte', () => {
    expect(IMPORT).not.toMatch(/from '\.\.\/_shared\/cancellation-handler\.ts'/);
  });

  it('feature-flaggan används inte som cancellation-grind i normal sync', () => {
    expect(bulkBlock).not.toContain('isAutomaticDestructiveSyncEnabled');
    expect(singleBlock).not.toContain('isAutomaticDestructiveSyncEnabled');
  });
});

describe('CANCELLED i normal sync blir endast kandidat', () => {
  it('single: outcome cancellation_requires_explicit_apply, 0 mutationer', () => {
    expect(singleBlock).toContain("outcome: 'cancellation_requires_explicit_apply'");
    expect(singleBlock).toContain('cancellation_candidates');
    expect(singleBlock).not.toContain('.delete()');
    expect(singleBlock).not.toContain('.update(');
    expect(singleBlock).not.toContain('.upsert(');
  });

  it('batch/incremental/full: kandidat + continue, inga mutationer', () => {
    expect(bulkBlock).toContain('results.cancellation_candidates.push(');
    expect(bulkBlock).toContain('continue;');
    expect(bulkBlock).not.toContain('.delete()');
    expect(bulkBlock).not.toContain('.update(');
    expect(bulkBlock).not.toContain('.upsert(');
    expect(bulkBlock).not.toContain('results.imported++');
  });

  it('historical CANCELLED går samma väg och når aldrig found:true-upsert', () => {
    expect(bulkBlock).toContain('historical_cancelled_candidate');
    // Ingen separat historical-gren som släpper igenom CANCELLED.
    expect(IMPORT).not.toContain("bookingStatus === 'CANCELLED' && isHistoricalImport");
    expect(IMPORT).not.toContain("bookingStatus === 'CANCELLED' && !isHistoricalImport");
  });
});

describe('worker/cursor', () => {
  it('kandidat-outcome är varken success eller completed', () => {
    expect(CONTRACT).not.toMatch(
      /SUCCESS_OUTCOMES[\s\S]{0,120}cancellation_requires_explicit_apply/,
    );
    expect(CONTRACT).toContain("case 'cancellation_requires_explicit_apply':");
    expect(CONTRACT).toContain("reason: 'cancellation_requires_explicit_apply'");
  });

  it('felet är permanent (ingen evig retry som flyttar cursor)', () => {
    const nonRetriable = CONTRACT.slice(CONTRACT.indexOf('NON_RETRIABLE_IMPORT_ERRORS'));
    expect(nonRetriable).toContain("'cancellation_requires_explicit_apply'");
  });
});

describe('enda destruktiva vägen är den explicita reconcile-vägen', () => {
  it('reconcile behåller flagga + dry_run=false + confirm + exakt ett booking_id', () => {
    const line = RECONCILE.split('\n').find((l) => l.includes('const liveApply ='))!;
    expect(line).toContain('flagEnabled');
    expect(line).toContain('dryRunRequested === false');
    expect(line).toContain('confirmed === true');
    expect(line).toContain('onlyBookingId');
    expect(RECONCILE).toContain('await applyBookingCancellation(');
  });

  it('shared handler är fortsatt låst av feature flag (defense in depth)', () => {
    const HANDLER = read('supabase/functions/_shared/cancellation-handler.ts');
    const guardIdx = HANDLER.indexOf('isAutomaticDestructiveSyncEnabled()');
    const rpcIdx = HANDLER.indexOf("supabase.rpc('apply_booking_cancellation_atomic'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(rpcIdx);
  });
});
