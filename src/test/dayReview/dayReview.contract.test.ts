/**
 * Contract-tester: kontrollerar att kritisk struktur finns kvar i kodbasen.
 * Bryts dessa, har någon raderat eller döpt om en kärnfunktion.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf-8');

const HOOK = read('src/hooks/useDayReviewActions.ts');
const REMINDER = read('src/hooks/useStaleDayReminder.ts');
const PAGE = read('src/pages/mobile/MobileDayReview.tsx');
const SERVICE = read('src/services/mobileApiService.ts');
const EDGE = read('supabase/functions/mobile-app-api/index.ts');
const OVERLAYS = read('src/components/mobile-app/MobileGlobalOverlays.tsx');

describe('Day-review contract — actions in useDayReviewActions', () => {
  it('exposes all 7 official actions', () => {
    for (const name of [
      'startWorkFromArrival',
      'startWorkNow',
      'endActivityAtDeparture',
      'endWorkDayAtHomeArrival',
      'adjustTravel',
      'dismissEvent',
      'approveWorkday',
    ]) {
      expect(HOOK).toMatch(new RegExp(name));
    }
  });

  it('eventToTarget reads top-level target_type/target_id (not just metadata)', () => {
    // Säkerställer att fixet för det kritiska "Saknar mål"-bug:et inte regredar.
    expect(HOOK).toMatch(/ev\.target_type\s*\?\?\s*meta\.target_kind/);
    expect(HOOK).toMatch(/ev\.target_id\s*\?\?\s*meta\.target_id/);
  });

  it('uses central flows (workday-first + stopSession + syncWorkDayEnd)', () => {
    expect(HOOK).toMatch(/ensureWorkDay\(ev\.happened_at\)/);
    expect(HOOK).toMatch(/startFlow\.requestStart\(target/);
    expect(HOOK).toMatch(/stopSession\(target,\s*\{\s*stopAtIso/);
    expect(HOOK).toMatch(/syncWorkDayEnd\(ev\.happened_at\)/);
  });
});

describe('Day-review contract — UI in MobileDayReview', () => {
  it('renders contextual action buttons', () => {
    expect(PAGE).toMatch(/Starta från/);
    expect(PAGE).toMatch(/Starta nu/);
    expect(PAGE).toMatch(/Avsluta vid/);
    expect(PAGE).toMatch(/Avsluta dagen vid/);
    expect(PAGE).toMatch(/Godkänn dagen/);
    expect(PAGE).toMatch(/Irrelevant/);
  });
});

describe('Day-review contract — service wrappers + edge handlers', () => {
  it('mobileApi exposes listWorkdaysReview, setTravelTimes, approveWorkday', () => {
    expect(SERVICE).toMatch(/listWorkdaysReview/);
    expect(SERVICE).toMatch(/setTravelTimes/);
    expect(SERVICE).toMatch(/approveWorkday/);
  });

  it('edge function routes the 3 actions', () => {
    expect(EDGE).toMatch(/case 'list_workdays_review'/);
    expect(EDGE).toMatch(/case 'set_travel_times'/);
    expect(EDGE).toMatch(/case 'approve_workday'/);
  });

  it('approve_workday-handler scopar på staff_id OCH organization_id (RLS)', () => {
    const handler =
      EDGE.split(/async\s+function\s+handleApproveWorkday\s*\(/)[1]?.split(
        /\nasync\s+function\s+/,
      )[0] || '';
    expect(handler).toMatch(/\.eq\(\s*['"]staff_id['"]\s*,\s*staffId\s*\)/);
    expect(handler).toMatch(/\.eq\(\s*['"]organization_id['"]\s*,\s*organizationId\s*\)/);
  });

  it('set_travel_times validerar att end > start', () => {
    const handler =
      EDGE.split(/async\s+function\s+handleSetTravelTimes\s*\(/)[1]?.split(
        /\nasync\s+function\s+/,
      )[0] || '';
    expect(handler).toMatch(/end_time must be after start_time|endMs\s*<=\s*startMs/);
  });

  it('list_workdays_review skickar med target_type/target_id i select', () => {
    expect(EDGE).toMatch(/target_type,\s*target_id/);
  });

  it('dualWriteAssistantEvent speglar target_kind in i metadata', () => {
    expect(EDGE).toMatch(/target_kind:\s*payload\.target_type/);
  });

  it('bg-geofence skapar EVENT, inte tyst location_time_entries-rad', () => {
    // Säkerställer att "auto-checkin" inte återinförs i bakgrunden.
    expect(EDGE).not.toMatch(/source:\s*'auto_assigned_bg'/);
    expect(EDGE).toMatch(/source:\s*'geofence_background'/);
  });
});

describe('Day-review contract — stale reminder', () => {
  it('throttlas via localStorage', () => {
    expect(REMINDER).toMatch(/eventflow-stale-day-reminder-shown/);
  });

  it('navigerar till /m/day-review', () => {
    expect(REMINDER).toMatch(/\/m\/day-review/);
  });

  it('mountas i MobileGlobalOverlays', () => {
    expect(OVERLAYS).toMatch(/useStaleDayReminder/);
  });
});
