// @vitest-environment node
/**
 * dayReview.contract.test.ts
 * ──────────────────────────
 * Contract-svit som låser KÄLLKODEN för dagavstämningsmodellen — 7
 * actions, throttle på påminnelsen, säkra centrala flöden, edge-routes,
 * och RLS-isolering på de nya handlers.
 *
 * Tester här läser källfiler (text-grep) — det säkerställer att framtida
 * refactors inte tyst tappar säkerhetsregler eller åtgärder.
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

  it('uses CENTRAL safe flows — no direct time_reports/workdays writes', () => {
    expect(HOOK).toMatch(/useTimerStartFlow/);
    expect(HOOK).toMatch(/useWorkSession/);
    expect(HOOK).toMatch(/useWorkDay/);
    expect(HOOK).toMatch(/syncWorkDayEnd/);
    // Förbjudna direktvägar
    expect(HOOK).not.toMatch(/from\s*\(\s*['"]time_reports['"]\s*\)/);
    expect(HOOK).not.toMatch(/createTimeReport/);
  });

  it('start-from-arrival ensures workday FIRST (workday-first kontrakt)', () => {
    // Plocka FUNKTIONS-implementationen (efter "= useCallback"), inte typedefen
    const impl = HOOK.split(/const\s+startWorkFromArrival\s*=\s*useCallback/)[1] || '';
    const fnBody = impl.split(/const\s+startWorkNow\s*=\s*useCallback/)[0];
    expect(fnBody).toMatch(/ensureWorkDay/);
    expect(fnBody).toMatch(/requestStart/);
    expect(fnBody.indexOf('ensureWorkDay')).toBeLessThan(fnBody.indexOf('requestStart'));
  });

  it('end-day-at-home uses syncWorkDayEnd (server-anchored EOD)', () => {
    const impl = HOOK.split(/const\s+endWorkDayAtHomeArrival\s*=\s*useCallback/)[1] || '';
    const fnBody = impl.split(/const\s+adjustTravel\s*=\s*useCallback/)[0];
    expect(fnBody).toMatch(/syncWorkDayEnd\(/);
  });

  it('dismissEvent uses ignored_stale (event lever kvar i review-data)', () => {
    expect(HOOK).toMatch(/ignored_stale/);
  });
});

describe('Day-review contract — UI in MobileDayReview', () => {
  it('renders action buttons for all 4 contextual actions', () => {
    expect(PAGE).toMatch(/Starta från/);
    expect(PAGE).toMatch(/Starta nu/);
    expect(PAGE).toMatch(/Avsluta vid/);
    expect(PAGE).toMatch(/Avsluta dagen vid/);
    expect(PAGE).toMatch(/Irrelevant/);
    expect(PAGE).toMatch(/Godkänn dagen/);
  });

  it('displays both today and yesterday context labels', () => {
    expect(PAGE).toMatch(/Idag/);
    expect(PAGE).toMatch(/Igår/);
  });

  it('shows reasons & counts panels for needs_review days', () => {
    expect(PAGE).toMatch(/REASON_LABELS/);
    expect(PAGE).toMatch(/open_events/);
    expect(PAGE).toMatch(/stale_review_events/);
    expect(PAGE).toMatch(/open_travel/);
  });

  it('hides Approve button once status is approved', () => {
    expect(PAGE).toMatch(/review_status\s*!==\s*['"]approved['"]/);
  });
});

describe('Day-review contract — reminder throttle', () => {
  it('throttles to once per staff per calendar day via localStorage', () => {
    expect(REMINDER).toMatch(/eventflow-stale-day-reminder-shown/);
    expect(REMINDER).toMatch(/alreadyShownToday/);
    expect(REMINDER).toMatch(/markShownToday/);
  });

  it('triggers on app-open, workday-ended event AND focus', () => {
    expect(REMINDER).toMatch(/setTimeout/); // app-open delayed trigger
    expect(REMINDER).toMatch(/'workday-ended'/);
    expect(REMINDER).toMatch(/'focus'/);
  });

  it('only counts days where day_key < today (igår/äldre)', () => {
    expect(REMINDER).toMatch(/day_key\s*<\s*today/);
  });

  it('navigerar till /m/day-review när Granska klickas', () => {
    expect(REMINDER).toMatch(/'\/m\/day-review'/);
  });

  it('mountas i MobileGlobalOverlays', () => {
    expect(OVERLAYS).toMatch(/useStaleDayReminder/);
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

  it('approve_workday-handler scopar på staff_id OCH organization_id (RLS-isolering)', () => {
    // Splitta på själva function-definitionen (async function handleApproveWorkday(...))
    const handler = EDGE.split(/async\s+function\s+handleApproveWorkday\s*\(/)[1]?.split(/\nasync\s+function\s+/)[0] || '';
    expect(handler).toMatch(/\.eq\(\s*['"]staff_id['"]\s*,\s*staffId\s*\)/);
    expect(handler).toMatch(/\.eq\(\s*['"]organization_id['"]\s*,\s*organizationId\s*\)/);
  });

  it('set_travel_times-handler scopar på staff_id OCH organization_id', () => {
    const handler = EDGE.split(/async\s+function\s+handleSetTravelTimes\s*\(/)[1]?.split(/\nasync\s+function\s+/)[0] || '';
    expect(handler).toMatch(/\.eq\(\s*['"]staff_id['"]\s*,\s*staffId\s*\)/);
    expect(handler).toMatch(/\.eq\(\s*['"]organization_id['"]\s*,\s*organizationId\s*\)/);
  });

  it('set_travel_times validerar att end > start', () => {
    const handler = EDGE.split(/async\s+function\s+handleSetTravelTimes\s*\(/)[1]?.split(/\nasync\s+function\s+/)[0] || '';
    expect(handler).toMatch(/end_time must be after start_time|endMs\s*<=\s*startMs/);
  });

  it('list_workdays_review levererar både events_for_day OCH travels_for_day', () => {
    expect(EDGE).toMatch(/events_for_day/);
    expect(EDGE).toMatch(/travels_for_day/);
  });
});

describe('Day-review contract — stale model preserved', () => {
  it('migration definierar review_status enum med alla 4 värden', () => {
    const mig = read('supabase/migrations/20260422232436_0dc106e3-8db8-4d02-b00f-2c16e7e66bc7.sql');
    for (const v of ['draft', 'needs_review', 'ready', 'approved']) {
      expect(mig).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('compute_workday_review_status låser approved', () => {
    const mig = read('supabase/migrations/20260422232436_0dc106e3-8db8-4d02-b00f-2c16e7e66bc7.sql');
    expect(mig).toMatch(/review_status\s*=\s*'approved'[\s\S]{0,80}RETURN\s+'approved'/);
  });

  it('stale-modellen: stale_for_prompt skiljs från still_relevant_for_review', () => {
    // Promote-funktionen finns
    const promoteMig = read('supabase/migrations/20260422232553_19442d47-0924-43d0-9c49-d37cf4d3eb42.sql');
    expect(promoteMig).toMatch(/promote_stale_assistant_events/);
    expect(promoteMig).toMatch(/stale_for_prompt/);
    // assistant-events anropar promote on read
    const ae = read('supabase/functions/assistant-events/index.ts');
    expect(ae).toMatch(/promote_stale_assistant_events/);
  });
});
