import { describe, expect, it } from 'vitest';
import {
  ALWAYS_ON_NATIVE_DISTANCE_FILTER,
  MIN_PRODUCTION_DISTANCE_FILTER,
  resolveAppliedTrackingDistanceFilter,
} from '../nativeTrackingPolicy';

describe('nativeTrackingPolicy', () => {
  it('clamps native distanceFilter to ALWAYS_ON ceiling so backend 500m never blinds the phone near home/warehouse', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 500, isNativePlatform: true }))
      .toBe(ALWAYS_ON_NATIVE_DISTANCE_FILTER);
  });

  it('lifts too-fine native distanceFilter up to production minimum (anti-DDoS)', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 20, isNativePlatform: true }))
      .toBe(MIN_PRODUCTION_DISTANCE_FILTER);
  });

  it('keeps 50m native as exactly 50m', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 50, isNativePlatform: true })).toBe(50);
  });

  it('falls back to ALWAYS_ON when desired is invalid on native', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: NaN, isNativePlatform: true }))
      .toBe(ALWAYS_ON_NATIVE_DISTANCE_FILTER);
  });

  it('keeps desired filter on web/non-native', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 35, isNativePlatform: false })).toBe(35);
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 500, isNativePlatform: false })).toBe(500);
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 0, isNativePlatform: false })).toBe(0);
  });

  it('ALWAYS_ON ceiling equals production minimum so native is effectively pinned at 50m', () => {
    expect(ALWAYS_ON_NATIVE_DISTANCE_FILTER).toBe(MIN_PRODUCTION_DISTANCE_FILTER);
  });
});
