import { describe, it, expect } from 'vitest';
import {
  computeDefaultVisibleTeams,
  isRequiredTeam,
  REQUIRED_TEAM_IDS,
} from '../defaultVisibleTeams';

describe('defaultVisibleTeams', () => {
  it('inkluderar alla 10 team + transport som standard', () => {
    const resources = Array.from({ length: 10 }, (_, i) => ({ id: `team-${i + 1}` }));
    const visible = computeDefaultVisibleTeams(resources);
    for (let i = 1; i <= 10; i++) {
      expect(visible).toContain(`team-${i}`);
    }
    expect(visible).toContain('transport');
  });

  it('döljer ALDRIG Team 5–10 (regressionsskydd)', () => {
    const resources = [
      { id: 'team-1' }, { id: 'team-5' }, { id: 'team-7' }, { id: 'team-10' },
    ];
    const visible = computeDefaultVisibleTeams(resources);
    expect(visible).toContain('team-5');
    expect(visible).toContain('team-7');
    expect(visible).toContain('team-10');
  });

  it('filtrerar bort deprecated team-11 (Live)', () => {
    const visible = computeDefaultVisibleTeams([{ id: 'team-1' }, { id: 'team-11' }]);
    expect(visible).not.toContain('team-11');
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

  it('isRequiredTeam täcker team-1..4 + transport men INTE team-11 eller team-5+', () => {
    expect(isRequiredTeam('team-1')).toBe(true);
    expect(isRequiredTeam('team-4')).toBe(true);
    expect(isRequiredTeam('transport')).toBe(true);
    expect(isRequiredTeam('team-5')).toBe(false);
    expect(isRequiredTeam('team-11')).toBe(false);
  });
});
