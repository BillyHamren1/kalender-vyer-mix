/**
 * Workday integration contract — verifies that the timer-start flow is
 * WORKDAY-FIRST and that the EOD pipeline still server-anchors the end.
 *
 * Source-grep contract style (same pattern other contract tests use).
 *
 * Workday-first rule (post 2026-04-22):
 *   `useTimerStartFlow.performStart` MUST `await ensureWorkDayActive(...)`
 *   BEFORE calling `startSession(...)`. The legacy fire-and-forget
 *   `syncWorkDayStart` import was removed from this hook because the
 *   guarantee is now baked into `ensureActive` on `useWorkDay`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('workday integration', () => {
  it('useTimerStartFlow awaits ensureWorkDayActive BEFORE startSession (workday-first)', () => {
    const src = read('src/hooks/useTimerStartFlow.ts');
    expect(src).toContain("from '@/hooks/useWorkDay'");
    expect(src).toMatch(/ensureActive:\s*ensureWorkDayActive/);

    // Locate the performStart body and assert ordering.
    const fnStart = src.indexOf('const performStart = useCallback');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf('[startSession, userPosition, ensureWorkDayActive]', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    const idxEnsure = body.indexOf('ensureWorkDayActive(');
    const idxStart = body.indexOf('startSession(target,');
    expect(idxEnsure).toBeGreaterThan(-1);
    expect(idxStart).toBeGreaterThan(-1);
    expect(idxEnsure).toBeLessThan(idxStart);
    // Must be awaited (not fire-and-forget).
    expect(body).toMatch(/await\s+ensureWorkDayActive\(/);
  });

  it('useTimerStartFlow no longer imports syncWorkDayStart (replaced by ensureActive)', () => {
    const src = read('src/hooks/useTimerStartFlow.ts');
    expect(src).not.toMatch(/from\s+['"]@\/services\/workdayServerSync['"]/);
    expect(src).not.toMatch(/syncWorkDayStart\(/);
  });

  it('GlobalActiveTimerBanner calls syncWorkDayEnd server-first in EOD drain path', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    expect(src).toContain("from '@/services/workdayServerSync'");
    // Server-first: syncWorkDayEnd must be awaited BEFORE markWorkdayEnded.
    expect(src).toMatch(/await\s+syncWorkDayEnd\(\)[\s\S]{0,200}markWorkdayEnded\(\)/);
  });

  it('syncWorkDayEnd is awaitable and returns ok/error result', () => {
    const src = read('src/services/workdayServerSync.ts');
    expect(src).toMatch(/export\s+async\s+function\s+syncWorkDayEnd\([^)]*\):\s*Promise<WorkDayEndResult>/);
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

  it('useWorkDay exposes ensureActive + restore as part of the public API', () => {
    const src = read('src/hooks/useWorkDay.ts');
    expect(src).toMatch(/ensureActive:\s*\(startedAtIso\?:\s*string\)\s*=>\s*Promise/);
    expect(src).toMatch(/restore:\s*\(\)\s*=>\s*Promise<void>/);
    // Must de-dupe concurrent ensureActive calls (in-flight ref).
    expect(src).toMatch(/inFlightEnsure/);
  });
});
