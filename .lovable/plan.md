

## Team Assignment: Time-Overlap-First Distribution

### Current Behavior
`getNextTeamAssignment()` counts events per team on the same date and picks the team with the fewest. It ignores whether the events actually overlap in time — so two jobs at 08:00 and 18:00 both "compete" unnecessarily.

### New Logic

1. Query all existing `rig`/`rigDown` events on the same date for teams 1-5
2. Filter to only events that **overlap** with the new event's time range
3. Find the first team (team-1 → team-5) with **no time overlap**
4. If all teams have overlaps, fall back to the team with the **fewest overlapping events**

### Implementation

**File: `supabase/functions/import-bookings/index.ts`** — replace `getNextTeamAssignment` function (~lines 1009-1068)

```typescript
const getNextTeamAssignment = async (
  supabase, eventType, eventDate, bookingId, organizationId,
  startTime?: string, endTime?: string
): Promise<string> => {
  if (eventType === 'event') return 'team-11';

  const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];

  // Fetch all events on same date for these teams
  const { data: existingEvents } = await supabase
    .from('calendar_events')
    .select('resource_id, start_time, end_time')
    .eq('organization_id', organizationId)
    .in('resource_id', teams)
    .gte('start_time', `${eventDate}T00:00:00`)
    .lt('start_time', `${eventDate}T23:59:59`);

  // Build overlap counts per team
  const overlapCounts = new Map(teams.map(t => [t, 0]));
  const newStart = startTime ? new Date(startTime) : null;
  const newEnd = endTime ? new Date(endTime) : null;

  existingEvents?.forEach(ev => {
    if (!newStart || !newEnd) {
      // No time info — count all events (fall back to current logic)
      overlapCounts.set(ev.resource_id, (overlapCounts.get(ev.resource_id) || 0) + 1);
    } else {
      const evStart = new Date(ev.start_time);
      const evEnd = new Date(ev.end_time);
      if (newStart < evEnd && newEnd > evStart) {
        overlapCounts.set(ev.resource_id, (overlapCounts.get(ev.resource_id) || 0) + 1);
      }
    }
  });

  // Pick first team with zero overlaps
  for (const team of teams) {
    if (overlapCounts.get(team) === 0) return team;
  }

  // All have overlaps — pick team with fewest
  let minTeam = teams[0], minCount = overlapCounts.get(teams[0])!;
  for (const team of teams) {
    if (overlapCounts.get(team)! < minCount) {
      minCount = overlapCounts.get(team)!;
      minTeam = team;
    }
  }
  return minTeam;
};
```

Also update the **call site** (~line 868) to pass start/end times from the desired event:
```typescript
const assignedTeam = await getNextTeamAssignment(
  supabase, desired.event_type, desired.date,
  bookingData.id, bookingData.organization_id || organizationId,
  desired.start_time, desired.end_time  // ← new args
);
```

### Result
- Jobs at different times on the same day will spread across teams without "competing"
- Jobs at the same time will be placed on different teams (side-by-side in the calendar)
- Only when all 5 teams have time collisions does the system fall back to least-overlapping

