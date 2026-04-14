

## Plan: Visuell skillnad mellan projekttilldelning och bokningsschemaläggning

### Två nivåer i tidappen

| Nivå | Betydelse | Visuellt |
|------|-----------|----------|
| **Projektmedlem** | Du ser bokningen för att du tillhör projektet | Dämpad stil, ikon "öga" (👁), ingen tidrapportering direkt |
| **Schemalagd** | Du är specifikt tilldelad att jobba denna bokning/dag | Full stil, tydlig badge "SCHEMALAGD", kan starta timer/tidrapport |

### Hur personalen upplever det

1. Billy öppnar "Mina jobb" och ser **Swedish Game Fair** som en grupp
2. Bokningar där Billy är **schemalagd via kalendern** visas med full färg och en grön "SCHEMALAGD"-badge
3. Övriga bokningar i projektet visas med dämpad stil och texten "I projektet" — Billy vet att de finns men är inte personligen inplanerad på dem ännu
4. Billy kan trycka på alla bokningar för att se detaljer, men bara de schemalagda har snabbåtkomst till timer och tidrapport

### Teknisk lösning

**Edge-funktionen** (`handleGetBookings`):
- För varje bokning, returnera ett nytt fält `assignment_type: 'scheduled' | 'project_member'`
- `'scheduled'` = det finns en BSA-rad för denna staff + bokning
- `'project_member'` = bokningen syns bara via `large_project_staff` (ingen BSA-rad)

**MobileApiService** (`MobileBooking`-typen):
- Lägg till `assignment_type?: 'scheduled' | 'project_member'`

**MobileJobs.tsx**:
- Bokningar med `assignment_type === 'project_member'` renderas med:
  - Dämpad bakgrund (`opacity-60` eller liknande)
  - Ögon-ikon istället för navigeringspil
  - Texten "I projektet" istället för RIGG/EVENT-badge
- Bokningar med `assignment_type === 'scheduled'` (eller inget värde) visas som idag, med tillägg av en liten grön markering

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/mobile-app-api/index.ts` | Sätt `assignment_type` per bokning baserat på BSA vs projekt-only |
| `src/services/mobileApiService.ts` | Utöka `MobileBooking` med `assignment_type` |
| `src/pages/mobile/MobileJobs.tsx` | Rendera olika stil baserat på `assignment_type` |

