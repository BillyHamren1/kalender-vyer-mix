
## Vad är fel idag

På `/staff-management/time-reports` listas varje `location_time_entry` (presence-only) som en egen rad med "Närvaro: FA Warehouse · 0h". Resultatet: 7+ identiska 0h-rader som inte säger något, ingen visuell hierarki, ingen koppling mellan inloggning och första projekt, ingen GPS-detalj, och man förstår inte vad "Närvaro" betyder.

"Närvaro" = passiv platsmarkör (telefonen står på FA Warehouse) — inte en arbetstimer. Den används idag som råmaterial men presenteras som om varje sample vore ett pass.

## Ny struktur (dagbok per person)

Tre typer av rader, tydlig hierarki, ingen färg utöver svart/grå + röd endast vid varning:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAGEN STARTADE  ·  07:42                     [öppna karta]
FA Warehouse, Storgatan 12               kommentar
07:42  ·  pågår 8t 17m                    [💬]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   └─ Projekt: Nordic Event 2026          [öppna karta]
      FA Warehouse                        kommentar
      07:45 → pågår  ·  8t 14m            [💬]
      ▼ 142 pings · visa karta
        07:45  Storgatan 12 (±8m)
        07:52  Storgatan 12 (±6m)
        ...
   └─ ⚠ Förflyttning upptäckt 14:03
      Hamngatan 4 (820m från Storgatan 12)
      14:03 → 15:20  ·  1t 17m            [💬]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAGEN AVSLUTADES  ·  16:20                  totalt 8t 38m
FA Warehouse, Storgatan 12               kommentar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Rad-typer

1. **Dagsrubrik (start)** — fet, ingen färg, ramad ovanför med tunn linje. Visar:
   - "DAGEN STARTADE" + klockslag (från första `workday.started_at` ELLER, om saknas, första `location_time_entry`)
   - Adress för platsen (klickbar → öppnar kartmodal med pin)
   - Tickande varaktighet (live)
   - Kommentarsfält (inline)

2. **Projekt-underrad** — indenterad under dagsrubriken. En per `(staff, projectKey)` per dag (inte per LTE-rad). Visar:
   - Projektnamn + plats (klickbar karta)
   - Klockslag start → slut/pågår + total varaktighet (tickande om öppen)
   - Kommentarsfält
   - Klick på raden → expanderar pings för denna projekt-session:
     - Lista varje GPS-ping med `HH:mm  adress (±accuracy)`
     - "Visa alla på karta" → öppnar `StaffMovementMap` filtrerad på projektets tidsfönster

3. **Förflyttnings-flagga** (ny logik) — egen indenterad rad, **enda** med varningsfärg:
   - Triggar när medianposition under N på varandra följande pings förflyttas > X meter (förslag: 3 pings, > 200m) från projektets bas-koordinat
   - Visar ny adress, distans från bas, tidsfönster, varaktighet
   - Klickbar karta

4. **Dagsrubrik (slut)** — fet, ramad nedanför. Visar:
   - "DAGEN AVSLUTADES" + klockslag (från `workday.ended_at` eller sista LTE-stängning)
   - Sista plats + adress (karta)
   - Dagens totalsumma till höger
   - Kommentarsfält

### Konsolidering — bort med 0h-spam

- Alla `location_time_entry` med `isPresenceOnly = true` slås ihop till **EN** "Närvaro vid [plats]"-bas per `(staff, location_id)` per dag. Visas inte som egna rader — används endast som källa för dagsrubrikerna och som geografisk referenspunkt för förflyttnings-flaggan.
- Projekt-underrader byggs från LTE/time_reports som har `booking_id` eller `large_project_id` (riktig arbetstid). En projekt-session per kontinuerligt tidsfönster — inte en rad per `location_time_entries`-row.
- "Närvaro: FA Warehouse · 0h"-raderna i screenshoten försvinner helt.

### Färgregler (lock)

- All text: `text-foreground` (svart) eller `text-muted-foreground` (grå)
- Fet vikt endast på dagsrubrikerna och totaltid
- Röd (`text-destructive`) **endast** för:
  - Tappad signal
  - Förflyttnings-flagga
  - Auto-stängd arbetsdag
- Ingen blå/grön/orange/badge-bakgrunder någonstans

## Tekniska delar

**Filer som ändras:**
- `src/pages/StaffTimeReports.tsx` — bygg en ny aggregerings-funktion `buildStaffDayJournal(staff)` som returnerar `{ dayStart, dayEnd, projectSessions, movementFlags, presenceBase }` istället för en flat `segments[]`.
- `src/components/staff/StaffTimeReportsList.tsx` — rendera ny hierarkisk struktur (dagsrubrik → sessioner → slut). Behåll datumväljaren och sökfältet.
- **Ny** `src/components/staff/DayJournalRow.tsx` — header/projekt/movement-row sub-komponenter (håller filen <200 rader).
- **Ny** `src/components/staff/StaffPingDetailDrawer.tsx` — expanderbar pings-lista + integration mot befintlig `StaffMovementMap`.
- **Ny** `src/lib/staff/movementDetection.ts` — pure function: ges en lista pings + bas-koordinat, returnerar förflyttnings-segment. Enhetstestas.
- **Ny** `src/lib/staff/dayJournal.ts` — pure function som konsoliderar LTE + time_reports + workdays + pings till journal-strukturen. Enhetstestas.

**Pings-källa:** `staff_location_history` via `mobileApi.getMovementForDay(staffId, date)` (redan implementerad, används i `StaffMovementMap`). Pings hämtas lazy först när användaren expanderar en projekt-session, så listvyn förblir snabb.

**Adresser:** använd `latestPing.address` när det finns; annars reverse-geocode via befintlig `reverse-geocode-staff` edge function (cache per session i React Query).

**Karta i modal:** återanvänd `StaffMovementMap` med ett tidsfönster-filter (lägg till valfri `from`/`to` prop). Wrapas i en `Dialog` från shadcn.

**Kommentar-fältet:** lagras på `time_reports.notes` för projekt-sessioner och en ny `workdays.admin_note` för dagsrubrikerna (mini-migration).

**Inga andra ändringar i mobil-app, edge functions eller dataflöde.** Endast presentationen i admin omformas + pure detection-bibliotek.

## Vad jag inte gör i denna runda

- Auto-merge av mikro-rapporter (du har inte godkänt det)
- Server-side guard mot dubbel-räkning (kräver separat plan)
- Ändring av geofence-tröskel eller pingfrekvens
