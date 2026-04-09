

## Plan: Skydda projekt från tyst radering + skapa saknat projekt

### Problem
1. Bokning 2603-126 har aldrig fått ett projekt skapat — den borde ha fångats i triage-listan
2. Det finns ingen skyddsmekanism mot att projekt raderas tyst — `deleteProject` gör en hård DELETE utan historik
3. Ingen audit trail för projektborttagningar

### Lösning

**1. Soft-delete för projekt (database migration)**
- Lägg till kolumn `deleted_at TIMESTAMPTZ DEFAULT NULL` på `projects`-tabellen
- Ändra `deleteProject` i `projectService.ts` till att sätta `deleted_at = now()` istället för att göra `DELETE`
- Uppdatera alla projekt-queries att filtrera `deleted_at IS NULL`
- Samma mönster för `jobs` och `large_projects`-tabellerna

**2. Audit trail vid radering**
- Skapa en `project_audit_log`-tabell: `id, project_id, action, booking_id, performed_by, details JSONB, created_at`
- Logga alla raderingar (soft-delete) med vem som utförde dem
- RLS-policy: bara admins kan läsa audit-loggen

**3. Skyddad radering med bekräftelse**
- I `ProjectManagement.tsx` och alla ställen som anropar `deleteProject`: kräv extra bekräftelse med projektnamn + bokningsnummer
- Visa tydligt varning: "Detta projekt är kopplat till bokning X — det kommer att avkopplas"

**4. Återställningsfunktion**
- Lägg till "Papperskorgen" i arkivvyn som visar soft-deleted projekt
- Möjlighet att återställa (sätt `deleted_at = NULL`)

**5. "Orphan booking" varning**
- Lägg till en periodisk kontroll: om en CONFIRMED-bokning saknar projekt efter X dagar, visa en varning i dashboard-widgeten
- Förhindrar att bokningar som 2603-126 faller mellan stolarna

### Filer att ändra
- **Migration**: `projects` + `jobs` + `large_projects` → `deleted_at`-kolumn, `project_audit_log`-tabell
- `src/services/projectService.ts` — soft-delete istället för DELETE
- `src/services/jobService.ts` — samma soft-delete
- `src/services/largeProjectService.ts` — samma soft-delete  
- `src/services/projectConversionService.ts` — uppdatera raderingslogik
- `src/hooks/useProjects.ts` (eller motsvarande) — filtrera `deleted_at IS NULL`
- `src/components/project/ProjectDashboardWidgets.tsx` — orphan-bokning-varning
- `src/pages/ProjectArchive.tsx` — visa papperskorg med soft-deleted projekt

### Omedelbar åtgärd
- Bokning 2603-126 saknar projekt — den borde dyka upp i "Nya bokningar" (viewed=false). Om den inte syns beror det troligen på att `viewed` sattes till `true` vid en tidigare import. Kan behöva nollställas.

