import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockGetToken = vi.fn();
const mockGetViewAsStaffId = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock('@/services/mobileApiService', () => ({
  getToken: mockGetToken,
}));

vi.mock('@/services/viewAsStorage', () => ({
  getViewAsStaffId: mockGetViewAsStaffId,
}));

vi.mock('@/config/appMode', () => ({
  isWebApp: true,
}));

describe('staffSnapshotApi', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGetToken.mockReset();
    mockGetViewAsStaffId.mockReset();
    mockGetToken.mockReturnValue(null);
    mockGetViewAsStaffId.mockReturnValue(null);
  });

  it('maps 401 from supabase.functions.invoke to snapshot_unauthorized', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 401, statusText: 'Unauthorized' },
      },
    });

    const { callStaffSnapshotFunction } = await import('../staffSnapshotApi');

    await expect(
      callStaffSnapshotFunction('get-mobile-staff-day-report', {
        staffId: 'staff-1',
        date: '2026-05-22',
      }),
    ).rejects.toThrow('snapshot_unauthorized');
  });

  it('prefers Supabase JWT on web even if a mobile token exists', async () => {
    mockGetToken.mockReturnValue('stale-mobile-token');
    mockInvoke.mockResolvedValue({
      data: { ok: true },
      error: null,
    });

    const { callStaffSnapshotFunction } = await import('../staffSnapshotApi');

    await expect(
      callStaffSnapshotFunction('get-mobile-staff-day-pings', {
        staffId: 'staff-1',
        date: '2026-05-22',
      }),
    ).resolves.toEqual({ ok: true });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});