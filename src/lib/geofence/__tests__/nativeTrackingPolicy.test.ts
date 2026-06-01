import { describe, expect, it } from 'vitest';
import {
  ALWAYS_ON_NATIVE_DISTANCE_FILTER,
  MAX_NATIVE_DISTANCE_FILTER,
  MIN_PRODUCTION_DISTANCE_FILTER,
  resolveAppliedTrackingDistanceFilter,
} from '../nativeTrackingPolicy';

describe('nativeTrackingPolicy', () => {
  it('clamps native desired down to MAX (75m) so backend 500m never blinds the phone near geofence', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 500, isNativePlatform: true }))
      .toBe(MAX_NATIVE_DISTANCE_FILTER);
  });

  it('keeps desired 20m on native (capture-policy inside geofence)', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 20, isNativePlatform: true })).toBe(20);
  });

  it('keeps desired 35m on native', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 35, isNativePlatform: true })).toBe(35);
  });

  it('keeps desired 50m on native', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 50, isNativePlatform: true })).toBe(50);
  });

  it('keeps desired 75m on native', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 75, isNativePlatform: true })).toBe(75);
  });

  it('lifts too-fine native (<20m) up to MIN_PRODUCTION_DISTANCE_FILTER', () => {
    expect(resolveAppliedTrackingDistanceFilter({ desiredDistanceFilter: 5, isNativePlatform: true }))
      .toBe(MIN_PRODUCTION_DISTANCE_FILTER);
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
});
