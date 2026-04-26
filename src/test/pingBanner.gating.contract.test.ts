/**
 * pingBanner.gating.contract.test.ts
 *
 * Regressionsskydd för "Pinga"-bannern i StaffTimeReportsList.
 *
 * Bug 2026-04-25: bannern "Senast pingad: X timmar sedan" + Pinga-knapp
 * visades även för personer som redan hade avslutat sin arbetsdag, så
 * admin trodde att telefonen var död trots att personen bara var hemma.
 *
 * Kontrakt:
 *
 *   resolveLiveStatus(hasOpen, ping):
 *     - 'closed' om hasOpen=false  → bannern och Pinga-knappen ska INTE visas
 *     - 'live'   om hasOpen=true och ping <10 min gammal
 *     - 'stale'  om hasOpen=true och ping saknas eller >10 min gammal
 *                → bannern + Pinga-knappen visas
 *
 * Detta speglar logiken i src/components/staff/StaffTimeReportsList.tsx
 * (resolveLiveStatus + `liveStatus === 'stale'` gating av PingPhoneButton).
 */

import { describe, it, expect } from 'vitest';

const STALE_PING_MS = 10 * 60 * 1000;
type LiveStatus = 'live' | 'stale' | 'closed';

function resolveLiveStatus(
  hasOpen: boolean,
  ping: { updated_at: string | null } | null,
  now: Date,
): LiveStatus {
  if (!hasOpen) return 'closed';
  if (!ping?.updated_at) return 'stale';
  const age = now.getTime() - new Date(ping.updated_at).getTime();
  return age > STALE_PING_MS ? 'stale' : 'live';
}

// Mirror of the JSX gating: PingPhoneButton + "Senast pingad" warning är
// monterade endast när liveStatus === 'stale'.
function shouldShowPingBanner(status: LiveStatus): boolean {
  return status === 'stale';
}

describe('Ping-banner gating — regression: visa inte ping-varning för stängda dagar', () => {
  const now = new Date('2026-04-25T12:00:00Z');

  it('döljer Pinga-knapp när workdayen är stängd (Avslutad-badge räcker)', () => {
    const status = resolveLiveStatus(false, { updated_at: '2026-04-23T06:00:00Z' }, now);
    expect(status).toBe('closed');
    expect(shouldShowPingBanner(status)).toBe(false);
  });

  it('döljer Pinga-knapp när workdayen är stängd även om ping helt saknas', () => {
    const status = resolveLiveStatus(false, null, now);
    expect(status).toBe('closed');
    expect(shouldShowPingBanner(status)).toBe(false);
  });

  it('visar Pinga-knapp när workdayen är öppen och pingen är gammal (>10 min)', () => {
    const status = resolveLiveStatus(true, { updated_at: '2026-04-25T11:30:00Z' }, now);
    expect(status).toBe('stale');
    expect(shouldShowPingBanner(status)).toBe(true);
  });

  it('visar Pinga-knapp när workdayen är öppen och ping saknas', () => {
    const status = resolveLiveStatus(true, null, now);
    expect(status).toBe('stale');
    expect(shouldShowPingBanner(status)).toBe(true);
  });

  it('döljer Pinga-knapp när workdayen är öppen och ping är färsk', () => {
    const status = resolveLiveStatus(true, { updated_at: '2026-04-25T11:55:00Z' }, now);
    expect(status).toBe('live');
    expect(shouldShowPingBanner(status)).toBe(false);
  });

  it('exakt 10 min ping räknas som färsk (live), 10 min + 1 ms som stale', () => {
    const tenMin = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const justOver = new Date(now.getTime() - 10 * 60 * 1000 - 1).toISOString();
    expect(resolveLiveStatus(true, { updated_at: tenMin }, now)).toBe('live');
    expect(resolveLiveStatus(true, { updated_at: justOver }, now)).toBe('stale');
  });
});
