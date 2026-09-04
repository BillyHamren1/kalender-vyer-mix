import { describe, expect, it } from 'vitest';
import { buildPersonnelGanttItems } from '../personnelGantt';

const days = [new Date(2026, 5, 1, 12), new Date(2026, 5, 2, 12), new Date(2026, 5, 3, 12)];
const resources = [{ id: 'team-1', title: 'Team 1', eventColor: '#fff' }];

describe('buildPersonnelGanttItems', () => {
  it('projects existing team/day assignments onto the correct staff row', () => {
    const result = buildPersonnelGanttItems({
      days,
      resources,
      assignments: [
        { staffId: 'alice', staffName: 'Alice', teamId: 'team-1', date: '2026-06-01' },
      ],
      events: [
        { id: 'event-1', title: 'Sommarfest', start: '2026-06-01T08:00:00Z', end: '2026-06-01T16:00:00Z', resourceId: 'team-1', eventType: 'rig', bookingId: 'booking-1' },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      staffId: 'alice',
      teamId: 'team-1',
      title: 'Sommarfest',
      startIndex: 0,
      endIndex: 0,
      lane: 0,
    });
  });

  it('joins consecutive equal schedule blocks and separates overlaps into lanes', () => {
    const result = buildPersonnelGanttItems({
      days,
      resources,
      assignments: [
        { staffId: 'alice', staffName: 'Alice', teamId: 'team-1', date: '2026-06-01' },
        { staffId: 'alice', staffName: 'Alice', teamId: 'team-1', date: '2026-06-02' },
      ],
      events: [
        { id: 'event-1', title: 'Sommarfest', start: '2026-06-01T08:00:00Z', end: '2026-06-01T16:00:00Z', resourceId: 'team-1', eventType: 'rig', bookingId: 'booking-1' },
        { id: 'event-2', title: 'Sommarfest', start: '2026-06-02T08:00:00Z', end: '2026-06-02T16:00:00Z', resourceId: 'team-1', eventType: 'rig', bookingId: 'booking-1' },
        { id: 'event-3', title: 'Middag', start: '2026-06-01T10:00:00Z', end: '2026-06-01T18:00:00Z', resourceId: 'team-1', eventType: 'event', bookingId: 'booking-2' },
      ],
    });

    const summer = result.find(item => item.bookingId === 'booking-1');
    const dinner = result.find(item => item.bookingId === 'booking-2');
    expect(summer).toMatchObject({ startIndex: 0, endIndex: 1 });
    expect(dinner?.lane).not.toBe(summer?.lane);
  });

  it('does not turn activity rows into staffable booking blocks', () => {
    const result = buildPersonnelGanttItems({
      days,
      resources,
      assignments: [
        { staffId: 'alice', staffName: 'Alice', teamId: 'team-1', date: '2026-06-01' },
      ],
      events: [
        { id: 'activity-1', title: 'Intern aktivitet', start: '2026-06-01T08:00:00Z', end: '2026-06-01T09:00:00Z', resourceId: 'team-1', eventType: 'activity' as unknown as 'event' },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ eventType: 'assignment', title: 'Team 1' });
  });
});
