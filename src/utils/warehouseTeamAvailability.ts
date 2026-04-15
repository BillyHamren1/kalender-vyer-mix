import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';

/**
 * Distributes warehouse events across lager-1 … lager-N using the same
 * collision-avoidance + round-robin algorithm as the planning calendar.
 *
 * Events are processed chronologically. For each event the first lager
 * resource without a time overlap is selected. If all overlap, the lager
 * with the fewest events (lowest number breaks ties) is used.
 */
export const distributeWarehouseEvents = (
  events: CalendarEvent[],
  resources: Resource[]
): CalendarEvent[] => {
  const lagerResources = resources
    .filter(r => r.id.startsWith('lager-'))
    .sort((a, b) => {
      const aNum = parseInt(a.id.replace('lager-', '')) || 0;
      const bNum = parseInt(b.id.replace('lager-', '')) || 0;
      return aNum - bNum;
    });

  if (lagerResources.length === 0) return events;

  // Sort by start time so earlier events get placed first
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Track placed events per resource per day: Map<dateKey, Map<resourceId, intervals[]>>
  const placed = new Map<string, Map<string, { start: number; end: number }[]>>();

  const result: CalendarEvent[] = [];

  for (const event of sorted) {
    const evStart = new Date(event.start);
    const evEnd = new Date(event.end);
    const startMs = evStart.getTime();
    const endMs = evEnd.getTime();
    const dateKey = `${evStart.getUTCFullYear()}-${String(evStart.getUTCMonth() + 1).padStart(2, '0')}-${String(evStart.getUTCDate()).padStart(2, '0')}`;

    if (!placed.has(dateKey)) {
      placed.set(dateKey, new Map());
    }
    const dayMap = placed.get(dateKey)!;

    // Try to find a lager with no overlap
    let assignedId: string | null = null;

    for (const lager of lagerResources) {
      const intervals = dayMap.get(lager.id) || [];
      const hasOverlap = intervals.some(iv => startMs < iv.end && endMs > iv.start);
      if (!hasOverlap) {
        assignedId = lager.id;
        break;
      }
    }

    // Fallback: round-robin (fewest events, lowest number)
    if (!assignedId) {
      let minCount = Number.MAX_SAFE_INTEGER;
      for (const lager of lagerResources) {
        const count = (dayMap.get(lager.id) || []).length;
        if (count < minCount) {
          minCount = count;
          assignedId = lager.id;
        }
      }
    }

    if (!assignedId) assignedId = lagerResources[0].id;

    // Record the placement
    if (!dayMap.has(assignedId)) dayMap.set(assignedId, []);
    dayMap.get(assignedId)!.push({ start: startMs, end: endMs });

    result.push({ ...event, resourceId: assignedId });
  }

  return result;
};
