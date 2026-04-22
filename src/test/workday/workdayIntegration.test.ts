/**
 * Workday integration contract — verifies the timer-start and EOD flows
 * trigger the server-anchor sync.
 *
 * We don't drive the full hooks here (they need MobileAuth + bookings
 * context); we assert the modules wire `syncWorkDayStart` / `syncWorkDayEnd`
 * onto the right places by source-grep, which is the same pattern other
 * contract tests in this repo use to lock in integration points.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('workday integration', () => {
  it('useTimerStartFlow calls syncWorkDayStart on successful start', () => {
    const src = read('src/hooks/useTimerStartFlow.ts');
    expect(src).toContain("from '@/services/workdayServerSync'");
    expect(src).toMatch(/syncWorkDayStart\(/);
    // Must be inside the success branch (after toast.success).
    const successIdx = src.indexOf("toast.success(`Timer startad");
    const syncIdx = src.indexOf('syncWorkDayStart(');
    expect(successIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeGreaterThan(successIdx);
  });

  it('GlobalActiveTimerBanner calls syncWorkDayEnd in EOD drain path', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    expect(src).toContain("from '@/services/workdayServerSync'");
    // Must be invoked next to markWorkdayEnded (both branches).
    expect(src).toMatch(/markWorkdayEnded\(\);[\s\S]{0,200}syncWorkDayEnd\(\)/);
  });

  it('syncWorkDayStart / syncWorkDayEnd are exported as fire-and-forget (void return)', () => {
    const src = read('src/services/workdayServerSync.ts');
    expect(src).toMatch(/export function syncWorkDayStart\([^)]*\): void/);
    expect(src).toMatch(/export function syncWorkDayEnd\([^)]*\): void/);
  });

  it('workday edge function exposes start | end | current actions', () => {
    const src = read('supabase/functions/workday/index.ts');
    expect(src).toMatch(/action !== 'start'/);
    expect(src).toMatch(/action !== 'end'/);
    expect(src).toMatch(/action !== 'current'/);
    // Idempotency on start.
    expect(src).toMatch(/created: false/);
    // Idempotency on end.
    expect(src).toMatch(/alreadyClosed: true/);
  });
});
