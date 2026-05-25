import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka Capacitor till "native" så useEffect-grenen körs
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

const addListenerMock = vi.fn();
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: (...args: any[]) => {
      addListenerMock(...args);
      return Promise.resolve({ remove: vi.fn() });
    },
  },
}));

const getCurrentPositionMock = vi.fn().mockResolvedValue({
  coords: { latitude: 59.5, longitude: 17.8, accuracy: 10, speed: 0 },
});
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
    getCurrentPosition: (...args: any[]) => getCurrentPositionMock(...args),
  },
}));

const uploadLocationBatchMock = vi.fn().mockResolvedValue({ success: true, accepted: [], rejected: [], received: 1 });
vi.mock('@/services/mobileApiService', () => ({
  mobileApi: { uploadLocationBatch: (...args: any[]) => uploadLocationBatchMock(...args) },
}));

vi.mock('@/lib/mobile/getBatterySnapshot', () => ({
  getBatterySnapshot: vi.fn().mockResolvedValue({
    battery_level: 0.8, battery_percent: 80, is_charging: false,
    battery_captured_at: '2026-05-25T12:00:00.000Z', battery_source: 'capacitor_device',
  }),
}));

import { renderHook } from '@testing-library/react';
import { useGpsPulseHandler } from '../useGpsPulseHandler';

describe('useGpsPulseHandler', () => {
  beforeEach(() => {
    addListenerMock.mockClear();
    getCurrentPositionMock.mockClear();
    uploadLocationBatchMock.mockClear();
  });

  it('registrerar listener på pushNotificationReceived', () => {
    renderHook(() => useGpsPulseHandler());
    expect(addListenerMock).toHaveBeenCalledWith('pushNotificationReceived', expect.any(Function));
  });

  it('hämtar fix + postar batch när gps_pulse-data tas emot', async () => {
    renderHook(() => useGpsPulseHandler());
    const handler = addListenerMock.mock.calls[0][1] as (n: any) => void;
    handler({ data: { type: 'gps_pulse', issued_at: '2026-05-25T12:00:00.000Z' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
    expect(uploadLocationBatchMock).toHaveBeenCalledTimes(1);
    const points = uploadLocationBatchMock.mock.calls[0][0];
    expect(points[0]).toMatchObject({
      latitude: 59.5, longitude: 17.8, source: 'gps_pulse', batterySource: 'gps_pulse',
    });
  });

  it('ignorerar pushar utan type=gps_pulse', async () => {
    renderHook(() => useGpsPulseHandler());
    const handler = addListenerMock.mock.calls[0][1] as (n: any) => void;
    handler({ data: { type: 'message' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(uploadLocationBatchMock).not.toHaveBeenCalled();
  });
});
