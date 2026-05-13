/**
 * single-timer-policy-v1 — KONTRAKTSTEST
 *
 * Mobilappen får ha EN timer: workday. Aktivitets-/projekt-/plats-/
 * bokningstimers får inte längre startas från klienten.
 *
 * Vi låser detta genom statisk inspektion av useTimerStartFlow.ts:
 *   - performStart MÅSTE returnera 'already_running' utan att anropa
 *     startSession(...).
 *   - Källkoden får inte längre ha en aktiv `startSession(target, ...)`-
 *     rad i performStart.
 *
 * Om en framtida ändring återinför aktivitetstimer-start kommer testet
 * att brytas direkt — exakt det vi vill.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../hooks/useTimerStartFlow.ts'),
  'utf8',
);

describe('single-timer-policy-v1', () => {
  it('performStart kallar inte startSession', () => {
    // Hitta performStart-blocket
    const idx = SRC.indexOf('const performStart');
    expect(idx).toBeGreaterThan(-1);
    // Vi tittar i hela filen — startSession får inte längre stå
    // som funktionsanrop någonstans i useTimerStartFlow.
    // (Importen av useWorkSession är OK; vi förbjuder anropsledet.)
    const callMatches = SRC.match(/\bstartSession\s*\(/g) ?? [];
    expect(
      callMatches.length,
      `useTimerStartFlow får inte längre anropa startSession(). Hittade ${callMatches.length} anrop.`,
    ).toBe(0);
  });

  it('performStart returnerar already_running som tyst single-timer-quench', () => {
    expect(SRC).toMatch(/SINGLE-TIMER POLICY/);
    expect(SRC).toMatch(/return 'already_running'/);
  });

  it('referensen single-timer-policy-v1 finns i koden', () => {
    expect(SRC).toMatch(/single-timer-policy-v1/);
  });
});
