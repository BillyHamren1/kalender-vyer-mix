import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Locks mem://constraints/known-sites-date-bound-v1.
// snapshotCache.ts must NEVER scan projects/large_projects org-wide for
// geofences — it must go through loadDayKnownSites (date-bound).

const snapshotCachePath = path.resolve(
  'supabase/functions/_shared/staff-gps/snapshotCache.ts',
);
const dayKnownSitesPath = path.resolve(
  'supabase/functions/_shared/staff-gps/dayKnownSites.ts',
);
const useDayKnownSitesPath = path.resolve('src/hooks/useDayKnownSites.ts');
const timeV2LoadersPath = path.resolve('supabase/functions/_shared/time-v2/loaders.ts');

describe('Known Sites Date Bound — contract', () => {
  it('snapshotCache.ts routes geofences via loadDayKnownSites', () => {
    const src = fs.readFileSync(snapshotCachePath, 'utf8');
    expect(src).toMatch(/from\s+["']\.\/dayKnownSites\.ts["']/);
    expect(src).toMatch(/loadDayKnownSites\s*\(/);
  });

  it('snapshotCache.ts does not query projects/large_projects/bookings directly', () => {
    const src = fs.readFileSync(snapshotCachePath, 'utf8');
    // Forbidden: org-wide selects from these tables inside snapshotCache.
    expect(src).not.toMatch(/\.from\(\s*["']projects["']\s*\)/);
    expect(src).not.toMatch(/\.from\(\s*["']large_projects["']\s*\)/);
    expect(src).not.toMatch(/\.from\(\s*["']bookings["']\s*\)/);
  });

  it('snapshot signature includes geofence-set hash', () => {
    const src = fs.readFileSync(snapshotCachePath, 'utf8');
    expect(src).toMatch(/fenceSetHash/);
    expect(src).toMatch(/fh:\$\{fenceSetHash\}/);
  });

  it('dayKnownSites.ts enforces deleted_at + cancelled filters and date scoping', () => {
    const src = fs.readFileSync(dayKnownSitesPath, 'utf8');
    // Date-bound queries
    expect(src).toMatch(/assignment_date/);
    expect(src).toMatch(/report_date/);
    expect(src).toMatch(/entry_date/);
    // Project filters
    expect(src).toMatch(/\.is\(["']deleted_at["'],\s*null\)/);
    expect(src).toMatch(/cancelled|avbokat/);
    // Must NOT pull projects org-wide without booking/project id filter.
    expect(src).not.toMatch(/from\(["']projects["']\)[\s\S]{0,200}\.eq\(["']organization_id["']/);
    // LOCKED: bokningar i status OFFER/CANCELLED får inte bli känd plats.
    expect(src).toMatch(/INACTIVE_BOOKING_STATUSES/);
    expect(src).toMatch(/OFFER/);
    expect(src).toMatch(/CANCELLED/);
  });

  it('frontend useDayKnownSites still excludes cancelled projects and inactive bookings', () => {
    const src = fs.readFileSync(useDayKnownSitesPath, 'utf8');
    expect(src).toMatch(/cancelled/);
    expect(src).toMatch(/avbokat/);
    expect(src).toMatch(/INACTIVE_BOOKING_STATUSES/);
    expect(src).toMatch(/OFFER/);
  });

  it('Time v2 loaders route known targets through date-bound dayKnownSites', () => {
    const src = fs.readFileSync(timeV2LoadersPath, 'utf8');
    expect(src).toMatch(/from\s+["']\.\.\/staff-gps\/dayKnownSites\.ts["']/);
    expect(src).toMatch(/loadDayKnownSites\(/);
    const loadKnownTargetsSection = src.match(/export async function loadKnownTargetsV2[\s\S]*?return out;\n}/)?.[0] ?? src;
    expect(loadKnownTargetsSection).not.toMatch(/from\(["']projects["']\)/);
    expect(loadKnownTargetsSection).not.toMatch(/from\(["']large_projects["']\)/);
  });
});
