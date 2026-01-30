
# Plan: Visa 4 team som standard

## Sammanfattning
Ändra standardvisningen från 5 team (Team 1-5) till 4 team (Team 1-4). Team 5 kommer inte längre vara ett obligatoriskt team och visas inte som standard.

## Ändringar

### 1. CalendarPage.tsx
- Ändra `defaultTeams` från `['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-11']` till `['team-1', 'team-2', 'team-3', 'team-4', 'team-11']`
- Uppdatera kontrollen som förhindrar att team göms

### 2. CustomCalendarPage.tsx  
- Ändra standardteamlistan på två ställen
- Uppdatera kontrollen för vilka team som inte kan döljas

### 3. WarehouseCalendarPage.tsx
- Ändra standardteamlistan på tre ställen

### 4. TeamVisibilityControl.tsx
- Uppdatera listan över obligatoriska team (ta bort 'team-5')

### 5. useTeamResources.tsx
- Uppdatera listan över team som inte kan tas bort

### 6. DayDropZone.tsx
- Uppdatera listan över team som visas

---

## Tekniska detaljer

Alla instanser av `['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-11']` ändras till `['team-1', 'team-2', 'team-3', 'team-4', 'team-11']`.

Detta påverkar:
- Standardvisning av team i kalendern
- Vilka team som är obligatoriska och inte kan döljas
- Vilka team som visas i planeringsvyn
