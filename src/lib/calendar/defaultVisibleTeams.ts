import { format } from 'date-fns';
import type { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';

/**
 * Always-visible team columns in the planning calendar. The user cannot
 * hide these via the team visibility popover.
 *
 * NOTE: `team-11` (the old "Live" column) is intentionally NOT required
 * — it has been deprecated, see useTeamResources.tsx.
 */
export const REQUIRED_TEAM_IDS: readonly string[] = [
  'transport',
];

export const isRequiredTeam = (teamId: string): boolean =>
  REQUIRED_TEAM_IDS.includes(teamId);

/**
 * Default set of visible team columns for a planning day.
 *
 * Includes EVERY team column that currently exists in `resources` plus the
 * always-visible Lager (`transport`) column.
 */
export const computeDefaultVisibleTeams = (
  resources: Pick<Resource, 'id'>[] | null | undefined,
): string[] => {
  const ids = new Set<string>(REQUIRED_TEAM_IDS);
  for (const r of resources ?? []) {
    if (!r?.id) continue;
    if (r.id === 'team-11') continue;
    ids.add(r.id);
  }
  return Array.from(ids);
};

const toDateKey = (value: CalendarEvent['start'] | string | Date | null | undefined): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (isoDate) return isoDate;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return format(parsed, 'yyyy-MM-dd');
};

export const computeAutoVisibleTeamsForDay = ({
  resources,
  events,
  date,
  persistedTeamIds,
}: {
  resources: Pick<Resource, 'id'>[] | null | undefined;
  events: Pick<CalendarEvent, 'resourceId' | 'start'>[] | null | undefined;
  date: Date | string;
  persistedTeamIds?: string[] | null | undefined;
}): string[] => {
  const dateKey = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const resourceIds = new Set(
    (resources ?? [])
      .map((resource) => resource?.id)
      .filter((id): id is string => Boolean(id) && id !== 'team-11'),
  );

  const includedIds = new Set<string>();

  for (const id of REQUIRED_TEAM_IDS) {
    if (resourceIds.has(id)) includedIds.add(id);
  }

  for (const event of events ?? []) {
    if (!event?.resourceId || !resourceIds.has(event.resourceId)) continue;
    if (toDateKey(event.start) !== dateKey) continue;
    includedIds.add(event.resourceId);
  }

  for (const id of persistedTeamIds ?? []) {
    if (!id || !resourceIds.has(id)) continue;
    includedIds.add(id);
  }

  return (resources ?? [])
    .map((resource) => resource?.id)
    .filter((id): id is string => Boolean(id) && id !== 'team-11' && includedIds.has(id));
};
