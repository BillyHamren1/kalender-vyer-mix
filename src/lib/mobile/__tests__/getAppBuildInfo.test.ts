import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAppBuildInfo, getAppBuildInfoSync, _resetAppBuildInfoCacheForTests } from '../getAppBuildInfo';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'web',
    isNativePlatform: () => false,
  },
}));

describe('getAppBuildInfo (web fallback)', () => {
  beforeEach(() => {
    _resetAppBuildInfoCacheForTests();
  });

  it('returns web platform without throwing when plugins are unavailable', async () => {
    const info = await getAppBuildInfo();
    expect(info.platform).toBe('web');
    expect(info.appVersion).toBeNull();
    expect(info.appBuild).toBeNull();
  });

  it('caches the result between calls', async () => {
    const first = await getAppBuildInfo();
    const second = await getAppBuildInfo();
    expect(second).toBe(first);
    expect(getAppBuildInfoSync()).toBe(first);
  });

  it('sync accessor returns null before first resolve', () => {
    _resetAppBuildInfoCacheForTests();
    expect(getAppBuildInfoSync()).toBeNull();
  });

  it('never throws even if navigator is missing', async () => {
    _resetAppBuildInfoCacheForTests();
    const originalNav = globalThis.navigator;
    // @ts-expect-error - simulate missing navigator
    delete globalThis.navigator;
    await expect(getAppBuildInfo()).resolves.toBeDefined();
    globalThis.navigator = originalNav;
  });
});
