// @vitest-environment happy-dom
/**
 * Verkliga tester för useStaleDayReminder:
 *   • visar toast när tidigare dag har needs_review (gårdagen)
 *   • visar INTE toast när bara dagens dag är ofärdig
 *   • throttlas via localStorage
 *   • re-checkar på 'workday-ended'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  listWorkdaysReview: vi.fn(),
  navigate: vi.fn(),
  toastFn: vi.fn(),
}));
const { listWorkdaysReview, navigate, toastFn } = mocks;

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: { listWorkdaysReview: mocks.listWorkdaysReview },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toastFn, {
    success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), warning: vi.fn(),
  }),
}));

import { useStaleDayReminder } from '@/hooks/useStaleDayReminder';

const todayKey = () => new Date().toISOString().slice(0, 10);
const yesterdayKey = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// Mount-delay i hooken är 2500ms; vi väntar lite extra med riktiga timers.
const flushMountDelay = () => new Promise((r) => setTimeout(r, 2700));

describe('useStaleDayReminder', () => {
  it('visar toast när gårdagen är needs_review', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [
        { id: 'wd-y', day_key: yesterdayKey(), review_status: 'needs_review' },
      ],
    });

    renderHook(() => useStaleDayReminder(true));
    await flushMountDelay();
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    expect(toastFn.mock.calls[0][0]).toMatch(/Gårdagen är inte avstämd/);
  });

  it('visar INGEN toast när bara dagens dag är needs_review', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [
        { id: 'wd-t', day_key: todayKey(), review_status: 'needs_review' },
      ],
    });

    renderHook(() => useStaleDayReminder(true));
    await flushMountDelay();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('visar INGEN toast när allt är ready', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [
        { id: 'wd-y', day_key: yesterdayKey(), review_status: 'ready' },
      ],
    });

    renderHook(() => useStaleDayReminder(true));
    await flushMountDelay();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('throttlas: ingen ny toast om samma dag redan visats nyss', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [
        { id: 'wd-y', day_key: yesterdayKey(), review_status: 'needs_review' },
      ],
    });

    // Skriv färsk throttle-stämpel för gårdagen.
    localStorage.setItem(
      'eventflow-stale-day-reminder-shown',
      JSON.stringify({ dayKey: yesterdayKey(), shownAtIso: new Date().toISOString() }),
    );

    renderHook(() => useStaleDayReminder(true));
    await flushMountDelay();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('re-checkar vid workday-ended event', async () => {
    listWorkdaysReview.mockResolvedValue({ workdays: [] });

    renderHook(() => useStaleDayReminder(true));
    await flushMountDelay();
    expect(listWorkdaysReview).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('workday-ended'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(listWorkdaysReview).toHaveBeenCalledTimes(2);
  });

  it('är inaktiv när enabled=false', async () => {
    renderHook(() => useStaleDayReminder(false));
    await flushMountDelay();
    expect(listWorkdaysReview).not.toHaveBeenCalled();
  });
});
