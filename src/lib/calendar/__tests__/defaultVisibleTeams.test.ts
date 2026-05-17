import { describe, it, expect } from 'vitest';
import {
  computeAutoVisibleTeamsForDay,
  computeDefaultVisibleTeams,
  isRequiredTeam,
  REQUIRED_TEAM_IDS,
} from '../defaultVisibleTeams';

describe('defaultVisibleTeams', () => {
  it('inkluderar alla team + Lager (transport) som standard', () => {
    const resources = Array.from({ length: 10 }, (_, i) => ({ id: `team-${i + 1}` }));
    const visible = computeDefaultVisibleTeams(resources);
    for (let i = 1; i <= 10; i++) expect(visible).toContain(`team-${i}`);
    expect(visible).toContain('transport');
  });

  it('Lager (transport) finns alltid med i defaults', () => {
    expect(computeDefaultVisibleTeams([])).toContain('transport');
    expect(computeDefaultVisibleTeams(null)).toContain('transport');
    expect(computeDefaultVisibleTeams([{ id: 'team-1' }])).toContain('transport');
  });

  it('inkluderar alltid obligatoriska team även med tom input', () => {
    const visible = computeDefaultVisibleTeams([]);
    for (const id of REQUIRED_TEAM_IDS) {
      expect(visible).toContain(id);
    }
  });

  it('hanterar null/undefined utan att krascha', () => {
    expect(() => computeDefaultVisibleTeams(null)).not.toThrow();
    expect(() => computeDefaultVisibleTeams(undefined)).not.toThrow();
    expect(computeDefaultVisibleTeams(null)).toEqual(expect.arrayContaining([...REQUIRED_TEAM_IDS]));
  });

  it('isRequiredTeam täcker bara Lager (transport)', () => {
    expect(isRequiredTeam('team-1')).toBe(false);
    expect(isRequiredTeam('team-4')).toBe(false);
    expect(isRequiredTeam('transport')).toBe(true);
    expect(isRequiredTeam('team-5')).toBe(false);
    expect(isRequiredTeam('team-11')).toBe(false);
  });

  it('visar bara Lager + team med jobb för dagen utan scrollbehov', () => {
    const resources = [
      { id: 'team-1' },
      { id: 'team-2' },
      { id: 'team-3' },
      { id: 'team-4' },
      { id: 'team-5' },
      { id: 'transport' },
    ];

    const visible = computeAutoVisibleTeamsForDay({
      resources,
      events: [
        { resourceId: 'team-5', start: '2026-05-24T08:00:00.000Z' },
        { resourceId: 'team-2', start: '2026-05-24T10:00:00.000Z' },
        { resourceId: 'team-5', start: '2026-05-25T08:00:00.000Z' },
      ],
      date: new Date('2026-05-24T12:00:00.000Z'),
    });

    expect(visible).toEqual(['team-2', 'team-5', 'transport']);
  });

  it('bevarar manuellt påslagna team även om de saknar jobb den dagen', () => {
    const visible = computeAutoVisibleTeamsForDay({
      resources: [{ id: 'team-1' }, { id: 'team-5' }, { id: 'transport' }],
      events: [],
      date: '2026-05-24',
      persistedTeamIds: ['team-5'],
    });

    expect(visible).toEqual(['team-5', 'transport']);
  });
});
