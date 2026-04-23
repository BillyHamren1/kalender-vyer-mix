// @vitest-environment happy-dom
/**
 * Verkliga tester för useDayReviewActions:
 *   • event resolvas FÖRST efter lyckad start
 *   • event KVARSTÅR (ingen resolve) vid workday-failed/conflict/exception
 *   • dismissEvent → ignored_stale
 *   • approveWorkday anropar rätt API
 *
 * Vi mockar de centrala flödena (timer, work session, workday, mobileApi)
 * så att vi testar OUR orchestration, inte dem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mocks (måste ligga FÖRE import av hooken) ----------------------------
const mocks = vi.hoisted(() => ({
  tryStartFromArrival: vi.fn(),
  requestStart: vi.fn(),
  stopSession: vi.fn(),
  ensureActive: vi.fn(),
  endWorkDay: vi.fn(),
  syncWorkDayEnd: vi.fn(),
  resolveAssistantEvent: vi.fn(),
  approveWorkdayApi: vi.fn(),
  setTravelTimes: vi.fn(),
  createTravelLog: vi.fn(),
}));
const {
  tryStartFromArrival, requestStart, stopSession, ensureActive, endWorkDay,
  syncWorkDayEnd, resolveAssistantEvent, approveWorkdayApi, setTravelTimes, createTravelLog,
} = mocks;

vi.mock('@/hooks/useMobileData', () => ({ useMobileBookings: () => ({ data: [] }) }));
vi.mock('@/contexts/MobileAuthContext', () => ({
  useMobileAuth: () => ({ staff: { id: 'staff-1' } }),
}));
vi.mock('@/hooks/useTimerStartFlow', () => ({
  useTimerStartFlow: () => ({ tryStartFromArrival: mocks.tryStartFromArrival, requestStart: mocks.requestStart }),
}));
vi.mock('@/hooks/useWorkSession', () => ({
  useWorkSession: () => ({ stopSession: mocks.stopSession }),
}));
vi.mock('@/hooks/useWorkDay', () => ({
  useWorkDay: () => ({ ensureActive: mocks.ensureActive, end: mocks.endWorkDay, current: { id: 'wd-1' } }),
}));
vi.mock('@/services/workdayServerSync', () => ({ syncWorkDayEnd: mocks.syncWorkDayEnd }));
vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    assistantEvents: { resolve: mocks.resolveAssistantEvent },
    approveWorkday: mocks.approveWorkdayApi,
    setTravelTimes: mocks.setTravelTimes,
    createTravelLog: mocks.createTravelLog,
  },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), warning: vi.fn(),
  }),
}));

import { useDayReviewActions } from '@/hooks/useDayReviewActions';

const arrivalEvent = {
  id: 'ev-1',
  happened_at: '2026-04-22T07:30:00.000Z',
  event_type: 'arrival',
  target_label: 'Lager',
  target_type: 'location',
  target_id: 'loc-1',
  suggested_action: 'start',
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureActive.mockResolvedValue({ id: 'wd-1' });
  resolveAssistantEvent.mockResolvedValue({ ok: true });
});

describe('useDayReviewActions — resolve gates start outcome', () => {
  it('startWorkFromArrival: resolvar EVENT efter "started"', async () => {
    tryStartFromArrival.mockResolvedValue('started');
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkFromArrival(arrivalEvent as any);
    });

    expect(tryStartFromArrival).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'location', locationId: 'loc-1' }),
      { startedAtIso: arrivalEvent.happened_at },
    );
    expect(resolveAssistantEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'ev-1',
        resolution_status: 'applied_from_event_time',
      }),
    );
  });

  it('startWorkFromArrival: KVARSTÅR vid workday-failed', async () => {
    tryStartFromArrival.mockResolvedValue('workday-failed');
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkFromArrival(arrivalEvent as any);
    });

    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });

  it('startWorkFromArrival: KVARSTÅR vid conflict', async () => {
    tryStartFromArrival.mockResolvedValue('conflict');
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkFromArrival(arrivalEvent as any);
    });

    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });

  it('startWorkFromArrival: KVARSTÅR vid exception', async () => {
    tryStartFromArrival.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkFromArrival(arrivalEvent as any);
    });

    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });

  it('startWorkFromArrival: KVARSTÅR (loggar fel) om eventet saknar target', async () => {
    const { result } = renderHook(() => useDayReviewActions());
    await act(async () => {
      await result.current.startWorkFromArrival({
        ...arrivalEvent, target_type: undefined, target_id: undefined,
      } as any);
    });
    expect(tryStartFromArrival).not.toHaveBeenCalled();
    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });

  it('startWorkNow: resolvar med applied_from_now efter "started"', async () => {
    tryStartFromArrival.mockResolvedValue('started');
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkNow(arrivalEvent as any);
    });

    expect(tryStartFromArrival).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'location' }),
    );
    expect(resolveAssistantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resolution_status: 'applied_from_now' }),
    );
  });

  it('startWorkNow: KVARSTÅR vid workday-failed', async () => {
    tryStartFromArrival.mockResolvedValue('workday-failed');
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.startWorkNow(arrivalEvent as any);
    });

    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });
});

describe('useDayReviewActions — övriga actions', () => {
  it('endActivityAtDeparture: resolvar efter saved=true', async () => {
    stopSession.mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.endActivityAtDeparture({
        ...arrivalEvent, event_type: 'departure',
      } as any);
    });

    expect(stopSession).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'location' }),
      { stopAtIso: arrivalEvent.happened_at },
    );
    expect(resolveAssistantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resolution_status: 'applied_from_event_time' }),
    );
  });

  it('dismissEvent: skickar ignored_stale', async () => {
    const { result } = renderHook(() => useDayReviewActions());
    await act(async () => {
      await result.current.dismissEvent('ev-1', 'note');
    });
    expect(resolveAssistantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'ev-1', resolution_status: 'ignored_stale' }),
    );
  });

  it('approveWorkday: anropar mobileApi.approveWorkday', async () => {
    approveWorkdayApi.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.approveWorkday('wd-1');
    });

    expect(approveWorkdayApi).toHaveBeenCalledWith('wd-1');
  });

  it('endWorkDayAtHomeArrival: resolvar EFTER lyckad sync', async () => {
    syncWorkDayEnd.mockResolvedValue({ ok: true });
    endWorkDay.mockResolvedValue(null);
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.endWorkDayAtHomeArrival({
        ...arrivalEvent, event_type: 'home_arrival',
      } as any);
    });

    expect(syncWorkDayEnd).toHaveBeenCalledWith(arrivalEvent.happened_at);
    expect(resolveAssistantEvent).toHaveBeenCalled();
  });

  it('endWorkDayAtHomeArrival: KVARSTÅR vid sync-fel', async () => {
    syncWorkDayEnd.mockResolvedValue({ ok: false, error: 'boom' });
    const { result } = renderHook(() => useDayReviewActions());

    await act(async () => {
      await result.current.endWorkDayAtHomeArrival({
        ...arrivalEvent, event_type: 'home_arrival',
      } as any);
    });

    expect(resolveAssistantEvent).not.toHaveBeenCalled();
  });
});
