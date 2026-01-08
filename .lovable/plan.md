# Plan: Visa tillgänglig personal med korrekt availability-filtrering

## Problem
Funktionen `getStaffForPlanningDate` visar ALLA aktiva personal oavsett om de har en "available" period för datumet. Det korrekta beteendet är:

1. Visa endast personal som har en "available" period i `staff_availability` för det datumet
2. Men visa dem ÄVEN om de redan är tilldelade ett annat team den dagen (markera som "On Team X")
3. Personal utan availability-period för dagen ska INTE visas alls

## Orsak
I rad 396-400 i `getStaffForPlanningDate` hämtas alla aktiva staff direkt från `staff_members` utan att kontrollera `staff_availability`-tabellen.

## Lösning

### Fil: `src/hooks/useUnifiedStaffOperations.tsx`

Ändra `getStaffForPlanningDate` (rad 384-458) så att den:

1. **Hämtar availability-perioder för datumet** (samma logik som `getAvailableStaffForDate` rad 331-352)
   - Hämta alla perioder från `staff_availability` där `start_date <= date <= end_date`
   - Filtrera ut staff som har "available" period och INTE har "blocked"/"unavailable"

2. **Hämtar assignments för datumet** (behåll befintlig logik rad 408-420)
   - Kolla vilka som redan är tilldelade ett team

3. **Kombinera och returnera** staff med:
   - `assignmentStatus: 'free'` - har availability, inte assigned
   - `assignmentStatus: 'assigned_current_team'` - har availability, assigned till målteamet
   - `assignmentStatus: 'assigned_other_team'` - har availability, assigned till annat team

### Kodändring (ersätt rad 394-444):

```typescript
const getStaffForPlanningDate = useCallback(async (targetDate: Date, targetTeamId: string): Promise<Array<{
  id: string;
  name: string;
  color?: string;
  assignmentStatus: 'free' | 'assigned_current_team' | 'assigned_other_team';
  assignedTeamId?: string;
  assignedTeamName?: string;
}>> => {
  const dateStr = format(targetDate, 'yyyy-MM-dd');
  
  try {
    // 1. Get all active staff
    const { data: allStaff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name, color')
      .eq('is_active', true)
      .order('name');
    
    if (staffError || !allStaff) {
      console.error('Error fetching staff:', staffError);
      return [];
    }
    
    const staffIds = allStaff.map(s => s.id);
    
    // 2. Get availability periods for this date (CRITICAL FILTER)
    const { data: availabilityData, error: availError } = await supabase
      .from('staff_availability')
      .select('staff_id, availability_type')
      .in('staff_id', staffIds)
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);
    
    if (availError) {
      console.error('Error fetching availability:', availError);
      return [];
    }
    
    // 3. Determine which staff are available for this date
    const availableStaffIds = new Set<string>();
    const blockedStaffIds = new Set<string>();
    
    (availabilityData || []).forEach(period => {
      if (period.availability_type === 'available') {
        availableStaffIds.add(period.staff_id);
      } else if (period.availability_type === 'blocked' || period.availability_type === 'unavailable') {
        blockedStaffIds.add(period.staff_id);
      }
    });
    
    // Staff with availability = has 'available' period AND no 'blocked'/'unavailable' period
    const staffWithAvailability = allStaff.filter(staff => 
      availableStaffIds.has(staff.id) && !blockedStaffIds.has(staff.id)
    );
    
    // 4. Get assignments for this date (keep existing logic)
    const assignmentsForDate = assignments.filter(a => a.date === dateStr);
    
    const assignmentMap = new Map<string, { teamId: string; teamName: string }>();
    assignmentsForDate.forEach(a => {
      let teamName = a.teamId;
      if (a.teamId === 'team-11') {
        teamName = 'Live';
      } else if (a.teamId.startsWith('team-')) {
        teamName = 'Team ' + a.teamId.replace('team-', '');
      }
      assignmentMap.set(a.staffId, { teamId: a.teamId, teamName });
    });
    
    // 5. Build result - only staff WITH availability, but include assigned ones
    const result = staffWithAvailability.map(staff => {
      const assignment = assignmentMap.get(staff.id);
      
      let assignmentStatus: 'free' | 'assigned_current_team' | 'assigned_other_team' = 'free';
      if (assignment) {
        if (assignment.teamId === targetTeamId) {
          assignmentStatus = 'assigned_current_team';
        } else {
          assignmentStatus = 'assigned_other_team';
        }
      }
      
      return {
        id: staff.id,
        name: staff.name,
        color: staff.color || '#E3F2FD',
        assignmentStatus,
        assignedTeamId: assignment?.teamId,
        assignedTeamName: assignment?.teamName
      };
    });
    
    // 6. Sort: free first, then current team, then other team
    result.sort((a, b) => {
      const order = { 'free': 0, 'assigned_current_team': 1, 'assigned_other_team': 2 };
      return order[a.assignmentStatus] - order[b.assignmentStatus];
    });
    
    console.log(`[getStaffForPlanningDate] ${dateStr}: ${staffWithAvailability.length} with availability, ${result.filter(s => s.assignmentStatus === 'free').length} free`);
    return result;
  } catch (error) {
    console.error('Error in getStaffForPlanningDate:', error);
    return [];
  }
}, [assignments]);
```

## Resultat efter fix

### Scenario: 5 personal totalt, 3 har availability den dagen, alla 3 assigned till Team 1
- **Före (fel):** Visar alla 5 personal
- **Efter (korrekt):** Visar endast 3 personal, alla markerade "On Team 1"

### Scenario: 5 personal totalt, 3 har availability, 2 assigned till Team 1, 1 fri
- **Före (fel):** Visar alla 5 personal
- **Efter (korrekt):** Visar 3 personal - 1 "Free", 2 "On Team 1"

### Scenario: 0 personal har availability för dagen
- **Före (fel):** Visar alla 5 personal
- **Efter (korrekt):** Visar "No Staff Available" (listan är tom)

## Filer som ändras
- `src/hooks/useUnifiedStaffOperations.tsx` - Fixa `getStaffForPlanningDate` att filtrera på availability

## Critical Files for Implementation
- src/hooks/useUnifiedStaffOperations.tsx - Funktionen `getStaffForPlanningDate` rad 384-458 måste skrivas om
- src/services/staffAvailabilityService.ts - Referens för availability-logik (rad 163-233)
- src/components/Calendar/SimpleStaffCurtain.tsx - Ingen ändring behövs, tar emot korrekt data
