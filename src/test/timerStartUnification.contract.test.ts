/**
 * Contract test — TIMER START UNIFICATION
 * ========================================
 *
 * Locks the architectural rule that ALL timer starts in the mobile app
 * must flow through `useTimerStartFlow.requestStart()`.
 *
 * Direct calls to `startTimer(` or `startSession(` from feature code
 * bypass `evaluateStartConflict` and the unified distance check, which
 * causes phantom timers and silent overlaps. This test fails the build
 * if any future PR re-introduces such a shortcut.
 *
 * Allow-list (files that legitimately call the raw start verbs):
 *   - src/hooks/useTimerStartFlow.ts        — calls startSession (the unifier)
 *   - src/hooks/useWorkSession.tsx          — wraps startTimer (engine internals)
 *   - src/hooks/useGeofencing.tsx           — defines startTimer
 *   - any *.test.ts(x)                      — tests may invoke directly
 *
 * Per-file overrides are documented inline below if needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

const ALLOWED_START_TIMER = new Set<string>([
  'src/hooks/useWorkSession.tsx',
  'src/hooks/useGeofencing.tsx',
  'src/hooks/useGeofencing.ts',
  // Documentation page that shows the API as a code example string.
  'src/pages/APIDocumentation.tsx',
]);

const ALLOWED_START_SESSION = new Set<string>([
  'src/hooks/useTimerStartFlow.ts',
  'src/hooks/useWorkSession.tsx',
  // Legacy stop/EOD surfaces that own their own non-start lifecycles can
  // be added here with a justification comment if they pop up.
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT);

describe('Timer start unification contract', () => {
  it('no feature code calls startTimer( directly', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(process.cwd(), f).replace(/\\/g, '/');
      if (ALLOWED_START_TIMER.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      // Strip comments to avoid false positives from explanatory text
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/[^\n]*/g, '$1');
      if (/\bstartTimer\s*\(/.test(stripped)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `These files call startTimer() directly. Route through useTimerStartFlow.requestStart() instead:\n  - ${offenders.join('\n  - ')}`,
    ).toEqual([]);
  });

  it('no feature code calls startSession( directly', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(process.cwd(), f).replace(/\\/g, '/');
      if (ALLOWED_START_SESSION.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/[^\n]*/g, '$1');
      if (/\bstartSession\s*\(/.test(stripped)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `These files call startSession() directly. Route through useTimerStartFlow.requestStart() instead:\n  - ${offenders.join('\n  - ')}`,
    ).toEqual([]);
  });
});
