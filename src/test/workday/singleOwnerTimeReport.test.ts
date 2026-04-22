/**
 * Single-owner contract for time_reports.
 *
 * The legacy DB trigger `trg_sync_location_entry_to_time_report` is
 * removed (migration 2026-04-22). The ONLY sanctioned creator of
 * `time_reports` is `mobile-app-api.handleCreateTimeReport`, called
 * from `useGeofencing.saveAndStopTimer` (which is itself only called
 * from `useWorkSession.stopSession`).
 *
 * This test pins:
 *   1. Frontend: `MobileGlobalOverlays.handleStaleSave` no longer calls
 *      `mobileApi.createTimeReport` directly — it routes through
 *      `stopSession` so the same single-owner rule applies.
 *   3. Frontend: `useWorkSession.stopSession` links anomalies via
 *      `timeReportId` (NOT `serverEntryId`).
 *   4. Frontend: `useGeofencing.saveAndStopTimer` returns a typed shape
 *      with all three id types — `timer`, `serverEntryId`, `timeReportId`.
 *   5. Migration: the deprecation marker is present in the migration
 *      file (so anyone grep-ing the codebase finds the rationale).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('single-owner time_reports contract', () => {
  it('legacy useWorkDayTimer hook is fully removed (server-driven useWorkDay is the only source)', () => {
    // The legacy activity-derived day clock must not exist any more.
    // UI reads workday status exclusively via `useWorkDay()` against the
    // `workdays` table.
    let exists = true;
    try {
      read('src/hooks/useWorkDayTimer.ts');
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('MobileGlobalOverlays.handleStaleSave routes through stopSession (no rogue createTimeReport)', () => {
    const src = read('src/components/mobile-app/MobileGlobalOverlays.tsx');
    const fnStart = src.indexOf('const handleStaleSave = useCallback');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf('}, [staleTimers, dismissStale, stopSession]);', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    // Must NOT call mobileApi.createTimeReport directly any more.
    expect(body).not.toMatch(/mobileApi\.createTimeReport/);
    // Must NOT call mobileApi.stopLocationTimer directly any more.
    expect(body).not.toMatch(/mobileApi\.stopLocationTimer/);
    // Must use the unified engine.
    expect(body).toMatch(/stopSession\(/);
    // Must use timerToTarget for correct id mapping.
    expect(body).toMatch(/timerToTarget\(/);
  });

  it('useWorkSession.stopSession links anomalies via timeReportId (not serverEntryId)', () => {
    const src = read('src/hooks/useWorkSession.tsx');
    // The new variable name must be present.
    expect(src).toMatch(/savedTimeReportId/);
    // The old wrong-id pattern must be gone.
    expect(src).not.toMatch(/\(stopped as any\)\?\.serverEntryId/);
    // Both anomaly create-calls must reference savedTimeReportId.
    const matches = src.match(/time_report_id:\s*savedTimeReportId/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('saveAndStopTimer returns a typed shape with timer, serverEntryId and timeReportId', () => {
    const src = read('src/hooks/useGeofencing.ts');
    expect(src).toMatch(/interface SaveAndStopResult/);
    expect(src).toMatch(/timer:\s*ActiveTimer/);
    expect(src).toMatch(/serverEntryId:\s*string\s*\|\s*null/);
    expect(src).toMatch(/timeReportId:\s*string\s*\|\s*null/);
    // The return statement must construct that shape.
    const fnStart = src.indexOf('const saveAndStopTimer = useCallback');
    const fnEnd = src.indexOf('}, [_clearLocalTimer, _resolveStopPayload]);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/return\s*\{\s*timer,/);
    expect(body).toMatch(/timeReportId,/);
  });

  it('migration removing trg_sync_location_entry_to_time_report exists', () => {
    const dir = resolve(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir);
    const hits = files.filter((f) => {
      try {
        const body = readFileSync(resolve(dir, f), 'utf8');
        return /DROP TRIGGER\s+IF\s+EXISTS\s+trg_sync_location_entry_to_time_report/i.test(body);
      } catch {
        return false;
      }
    });
    expect(hits.length).toBeGreaterThan(0);
  });
});
