

## Problem

`ProjectInternalNotes` sparar BARA till `bookings`-tabellen (rad 38-41). Det finns två scenarion som fallerar:

1. **Projekt utan bokning** (`bookingId = null`): `handleSave` gör `if (!bookingId) return` — texten sparas aldrig.
2. **Projekt med bokning**: Sparar till `bookings.internalnotes`, men `currentNotes` läser `booking?.internalnotes || project.internalnotes` — om projektet skapades med egna anteckningar kan det uppstå en mismatch.

Kärnan: det finns en `internalnotes`-kolumn på `projects`-tabellen, men komponenten uppdaterar den aldrig.

## Lösning

Uppdatera `ProjectInternalNotes` så den sparar till **rätt tabell** beroende på om det finns en kopplad bokning eller inte:

### Fil: `src/components/project/ProjectInternalNotes.tsx`

**Ändra `handleSave`-logiken:**
- Om `bookingId` finns: spara till `bookings.internalnotes` (som idag) OCH till `projects.internalnotes`
- Om `bookingId` saknas (standalone-projekt): spara till `projects.internalnotes`

Konkret:
```
1. Alltid uppdatera projects.internalnotes WHERE id = projectId
2. Om bookingId finns, även uppdatera bookings.internalnotes WHERE id = bookingId
3. Ta bort early return på !bookingId — låt sparningen gå igenom mot projects-tabellen
```

### Inga databasändringar
Kolumnen `internalnotes` finns redan på `projects`-tabellen (bekräftat i types.ts och CreateProjectWizard).

### Sammanfattning
- En ändring i en fil
- Texten sparas alltid till projektet, och synkas till bokningen om den finns
- Vid refresh läser `currentNotes` korrekt `booking?.internalnotes || project.internalnotes`, vilket nu alltid matchar

