import { describe, it, expect } from 'vitest';
import {
  computeAutoVisibleTeamsForDay,
  computeDefaultVisibleTeams,
  isRequiredTeam,
  REQUIRED_TEAM_IDS,
} from '../defaultVisibleTeams';

describe('defaultVisibleTeams', () => {
  it('inkluderar alla team + Lager + Transport som standard', () => {
    const resources = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `team-${i + 1}` })),
      { id: 'warehouse' },
      { id: 'logistics-transport' },
    ];
    const visible = computeDefaultVisibleTeams(resources as any);
    for (let i = 1; i <= 10; i++) expect(visible).toContain(`team-${i}`);
    expect(visible).toContain('warehouse');
    expect(visible).toContain('logistics-transport');
  });

  it('Lager och Transport finns alltid med i defaults', () => {
    expect(computeDefaultVisibleTeams([])).toEqual(expect.arrayContaining(['warehouse', 'logistics-transport']));
    expect(computeDefaultVisibleTeams(null)).toEqual(expect.arrayContaining(['warehouse', 'logistics-transport']));
  });

  it('inkluderar alltid obligatoriska team även med tom input', () => {
    const visible = computeDefaultVisibleTeams([]);
    for (const id of REQUIRED_TEAM_IDS) expect(visible).toContain(id);
  });

  it('hanterar null/undefined utan att krascha', () => {
    expect(() => computeDefaultVisibleTeams(null)).not.toThrow();
    expect(() => computeDefaultVisibleTeams(undefined)).not.toThrow();
  });

  it('isRequiredTeam täcker de fasta operativa kolumnerna', () => {
    expect(isRequiredTeam('team-1')).toBe(false);
    expect(isRequiredTeam('warehouse')).toBe(true);
    expect(isRequiredTeam('logistics-transport')).toBe(true);
    expect(isRequiredTeam('transport')).toBe(false);
  });

  it('visar Lager + Transport + team med jobb för dagen', () => {
    const resources = [
      { id: 'team-1' }, { id: 'team-2' }, { id: 'team-5' },
      { id: 'warehouse' }, { id: 'logistics-transport' },
    ];

    const visible = computeAutoVisibleTeamsForDay({
      resources: resources as any,
      events: [
        { resourceId: 'team-5', start: '2026-05-24T08:00:00.000Z' },
        { resourceId: 'team-2', start: '2026-05-24T10:00:00.000Z' },
      ] as any,
      date: new Date('2026-05-24T12:00:00.000Z'),
    });

    expect(visible).toEqual(['team-2', 'team-5', 'warehouse', 'logistics-transport']);
  });
});
