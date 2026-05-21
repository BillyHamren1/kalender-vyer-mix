## Vad jag har bekräftat

Jag har gått in i databasen och hittat följande:

- **Bokning 2605-69 (Zoran)** finns, `status = CONFIRMED`, kopplad till ett vanligt projekt `Zoran - 10 juni 2026` (inte large project).
- **Två calendar_events** ligger där:
  - rig **9 juni 07:00–11:00** på `team-1`
  - rigDown **11 juni 08:00–12:00** på `team-1`
- Eventen ligger inom det fönster planeraren hämtar (2026‑03‑24 → 2026‑09‑20), och 374 calendar_events har lästs in i den senaste loggen.

Så raderna **finns** — det är `buildPlannerCalendarEvents`-derivationen eller renderingen som tappar dem. Logiskt borde de släppas igenom (giltig `event_type`, har `resource_id`, inget `large_project_id`), men eftersom du säger att eventet aldrig syntes ens efter Spara, behöver vi spåra exakt varför.

## Plan

### 1. Lägg in målinriktad debug i `plannerCalendarDerivation.ts`
Logga varje gång en rad **släpps igenom** eller **skippas** för booking_number `2605-69`, så vi ser i konsollen exakt vilken gren den hamnar i (large‑project‑grupp, non‑project‑fallback, missing resource_id, suppressed pga `large_project_id`, eller faktiskt emitterat).

### 2. Be dig öppna personalkalendern v.24 i preview
När du gör det skriver derivationen ut spårningen. Jag läser konsollen själv via debugverktyget direkt efteråt — du behöver inte klistra in något.

### 3. Åtgärda roten
Beroende på vad loggen visar är det troligen en av:
- **A.** Standalone-projekt­bokning som av misstag matchas mot `large_project_bookings`-mastern och hamnar i en projektgrupp utan att kunna lösas (osynlig).
- **B.** Realtime/cache som inte invaliderade efter create — eventet finns men UI:t använder en gammal lista.
- **C.** En filterregel uppströms (klient/team-toggle) som råkar dölja `team-1` för just dig.

Fix:t skrivs när vi vet vilket. Inga DB‑ändringar förväntas — bara derivation/UI.

### 4. Ta bort debug-loggen
När roten är åtgärdad och du bekräftat i preview att 2605-69 syns på 9 + 11 juni rensar jag spår-loggen.

### Tekniska detaljer
- Filen: `src/services/plannerCalendarDerivation.ts` (rad 280–380 är där flöde‑grenarna ligger).
- Debug skrivs som `console.info('[trace-2605-69]', { branch, reason, … })` så det är enkelt att hitta och ta bort.
- Ingen migration. Ingen ändring i `customer_pickup`-flödet (helt orelaterat).
