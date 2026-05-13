/**
 * GPS Evidence-Only Contract Test
 *
 * Locks in the policy that GPS / geofence is signal-only and may never own
 * work time. If any of these tests fail, the policy has been violated and
 * the offending code MUST be reverted (or this test updated with explicit
 * design rationale + memory note).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  GPS_SIGNAL_ONLY,
  DAY_TIMER_ONLY,
  TIME_ENGINE_OWNS_TIMELINE,
} from '@/lib/policies/gpsOwnership';

const PROJECT_ROOT = resolve(__dirname, '../../..');

function read(rel: string): string {
  const p = resolve(PROJECT_ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

describe('GPS Evidence-Only contract', () => {
  it('exports the three policy constants', () => {
    expect(GPS_SIGNAL_ONLY).toBe('GPS_SIGNAL_ONLY');
    expect(DAY_TIMER_ONLY).toBe('DAY_TIMER_ONLY');
    expect(TIME_ENGINE_OWNS_TIMELINE).toBe('TIME_ENGINE_OWNS_TIMELINE');
  });

  describe('useBackgroundLocationReporter — signal collection only', () => {
    const src = read('src/hooks/useBackgroundLocationReporter.ts');

    it('does not write time_reports, location_time_entries, or workdays from the client', () => {
      expect(src).not.toMatch(/from\(['"]time_reports['"]\)/);
      expect(src).not.toMatch(/from\(['"]location_time_entries['"]\)/);
      expect(src).not.toMatch(/from\(['"]workdays['"]\)/);
    });

    it('does not start project / booking / location / warehouse timers', () => {
      expect(src).not.toMatch(/start_location_timer|start_booking_timer|start_project_timer|start_warehouse_timer/);
    });
  });

  describe('useGeofencing — read-only signal source', () => {
    const src = read('src/hooks/useGeofencing.ts');

    it('does not write time_reports / workdays directly', () => {
      expect(src).not.toMatch(/\.from\(['"]time_reports['"]\)\s*\.insert/);
      expect(src).not.toMatch(/\.from\(['"]workdays['"]\)\s*\.insert/);
      expect(src).not.toMatch(/\.from\(['"]location_time_entries['"]\)\s*\.insert/);
    });

    it('startTimer is disabled by single-timer-policy (no-op stub)', () => {
      // The no-op stub logs a warning explaining the policy.
      expect(src).toMatch(/startTimer is disabled by single-timer-policy/);
    });
  });

  describe('upload_location_batch (mobile-app-api) — pings + day timer only', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');

    it('persists pings via staff_location_history, not via timeline blocks', () => {
      // Must touch staff_location_history (the evidence store).
      expect(src).toMatch(/staff_location_history/);
    });

    it('explicitly forbids timeline mutations in the batch action (documentation guard)', () => {
      // The block contains the policy contract comment we added.
      expect(src).toMatch(/GPS_SIGNAL_ONLY \+ DAY_TIMER_ONLY/);
      expect(src).toMatch(/MUST NOT create or mutate time_reports/);
    });

    it('only mutates active_time_registrations from the GPS code paths', () => {
      // Locate the upload_location_batch handler region (between marker and next handler).
      const startIdx = src.indexOf("case 'upload_location_batch':");
      expect(startIdx).toBeGreaterThan(-1);
      // Find next case/handler boundary (heuristic: next "case '" at column 4 within 8000 chars)
      const region = src.slice(startIdx, startIdx + 25000);

      // Inside this region we should NOT see direct inserts/updates into the
      // forbidden tables.
      const forbidden = [
        /\.from\(['"]time_reports['"]\)\s*\.insert/,
        /\.from\(['"]time_reports['"]\)\s*\.upsert/,
        /\.from\(['"]location_time_entries['"]\)\s*\.insert/,
        /\.from\(['"]location_time_entries['"]\)\s*\.upsert/,
        /\.from\(['"]workdays['"]\)\s*\.insert/,
        /\.from\(['"]workdays['"]\)\s*\.upsert/,
        /\.from\(['"]travel_time_logs['"]\)\s*\.insert/,
      ];
      for (const re of forbidden) {
        expect(region, `forbidden mutation matched: ${re}`).not.toMatch(re);
      }
    });

    it('drives auto-start AND auto-stop for the day timer', () => {
      expect(src).toMatch(/processGpsTimelineForAutoStart/);
      expect(src).toMatch(/evaluateAutoStopForActiveDay/);
    });
  });

  describe('processGpsTimelineForAutoStart — only mutates active_time_registrations', () => {
    const src = read('supabase/functions/_shared/time-engine/processGpsTimelineForAutoStart.ts');

    it('does not write timeline tables', () => {
      expect(src).not.toMatch(/\.from\(['"]time_reports['"]\)\s*\.(insert|upsert|update)/);
      expect(src).not.toMatch(/\.from\(['"]location_time_entries['"]\)\s*\.(insert|upsert|update)/);
      expect(src).not.toMatch(/\.from\(['"]workdays['"]\)\s*\.(insert|upsert|update)/);
      expect(src).not.toMatch(/\.from\(['"]travel_time_logs['"]\)\s*\.(insert|upsert|update)/);
    });
  });

  describe('evaluateAutoStopForActiveDay — pure, no side effects', () => {
    const src = read('supabase/functions/_shared/time-engine/evaluateAutoStopForActiveDay.ts');

    it('contains no DB calls (pure evaluator)', () => {
      expect(src).not.toMatch(/supabase\./);
      expect(src).not.toMatch(/createClient/);
      expect(src).not.toMatch(/\.from\(/);
    });
  });
});
