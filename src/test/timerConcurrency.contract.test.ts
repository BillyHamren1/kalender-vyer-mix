/**
 * Contract test for the rule-based timer concurrency engine.
 *
 * Locks the new policy that replaces the old "one timer total" block:
 *   • location + booking may run in parallel
 *   • location + project may run in parallel
 *   • booking ↔ booking → switch
 *   • project ↔ project → switch
 *   • booking ↔ project → switch
 *   • location ↔ location → switch
 *   • restarting the same target → duplicate (no-op)
 */
import { describe, it, expect } from 'vitest';
import { evaluateStartConflict } from '@/lib/timerConcurrency';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import type { WorkTarget } from '@/hooks/useWorkSession';

const t = (over: Partial<ActiveTimer>): ActiveTimer => ({
  bookingId: 'b1',
  client: 'Test',
  startTime: '2026-04-19T08:00:00.000Z',
  isAutoStarted: false,
  ...over,
});

const bookingTarget: WorkTarget = {
  kind: 'booking',
  bookingId: 'b1',
  client: 'Acme',
};
const otherBookingTarget: WorkTarget = {
  kind: 'booking',
  bookingId: 'b2',
  client: 'Other',
};
const projectTarget: WorkTarget = {
  kind: 'project',
  largeProjectId: 'p1',
  name: 'Proj A',
};
const otherProjectTarget: WorkTarget = {
  kind: 'project',
  largeProjectId: 'p2',
  name: 'Proj B',
};
const locationTarget: WorkTarget = {
  kind: 'location',
  locationId: 'l1',
  name: 'Lager',
  createsTimeReport: false,
};
const otherLocationTarget: WorkTarget = {
  kind: 'location',
  locationId: 'l2',
  name: 'Annat lager',
  createsTimeReport: false,
};

describe('evaluateStartConflict', () => {
  it('allows starting when no timers are active', () => {
    const empty = new Map<string, ActiveTimer>();
    expect(evaluateStartConflict(bookingTarget, empty).status).toBe('allow');
    expect(evaluateStartConflict(projectTarget, empty).status).toBe('allow');
    expect(evaluateStartConflict(locationTarget, empty).status).toBe('allow');
  });

  it('reports duplicate when re-starting the same booking', () => {
    const map = new Map<string, ActiveTimer>([['b1', t({ bookingId: 'b1' })]]);
    expect(evaluateStartConflict(bookingTarget, map).status).toBe('duplicate');
  });

  it('reports duplicate when re-starting the same project', () => {
    const map = new Map<string, ActiveTimer>([
      ['project-p1', t({ bookingId: 'project-p1', largeProjectId: 'p1' })],
    ]);
    expect(evaluateStartConflict(projectTarget, map).status).toBe('duplicate');
  });

  it('reports duplicate when re-starting the same location', () => {
    const map = new Map<string, ActiveTimer>([
      ['location-l1', t({ bookingId: 'location-l1', locationId: 'l1' })],
    ]);
    expect(evaluateStartConflict(locationTarget, map).status).toBe('duplicate');
  });

  it('allows location + booking to run in parallel', () => {
    const map = new Map<string, ActiveTimer>([['b1', t({ bookingId: 'b1' })]]);
    expect(evaluateStartConflict(locationTarget, map).status).toBe('allow');
  });

  it('allows location + project to run in parallel', () => {
    const map = new Map<string, ActiveTimer>([
      ['project-p1', t({ bookingId: 'project-p1', largeProjectId: 'p1' })],
    ]);
    expect(evaluateStartConflict(locationTarget, map).status).toBe('allow');
  });

  it('allows booking start while a location timer is running', () => {
    const map = new Map<string, ActiveTimer>([
      ['location-l1', t({ bookingId: 'location-l1', locationId: 'l1' })],
    ]);
    expect(evaluateStartConflict(bookingTarget, map).status).toBe('allow');
  });

  it('switches booking → booking', () => {
    const map = new Map<string, ActiveTimer>([
      ['b1', t({ bookingId: 'b1', client: 'Acme' })],
    ]);
    const res = evaluateStartConflict(otherBookingTarget, map);
    expect(res.status).toBe('switch');
    if (res.status === 'switch') {
      expect(res.reason).toBe('one_booking_at_a_time');
      expect(res.conflict.key).toBe('b1');
      expect(res.conflict.kind).toBe('booking');
    }
  });

  it('switches project → project', () => {
    const map = new Map<string, ActiveTimer>([
      [
        'project-p1',
        t({ bookingId: 'project-p1', largeProjectId: 'p1', client: 'Proj A' }),
      ],
    ]);
    const res = evaluateStartConflict(otherProjectTarget, map);
    expect(res.status).toBe('switch');
    if (res.status === 'switch') {
      expect(res.reason).toBe('one_project_at_a_time');
    }
  });

  it('switches booking ↔ project', () => {
    const bookingActive = new Map<string, ActiveTimer>([
      ['b1', t({ bookingId: 'b1' })],
    ]);
    const r1 = evaluateStartConflict(projectTarget, bookingActive);
    expect(r1.status).toBe('switch');
    if (r1.status === 'switch') expect(r1.reason).toBe('booking_vs_project');

    const projectActive = new Map<string, ActiveTimer>([
      ['project-p1', t({ bookingId: 'project-p1', largeProjectId: 'p1' })],
    ]);
    const r2 = evaluateStartConflict(bookingTarget, projectActive);
    expect(r2.status).toBe('switch');
    if (r2.status === 'switch') expect(r2.reason).toBe('booking_vs_project');
  });

  it('switches location → location', () => {
    const map = new Map<string, ActiveTimer>([
      [
        'location-l1',
        t({ bookingId: 'location-l1', locationId: 'l1', locationName: 'Lager' }),
      ],
    ]);
    const res = evaluateStartConflict(otherLocationTarget, map);
    expect(res.status).toBe('switch');
    if (res.status === 'switch') {
      expect(res.reason).toBe('one_location_at_a_time');
      expect(res.conflict.label).toBe('Lager');
    }
  });

  it('finds the booking conflict even when a location timer is also running', () => {
    const map = new Map<string, ActiveTimer>([
      ['location-l1', t({ bookingId: 'location-l1', locationId: 'l1' })],
      ['b1', t({ bookingId: 'b1', client: 'Acme' })],
    ]);
    const res = evaluateStartConflict(otherBookingTarget, map);
    expect(res.status).toBe('switch');
    if (res.status === 'switch') {
      expect(res.reason).toBe('one_booking_at_a_time');
      expect(res.conflict.kind).toBe('booking');
    }
  });
});
