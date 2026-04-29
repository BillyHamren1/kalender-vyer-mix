import { describe, it, expect } from 'vitest';
import { buildStaffDayJournal } from '../dayJournal';

describe('buildStaffDayJournal', () => {
  it('collapses presence-only LTEs and surfaces day-start from earliest workday', () => {
    const j = buildStaffDayJournal({
      reports: [],
      locationEntries: [
        { id: 'a', booking_id: null, large_project_id: null, location_id: 'loc1',
          entered_at: '2026-04-29T13:40:00Z', exited_at: '2026-04-29T13:41:00Z',
          hours: 0, label: 'FA Warehouse', isPresenceOnly: true },
        { id: 'b', booking_id: null, large_project_id: null, location_id: 'loc1',
          entered_at: '2026-04-29T13:42:00Z', exited_at: '2026-04-29T13:42:00Z',
          hours: 0, label: 'FA Warehouse', isPresenceOnly: true },
        { id: 'c', booking_id: null, large_project_id: null, location_id: 'loc1',
          entered_at: '2026-04-29T16:11:00Z', exited_at: '2026-04-29T16:20:00Z',
          hours: 0, label: 'FA Warehouse', isPresenceOnly: true },
      ],
      travel: [],
      workdays: [
        { id: 'w1', started_at: '2026-04-29T07:42:00Z', ended_at: '2026-04-29T16:20:00Z', admin_note: null },
      ],
      latestPing: { address: 'Storgatan 12', latitude: null, longitude: null, updated_at: null },
    });

    expect(j.sessions).toHaveLength(0); // presence-only filtered out
    expect(j.start.at).toBe('2026-04-29T07:42:00Z');
    expect(j.end.at).toBe('2026-04-29T16:20:00Z');
    expect(j.start.address).toBe('Storgatan 12');
  });

  it('merges multiple time_reports for the same booking into one session', () => {
    const j = buildStaffDayJournal({
      reports: [
        { id: 'r1', booking_id: 'B1', start_iso: '2026-04-29T08:00:00Z', end_iso: '2026-04-29T11:00:00Z', hours: 3 },
        { id: 'r2', booking_id: 'B1', start_iso: '2026-04-29T12:00:00Z', end_iso: '2026-04-29T16:00:00Z', hours: 4 },
      ],
      locationEntries: [
        { id: 'a', booking_id: 'B1', large_project_id: null, location_id: null,
          entered_at: '2026-04-29T08:00:00Z', exited_at: '2026-04-29T16:00:00Z',
          hours: 0, label: 'Nordic Event 2026', isPresenceOnly: false },
      ],
      travel: [],
      workdays: [],
      latestPing: null,
    });

    expect(j.sessions).toHaveLength(1);
    expect(j.sessions[0].label).toBe('Nordic Event 2026');
    expect(j.sessions[0].start).toBe('2026-04-29T08:00:00Z');
    expect(j.sessions[0].end).toBe('2026-04-29T16:00:00Z');
    expect(j.sessions[0].hours).toBe(7);
  });

  it('marks day end as null when at least one session is still open', () => {
    const j = buildStaffDayJournal({
      reports: [
        { id: 'r1', booking_id: 'B1', start_iso: '2026-04-29T08:00:00Z', end_iso: null, hours: 5 },
      ],
      locationEntries: [],
      travel: [],
      workdays: [{ id: 'w1', started_at: '2026-04-29T07:42:00Z', ended_at: null, admin_note: null }],
      latestPing: null,
    });

    expect(j.end.at).toBe(null);
    expect(j.end.isOpen).toBe(true);
    expect(j.start.at).toBe('2026-04-29T07:42:00Z');
  });

  it('falls back to first LTE when no workday exists', () => {
    const j = buildStaffDayJournal({
      reports: [],
      locationEntries: [
        { id: 'a', booking_id: null, large_project_id: null, location_id: 'loc1',
          entered_at: '2026-04-29T13:40:00Z', exited_at: '2026-04-29T16:20:00Z',
          hours: 0, label: 'FA Warehouse', isPresenceOnly: true },
      ],
      travel: [],
      workdays: [],
      latestPing: null,
    });

    expect(j.start.at).toBe('2026-04-29T13:40:00Z');
    expect(j.end.at).toBe('2026-04-29T16:20:00Z');
  });
});
