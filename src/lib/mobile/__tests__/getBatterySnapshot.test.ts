import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mockable virtual module
vi.mock('@capacitor/device', () => ({
  Device: {
    getBatteryInfo: vi.fn(),
  },
}));

import { Device } from '@capacitor/device';
import { getBatterySnapshot } from '../getBatterySnapshot';

const getBatteryInfo = Device.getBatteryInfo as unknown as ReturnType<typeof vi.fn>;

describe('getBatterySnapshot', () => {
  beforeEach(() => {
    getBatteryInfo.mockReset();
  });

  it('returns level + percent + charging on success', async () => {
    getBatteryInfo.mockResolvedValue({ batteryLevel: 0.42, isCharging: true });
    const snap = await getBatterySnapshot();
    expect(snap.battery_level).toBe(0.42);
    expect(snap.battery_percent).toBe(42);
    expect(snap.is_charging).toBe(true);
    expect(snap.battery_source).toBe('capacitor_device');
    expect(typeof snap.battery_captured_at).toBe('string');
  });

  it('rounds percent from level', async () => {
    getBatteryInfo.mockResolvedValue({ batteryLevel: 0.876, isCharging: false });
    const snap = await getBatterySnapshot();
    expect(snap.battery_percent).toBe(88);
  });

  it('clamps out-of-range battery level', async () => {
    getBatteryInfo.mockResolvedValue({ batteryLevel: 1.7, isCharging: false });
    const snap = await getBatterySnapshot();
    expect(snap.battery_level).toBe(1);
    expect(snap.battery_percent).toBe(100);
  });

  it('returns unavailable when plugin has no signal', async () => {
    getBatteryInfo.mockResolvedValue({});
    const snap = await getBatterySnapshot();
    expect(snap.battery_source).toBe('unavailable');
    expect(snap.battery_level).toBeNull();
    expect(snap.battery_percent).toBeNull();
    expect(snap.is_charging).toBeNull();
  });

  it('returns error snapshot if plugin throws — never re-throws', async () => {
    getBatteryInfo.mockRejectedValue(new Error('boom'));
    const snap = await getBatterySnapshot();
    expect(snap.battery_source).toBe('error');
    expect(snap.battery_level).toBeNull();
  });
});
