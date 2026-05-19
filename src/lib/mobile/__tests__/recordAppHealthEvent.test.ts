import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
    },
  },
}));
vi.mock('@/lib/mobile/getBatterySnapshot', () => ({
  getBatterySnapshot: vi.fn(async () => ({
    battery_level: 0.42,
    battery_percent: 42,
    is_charging: false,
    battery_captured_at: new Date().toISOString(),
    battery_source: 'capacitor_device',
  })),
}));
vi.mock('@/services/appMeta', () => ({
  getAppMeta: vi.fn(async () => ({ app_version: '1.2.3', app_platform: 'ios' })),
}));
vi.mock('@/lib/mobile/getAppBuildInfo', () => ({
  getAppBuildInfo: vi.fn(async () => ({
    appVersion: '1.2.3',
    appBuild: '1',
    platform: 'ios',
    osVersion: '17.0',
    deviceModel: 'iPhone15,2',
    appId: 'app.lovable.test',
  })),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
}));

import { recordAppHealthEvent } from '../recordAppHealthEvent';
import { supabase } from '@/integrations/supabase/client';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe('recordAppHealthEvent', () => {
  beforeEach(() => invoke.mockClear());

  it('returns ok:false and does not invoke when ctx is missing', async () => {
    const r = await recordAppHealthEvent({
      organizationId: '',
      staffId: '',
      eventType: 'app_start',
    });
    expect(r.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes edge function with battery + app meta', async () => {
    const r = await recordAppHealthEvent({
      organizationId: 'org-1',
      staffId: 'staff-1',
      eventType: 'workday_timer_started',
    });
    expect(r.ok).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('record-staff-app-health-event');
    expect(opts.body.organizationId).toBe('org-1');
    expect(opts.body.staffId).toBe('staff-1');
    expect(opts.body.eventType).toBe('workday_timer_started');
    expect(opts.body.batteryPercent).toBe(42);
    expect(opts.body.isCharging).toBe(false);
    expect(opts.body.appVersion).toBe('1.2.3');
    expect(opts.body.platform).toBe('ios');
  });

  it('soft-fails when invoke throws and never re-throws', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    const r = await recordAppHealthEvent({
      organizationId: 'org-1',
      staffId: 'staff-1',
      eventType: 'app_background',
      skipBattery: true,
    });
    expect(r.ok).toBe(false);
  });
});
