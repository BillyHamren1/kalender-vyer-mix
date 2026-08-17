/**
 * Skydd mot buggen "personal syns inte i personalkalendern i min profil,
 * men fungerar i inkognito".
 *
 * Två orsaker täcks:
 *  1. Team med personal men utan bokning måste vara synligt.
 *  2. Trasig/gammal `calendarResources` i localStorage måste läka.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { computeAutoVisibleTeamsForDay } from '../defaultVisibleTeams';
import {
  loadResourcesFromStorage,
  saveResourcesToStorage,
  resetCalendarViewStorage,
  RESOURCES_STORAGE_KEY,
  RESOURCES_STORAGE_VERSION_KEY,
  RESOURCES_STORAGE_VERSION,
} from '@/components/Calendar/ResourceData';

const resources = [
  { id: 'team-1' },
  { id: 'team-2' },
  { id: 'team-7' },
  { id: 'transport' },
];

describe('computeAutoVisibleTeamsForDay – personal gör kolumn synlig', () => {
  it('visar team som har personal även utan bokning den dagen', () => {
    const visible = computeAutoVisibleTeamsForDay({
      resources,
      events: [],
      date: '2026-08-17',
      staffTeamIdsForDay: ['team-7'],
    });
    expect(visible).toContain('team-7');
  });

  it('visar fortfarande team med bokning', () => {
    const visible = computeAutoVisibleTeamsForDay({
      resources,
      events: [{ resourceId: 'team-2', start: '2026-08-17T08:00:00' } as any],
      date: '2026-08-17',
    });
    expect(visible).toContain('team-2');
  });

  it('ignorerar personal på team som inte finns som kolumn', () => {
    const visible = computeAutoVisibleTeamsForDay({
      resources,
      events: [],
      date: '2026-08-17',
      staffTeamIdsForDay: ['team-9'],
    });
    expect(visible).not.toContain('team-9');
  });
});

describe('calendarResources – självläkande lagring', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('kastar gammal oversionerad cache (engångsmigrering)', () => {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify([{ id: 'team-1', title: 'Team 1' }]));
    expect(loadResourcesFromStorage()).toEqual([]);
    expect(localStorage.getItem(RESOURCES_STORAGE_VERSION_KEY)).toBe(RESOURCES_STORAGE_VERSION);
  });

  it('returnerar tom lista vid korrupt JSON', () => {
    localStorage.setItem(RESOURCES_STORAGE_VERSION_KEY, RESOURCES_STORAGE_VERSION);
    localStorage.setItem(RESOURCES_STORAGE_KEY, '{trasig');
    expect(loadResourcesFromStorage()).toEqual([]);
  });

  it('filtrerar bort ogiltiga poster', () => {
    saveResourcesToStorage([
      { id: 'team-1', title: 'Team 1' } as any,
      { title: 'utan id' } as any,
      null as any,
    ]);
    expect(loadResourcesFromStorage()).toEqual([{ id: 'team-1', title: 'Team 1' }]);
  });

  it('resetCalendarViewStorage rensar både kolumner och synlighet', () => {
    saveResourcesToStorage([{ id: 'team-1', title: 'Team 1' } as any]);
    localStorage.setItem('visibleTeamsByDay', JSON.stringify({ '2026-08-17': ['team-1'] }));
    resetCalendarViewStorage();
    expect(localStorage.getItem(RESOURCES_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('visibleTeamsByDay')).toBeNull();
  });
});
