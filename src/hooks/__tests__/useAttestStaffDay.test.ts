/**
 * useAttestStaffDay test — säkerställer att hooken anropar
 * submit-staff-day-v3 (inte gamla attest-staff-day) med rätt payload, och
 * dispatchar staff-day-attested + staff-day-submitted + timer-state-changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockCall = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock('@/services/staffSnapshotApi', () => ({
  callStaffSnapshotFunction: (name: string, body: Record<string, unknown>) =>
    mockCall(name, body),
}));

import { useAttestStaffDay } from '@/hooks/useAttestStaffDay';

describe('useAttestStaffDay', () => {
  beforeEach(() => {
    mockCall.mockClear();
  });

  it('anropar submit-staff-day-v3 med korrekt payload', async () => {
    const { result } = renderHook(() => useAttestStaffDay());
    await act(async () => {
      await result.current.attestDay({
        staffId: 'staff-1',
        date: '2026-05-15',
        breakMinutes: 30,
        comment: 'Manuell rapport',
        requestedStartAt: '2026-05-15T06:00:00.000Z',
        requestedEndAt: '2026-05-15T14:00:00.000Z',
      });
    });
    expect(mockCall).toHaveBeenCalledTimes(1);
    const [fnName, payload] = mockCall.mock.calls[0] as [string, any];
    expect(fnName).toBe('submit-staff-day-v3');
    expect(payload).toMatchObject({
      staffId: 'staff-1',
      date: '2026-05-15',
      breakMinutes: 30,
      comment: 'Manuell rapport',
      requestedStartAt: '2026-05-15T06:00:00.000Z',
      requestedEndAt: '2026-05-15T14:00:00.000Z',
    });
  });

  it('dispatchar staff-day-attested + staff-day-submitted + timer-state-changed', async () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener('staff-day-attested', handler);
    window.addEventListener('staff-day-submitted', handler);
    window.addEventListener('timer-state-changed', handler);

    const { result } = renderHook(() => useAttestStaffDay());
    await act(async () => {
      await result.current.attestDay({
        staffId: 'staff-2',
        date: '2026-05-16',
        breakMinutes: 0,
      });
    });

    window.removeEventListener('staff-day-attested', handler);
    window.removeEventListener('staff-day-submitted', handler);
    window.removeEventListener('timer-state-changed', handler);

    expect(events).toContain('staff-day-attested');
    expect(events).toContain('staff-day-submitted');
    expect(events).toContain('timer-state-changed');
  });

  it('validerar start < slut', async () => {
    const { result } = renderHook(() => useAttestStaffDay());
    await act(async () => {
      await expect(
        result.current.attestDay({
          staffId: 's',
          date: '2026-05-15',
          breakMinutes: 0,
          requestedStartAt: '2026-05-15T14:00:00.000Z',
          requestedEndAt: '2026-05-15T06:00:00.000Z',
        }),
      ).rejects.toThrow(/Starttid måste vara före sluttid/);
    });
    expect(mockCall).not.toHaveBeenCalled();
  });
});
