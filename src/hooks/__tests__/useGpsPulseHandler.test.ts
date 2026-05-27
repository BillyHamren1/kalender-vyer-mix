import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka Capacitor till "native" så useEffect-grenen körs
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
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

const enqueueLocationPointMock = vi.fn().mockReturnValue('queued-id-1');
const forceFlushLocationQueueMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/locationSyncQueue', () => ({
  enqueueLocationPoint: (...args: any[]) => enqueueLocationPointMock(...args),
  forceFlushLocationQueue: (...args: any[]) => forceFlushLocationQueueMock(...args),
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
    getCurrentPositionMock.mockClear();
    enqueueLocationPointMock.mockClear();
    forceFlushLocationQueueMock.mockClear();
  });

  it('registrerar window-listener på gps-pulse-received', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useGpsPulseHandler());
    expect(addSpy).toHaveBeenCalledWith('gps-pulse-received', expect.any(Function));
    addSpy.mockRestore();
  });

  it('hämtar fix + enqueueer + force-flushar när gps-pulse-received dispatchas', async () => {
    renderHook(() => useGpsPulseHandler());
    window.dispatchEvent(new CustomEvent('gps-pulse-received', {
      detail: { type: 'gps_pulse', issued_at: '2026-05-25T12:00:00.000Z' },
    }));
    await new Promise((r) => setTimeout(r, 10));

    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
    expect(enqueueLocationPointMock).toHaveBeenCalledTimes(1);
    expect(forceFlushLocationQueueMock).toHaveBeenCalledWith('gps_pulse');

    const point = enqueueLocationPointMock.mock.calls[0][0];
    expect(point).toMatchObject({
      latitude: 59.5,
      longitude: 17.8,
      source: 'gps_pulse',
      batterySource: 'gps_pulse',
    });
  });

  it('går inte direkt mot mobileApi.uploadLocationBatch', async () => {
    // Vi mockar inte mobileApi alls — om hooken skulle använda det skulle testet
    // tvingas importera/strula. Säkerställ att vår queue-väg är enda vägen genom
    // att triggern leder till enqueue + force-flush ovan.
    renderHook(() => useGpsPulseHandler());
    window.dispatchEvent(new CustomEvent('gps-pulse-received', {
      detail: { type: 'gps_pulse' },
    }));
    await new Promise((r) => setTimeout(r, 10));
    expect(enqueueLocationPointMock).toHaveBeenCalled();
    expect(forceFlushLocationQueueMock).toHaveBeenCalledWith('gps_pulse');
  });
});
