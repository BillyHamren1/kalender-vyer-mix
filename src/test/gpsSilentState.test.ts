import { describe, it, expect } from 'vitest';
import { computeGpsSilentState } from '@/hooks/useBackgroundLocationReporter';

const NOW = 1_000_000_000_000;
const FIVE_MIN = 5 * 60_000;

describe('computeGpsSilentState', () => {
  it('returns ok when app is hidden (cannot determine silence)', () => {
    expect(
      computeGpsSilentState({
        appVisibilityState: 'hidden',
        lastNativeLocationEventAt: null,
        lastAcceptedUploadAt: null,
        now: NOW,
      }),
    ).toBe('ok');
  });

  it('returns ok when both signals are fresh', () => {
    expect(
      computeGpsSilentState({
        appVisibilityState: 'visible',
        lastNativeLocationEventAt: NOW - 60_000,
        lastAcceptedUploadAt: NOW - 60_000,
        now: NOW,
      }),
    ).toBe('ok');
  });

  it('flags native_silent when only native event is stale', () => {
    expect(
      computeGpsSilentState({
        appVisibilityState: 'visible',
        lastNativeLocationEventAt: NOW - FIVE_MIN - 1000,
        lastAcceptedUploadAt: NOW - 60_000,
        now: NOW,
      }),
    ).toBe('native_silent');
  });

  it('flags upload_silent when only upload is stale', () => {
    expect(
      computeGpsSilentState({
        appVisibilityState: 'visible',
        lastNativeLocationEventAt: NOW - 60_000,
        lastAcceptedUploadAt: NOW - FIVE_MIN - 1000,
        now: NOW,
      }),
    ).toBe('upload_silent');
  });

  it('flags native_and_upload_silent when both are stale or missing', () => {
    expect(
      computeGpsSilentState({
        appVisibilityState: 'visible',
        lastNativeLocationEventAt: null,
        lastAcceptedUploadAt: null,
        now: NOW,
      }),
    ).toBe('native_and_upload_silent');
  });
});
