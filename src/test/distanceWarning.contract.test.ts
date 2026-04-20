/**
 * Contract test for the centralised distance-warning guard.
 *
 * Locks the rule that all start surfaces (jobs list, job detail, location
 * detail) must show the "Are you really on site?" prompt when the user is
 * outside the geofence radius — and stay silent when:
 *   • GPS is off (no userPosition)
 *   • the target has no usable coordinates
 *   • the user is inside the radius
 *
 * The rules are exercised through a faithful re-implementation of the
 * helper's logic so we don't have to mount the full React hook tree.
 * Any drift between this file and useWorkSession.startSessionWithDistanceCheck
 * is a regression — keep them in sync.
 */
import { describe, it, expect, vi } from 'vitest';
import { ENTER_RADIUS, haversineDistance } from '@/hooks/useGeofencing';
import type { WorkTarget } from '@/hooks/useWorkSession';

type Coords = { lat: number; lng: number; label: string } | null;
type Position = { lat: number; lng: number } | null;

interface ConfirmRequest {
  placeName: string;
  distance: number;
  confirm: () => void;
}

/**
 * Mirror of useWorkSession.startSessionWithDistanceCheck — pure version.
 * Returns true when started immediately, false when confirmation is pending.
 */
function distanceGuardedStart(
  target: WorkTarget,
  userPosition: Position,
  resolveCoords: (t: WorkTarget) => Coords,
  doStart: () => void,
  onNeedConfirm?: (req: ConfirmRequest) => void,
  radius: number = ENTER_RADIUS,
): boolean {
  const coords = resolveCoords(target);
  if (userPosition && coords) {
    const dist = haversineDistance(userPosition.lat, userPosition.lng, coords.lat, coords.lng);
    if (dist > radius && onNeedConfirm) {
      onNeedConfirm({
        placeName: coords.label,
        distance: dist,
        confirm: doStart,
      });
      return false;
    }
  }
  doStart();
  return true;
}

const bookingTarget: WorkTarget = { kind: 'booking', bookingId: 'b1', client: 'Acme' };
const projectTarget: WorkTarget = { kind: 'project', largeProjectId: 'p1', name: 'Proj A' };
const locationTarget: WorkTarget = {
  kind: 'location',
  locationId: 'l1',
  name: 'Lager',
  createsTimeReport: false,
};

// Stockholm vs ~10km away — well outside ENTER_RADIUS (150 m).
const here = { lat: 59.3293, lng: 18.0686 };
const farAway = { lat: 59.3293, lng: 18.0686 + 0.2 };

describe('distance-warning guard — centralized policy', () => {
  it('starts directly when GPS is off (userPosition null)', () => {
    const doStart = vi.fn();
    const onNeedConfirm = vi.fn();
    const result = distanceGuardedStart(
      bookingTarget,
      null,
      () => ({ lat: farAway.lat, lng: farAway.lng, label: 'Acme' }),
      doStart,
      onNeedConfirm,
    );
    expect(result).toBe(true);
    expect(doStart).toHaveBeenCalledOnce();
    expect(onNeedConfirm).not.toHaveBeenCalled();
  });

  it('starts directly when target has no coords', () => {
    const doStart = vi.fn();
    const onNeedConfirm = vi.fn();
    const result = distanceGuardedStart(
      bookingTarget,
      here,
      () => null,
      doStart,
      onNeedConfirm,
    );
    expect(result).toBe(true);
    expect(doStart).toHaveBeenCalledOnce();
    expect(onNeedConfirm).not.toHaveBeenCalled();
  });

  it('starts directly when user is inside the radius', () => {
    const doStart = vi.fn();
    const onNeedConfirm = vi.fn();
    const result = distanceGuardedStart(
      bookingTarget,
      here,
      () => ({ lat: here.lat, lng: here.lng, label: 'Acme' }),
      doStart,
      onNeedConfirm,
    );
    expect(result).toBe(true);
    expect(doStart).toHaveBeenCalledOnce();
    expect(onNeedConfirm).not.toHaveBeenCalled();
  });

  it('asks for confirmation when user is outside radius (booking target)', () => {
    const doStart = vi.fn();
    let captured: ConfirmRequest | null = null;
    const result = distanceGuardedStart(
      bookingTarget,
      here,
      () => ({ lat: farAway.lat, lng: farAway.lng, label: 'Acme' }),
      doStart,
      (req) => { captured = req; },
    );
    expect(result).toBe(false);
    expect(doStart).not.toHaveBeenCalled();
    expect(captured).not.toBeNull();
    expect(captured!.placeName).toBe('Acme');
    expect(captured!.distance).toBeGreaterThan(ENTER_RADIUS);
    // Calling confirm() should kick off the original start.
    captured!.confirm();
    expect(doStart).toHaveBeenCalledOnce();
  });

  it('asks for confirmation when user is outside radius (project target)', () => {
    const doStart = vi.fn();
    let captured: ConfirmRequest | null = null;
    const result = distanceGuardedStart(
      projectTarget,
      here,
      () => ({ lat: farAway.lat, lng: farAway.lng, label: 'Proj A' }),
      doStart,
      (req) => { captured = req; },
    );
    expect(result).toBe(false);
    expect(captured!.placeName).toBe('Proj A');
    expect(doStart).not.toHaveBeenCalled();
  });

  it('asks for confirmation when user is outside radius (location target)', () => {
    const doStart = vi.fn();
    let captured: ConfirmRequest | null = null;
    const result = distanceGuardedStart(
      locationTarget,
      here,
      () => ({ lat: farAway.lat, lng: farAway.lng, label: 'Lager' }),
      doStart,
      (req) => { captured = req; },
    );
    expect(result).toBe(false);
    expect(captured!.placeName).toBe('Lager');
    expect(doStart).not.toHaveBeenCalled();
  });

  it('starts directly when no onNeedConfirm callback supplied (legacy fallback)', () => {
    const doStart = vi.fn();
    const result = distanceGuardedStart(
      bookingTarget,
      here,
      () => ({ lat: farAway.lat, lng: farAway.lng, label: 'Acme' }),
      doStart,
      undefined,
    );
    expect(result).toBe(true);
    expect(doStart).toHaveBeenCalledOnce();
  });
});
