import { describe, it, expect } from 'vitest';
import { deriveDayStatus } from '../dayStatus';
import type { StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';

const snap = (o: Partial<StaffDaySnapshot>): StaffDaySnapshot => ({
  date: '2026-05-17',
  workday: null,
  totals: {} as any,
  segments: [],
  ...o,
} as any);

describe('deriveDayStatus', () => {
  it('empty_day när inget finns', () => {
    expect(deriveDayStatus(snap({}))?.status).toBe('empty_day');
  });

  it('active_day när workday.isOpen=true', () => {
    const r = deriveDayStatus(
      snap({ workday: { isOpen: true, startedAt: 't', endedAt: null } as any }),
    );
    expect(r.status).toBe('active_day');
  });

  it('active_day när aktivt arbetsblock finns (även utan dagtimer)', () => {
    const r = deriveDayStatus(
      snap({
        segments: [{ kind: 'project', startedAt: 't', endedAt: null, isActive: true } as any],
      }),
    );
    expect(r.status).toBe('active_day');
    expect(r.debug.hasActiveWorkBlock).toBe(true);
  });

  it('Billy-case: projekt + transport båda slut, ingen submit → has_time_not_ended (INTE ended_day)', () => {
    const r = deriveDayStatus(
      snap({
        workday: {
          isOpen: false,
          startedAt: '2026-05-17T09:56:00Z',
          endedAt: '2026-05-17T12:40:00Z',
          reviewStatus: null,
          approved: false,
          durationMinutes: 164,
        } as any,
        segments: [
          { kind: 'project', startedAt: '2026-05-17T09:56:00Z', endedAt: '2026-05-17T12:21:00Z' } as any,
          { kind: 'travel', startedAt: '2026-05-17T12:22:00Z', endedAt: '2026-05-17T12:40:00Z' } as any,
        ],
      }),
    );
    expect(r.status).toBe('has_time_not_ended');
    expect(r.label).toBe('Tid registrerad');
    expect(r.debug.hasExplicitStoppedAt).toBe(false);
    expect(r.debug.lastSegmentKind).toBe('travel');
  });

  it('ended_day endast när dagen är approved/submitted', () => {
    const r = deriveDayStatus(
      snap({
        workday: {
          isOpen: false,
          startedAt: 't',
          endedAt: 't',
          reviewStatus: 'submitted',
          approved: false,
        } as any,
        segments: [{ kind: 'project', startedAt: 't', endedAt: 't' } as any],
      }),
    );
    expect(r.status).toBe('ended_day');
  });

  it('ended_day när approved=true', () => {
    const r = deriveDayStatus(
      snap({
        workday: { isOpen: false, startedAt: 't', endedAt: 't', approved: true } as any,
        segments: [{ kind: 'project', startedAt: 't', endedAt: 't' } as any],
      }),
    );
    expect(r.status).toBe('ended_day');
  });

  it('transport som sista segment avslutar INTE dagen', () => {
    const r = deriveDayStatus(
      snap({
        workday: { isOpen: false, startedAt: 't', endedAt: 't', approved: false } as any,
        segments: [
          { kind: 'project', startedAt: 'a', endedAt: 'b' } as any,
          { kind: 'travel', startedAt: 'b', endedAt: 'c' } as any,
        ],
      }),
    );
    expect(r.status).not.toBe('ended_day');
  });
});
