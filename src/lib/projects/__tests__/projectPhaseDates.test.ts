import { describe, it, expect } from 'vitest';
import { resolveProjectPhaseDates, classifyProjectLifecycle, projectStatusTabs } from '../../../../supabase/functions/_shared/projectPhaseDates';

describe('resolveProjectPhaseDates (shared by Operations web + mobile read)', () => {
  it('project own date wins per field, booking fills the rest', () => {
    const r = resolveProjectPhaseDates(
      { rigdaydate: '2026-10-12', eventdate: null, rigdowndate: '' },
      { rigdaydate: '2026-10-13', eventdate: '2026-10-14', rigdowndate: '2026-10-15' },
    );
    expect([r.rigdaydate, r.eventdate, r.rigdowndate]).toEqual(['2026-10-12', '2026-10-14', '2026-10-15']);
    expect(r.sources).toEqual({ rig: 'project', event: 'booking', derig: 'booking' });
  });

  it('project with only booking dates (20743f97 case) gets 13/14/15 Oct from booking', () => {
    const r = resolveProjectPhaseDates({ rigdaydate: null, eventdate: null, rigdowndate: null }, { rigdaydate: '2026-10-13', eventdate: '2026-10-14', rigdowndate: '2026-10-15' });
    expect([r.rigdaydate, r.eventdate, r.rigdowndate]).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
  });

  it('stays null when neither has a date, and with no booking (e.g. booking from another org not passed)', () => {
    expect(resolveProjectPhaseDates({ rigdaydate: null }, null)).toMatchObject({ rigdaydate: null, eventdate: null, rigdowndate: null, sources: { rig: null, event: null, derig: null } });
    expect(resolveProjectPhaseDates(null, { eventdate: null }).eventdate).toBeNull();
  });
});

describe('Operations status classification', () => {
  it('completed / cancelled / everything else active', () => {
    expect(classifyProjectLifecycle('completed')).toBe('completed');
    expect(classifyProjectLifecycle('cancelled')).toBe('cancelled');
    expect(classifyProjectLifecycle('planning')).toBe('active');
    expect(classifyProjectLifecycle(null)).toBe('active');
  });
  it('status tabs match the project list tabs', () => {
    expect(projectStatusTabs('planning', '2026-10-14', '2026-10-13')).toEqual(['all', 'all_active', 'planning']);
    expect(projectStatusTabs('planning', '2026-10-12', '2026-10-13')).toEqual(['all', 'all_active', 'planning', 'closing']);
    expect(projectStatusTabs('completed', '2026-10-01', '2026-10-13')).toEqual(['all', 'completed']);
    expect(projectStatusTabs('cancelled', null, '2026-10-13')).toEqual(['all', 'cancelled']);
  });
});

import { smallProjectView, largeProjectView } from '../../../../supabase/functions/_shared/projectPhaseDates';
describe('small/large kinds (same mapping as Operations list)', () => {
  it('small: planned -> planning, dates only from booking', () => {
    const v = smallProjectView({ status: 'planned' }, { rigdaydate: '2026-10-13', eventdate: '2026-10-14', rigdowndate: null });
    expect(v.status).toBe('planning');
    expect([v.dates.rigdaydate, v.dates.eventdate, v.dates.rigdowndate]).toEqual(['2026-10-13', '2026-10-14', null]);
    expect(v.listEventDate).toBe('2026-10-14');
    expect(smallProjectView({ status: 'planned' }, null).dates.eventdate).toBeNull();
  });
  it('large: own arrays only, list tab date = end ?? start', () => {
    const v = largeProjectView({ status: 'planning', start_date: ['2026-10-02'], event_date: null, end_date: ['2026-10-04'] });
    expect([v.dates.rigdaydate, v.dates.eventdate, v.dates.rigdowndate]).toEqual(['2026-10-02', null, '2026-10-04']);
    expect(v.listEventDate).toBe('2026-10-04');
    expect(largeProjectView({ status: 'planning' }).listEventDate).toBeNull();
  });
});
