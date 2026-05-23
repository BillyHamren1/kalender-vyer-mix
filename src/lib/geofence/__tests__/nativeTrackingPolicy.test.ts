import { describe, expect, it } from 'vitest';
import {
  ALWAYS_ON_NATIVE_DISTANCE_FILTER,
  resolveAppliedTrackingDistanceFilter,
} from '../nativeTrackingPolicy';

describe('nativeTrackingPolicy', () => {
  it('forces always-on native capture regardless of desired distanceFilter', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 500, isNativePlatform: true }))
      .toBe(ALWAYS_ON_NATIVE_DISTANCE_FILTER);
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 20, isNativePlatform: true }))
      .toBe(ALWAYS_ON_NATIVE_DISTANCE_FILTER);
  });

  it('keeps desired filter outside native platforms', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 35, isNativePlatform: false })).toBe(35);
  });
});