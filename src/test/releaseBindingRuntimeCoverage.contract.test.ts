import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  RELEASE_RUNTIME_FILES,
  RELEASE_BINDING_FILES,
  computeReleaseBinding,
  readScopeMigrations,
} from '../../scripts/sync-e2e/releaseBinding.mjs';
import {
  computeFinalReleaseBinding,
  finalReleaseBindingFiles,
  readReleaseTestManifest,
} from '../../scripts/sync-e2e/finalReleaseGate.mjs';
import {
  BOOKING_PLANNING_RELEASE_TESTS,
  REQUIRED_RELEASE_TEST_AREAS,
} from './bookingPlanningReleaseTests.manifest';

/**
 * Låser att release-bindningen faktiskt täcker hela Booking→Planning-ytan:
 * migrationer, harness, SQL/E2E-sektioner, runtime-filer och obligatoriska
 * kontraktstester. En ny runtime-fil utan bindning ⇒ testet faller.
 */

describe('release binding – runtime-täckning', () => {
  it('alla bundna runtime-filer finns på disk', () => {
    const missing = (RELEASE_RUNTIME_FILES as string[]).filter((f) => !fs.existsSync(f));
    expect(missing).toEqual([]);
  });

  it('runtime-ytan täcker både frontend och edge functions', () => {
    const files = RELEASE_RUNTIME_FILES as string[];
    expect(files.some((f) => f.startsWith('src/'))).toBe(true);
    expect(files.some((f) => f.startsWith('supabase/functions/'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it('kritiska sync-filer är bundna', () => {
    const files = RELEASE_RUNTIME_FILES as string[];
    for (const critical of [
      'supabase/functions/import-bookings/index.ts',
      'src/lib/calendar/recomputeBookingStaff.ts',
      'src/lib/calendar/phaseDaysWriter.ts',
      'src/services/importService.ts',
      'src/services/eventService.ts',
    ]) {
      expect(files, `saknar bindning för ${critical}`).toContain(critical);
    }
  });

  it('RELEASE_BINDING_FILES innehåller hela runtime-ytan', () => {
    const bound = RELEASE_BINDING_FILES as string[];
    for (const f of RELEASE_RUNTIME_FILES as string[]) {
      expect(bound, `${f} saknas i RELEASE_BINDING_FILES`).toContain(f);
    }
  });

  it('release-bindningen är deterministisk och komplett', () => {
    const a = computeReleaseBinding(process.cwd());
    const b = computeReleaseBinding(process.cwd());
    expect(a.release_content_binding).toBe(b.release_content_binding);
    expect(a.release_content_binding).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('test-manifestet', () => {
  it('varje manifest-test finns på disk', () => {
    const missing = BOOKING_PLANNING_RELEASE_TESTS.filter((t) => !fs.existsSync(t.file));
    expect(missing.map((t) => t.file)).toEqual([]);
  });

  it('varje obligatoriskt release-område har minst ett test', () => {
    const areas = new Set(BOOKING_PLANNING_RELEASE_TESTS.map((t) => t.area));
    const missing = REQUIRED_RELEASE_TEST_AREAS.filter((a) => !areas.has(a));
    expect(missing).toEqual([]);
  });

  it('inga dubbletter i manifestet', () => {
    const files = BOOKING_PLANNING_RELEASE_TESTS.map((t) => t.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('mjs-läsaren ser samma testlista som TS-manifestet', () => {
    const parsed = readReleaseTestManifest(process.cwd());
    expect(parsed.missing_manifest).toBe(false);
    expect(parsed.files.sort()).toEqual(BOOKING_PLANNING_RELEASE_TESTS.map((t) => t.file).sort());
  });
});

describe('final release binding', () => {
  it('täcker de 12 release-migrationerna', () => {
    const migrations = readScopeMigrations(process.cwd()) as string[];
    expect(migrations.length).toBe(12);
  });

  it('täcker harness, SQL-sektioner, gate-kod och byggkonfiguration', () => {
    const files = finalReleaseBindingFiles(process.cwd()) as string[];
    const joined = files.join('\n');
    expect(joined).toContain('release-migration-compat/run-compat.sh');
    expect(joined).toContain('scripts/run-sync-e2e.sh');
    expect(joined).toContain('scripts/run-booking-planning-final-release.sh');
    expect(joined).toContain('scripts/sync-e2e/gate.mjs');
    expect(joined).toContain('scripts/sync-e2e/finalReleaseGate.mjs');
    expect(joined).toContain('package.json');
    expect(files.filter((f) => f.endsWith('.sql')).length).toBeGreaterThan(5);
  });

  it('täcker samtliga obligatoriska kontraktstester', () => {
    const files = finalReleaseBindingFiles(process.cwd()) as string[];
    for (const t of BOOKING_PLANNING_RELEASE_TESTS) {
      expect(files, `${t.file} saknas i final binding`).toContain(t.file);
    }
  });

  it('inga saknade filer och deterministisk hash', () => {
    const a = computeFinalReleaseBinding(process.cwd());
    const b = computeFinalReleaseBinding(process.cwd());
    expect(a.missing).toEqual([]);
    expect(a.final_release_content_binding).toBe(b.final_release_content_binding);
    expect(a.final_release_content_binding).toMatch(/^[0-9a-f]{64}$/);
    expect(a.final_release_content_binding).not.toBe(a.release_content_binding);
  });
});
