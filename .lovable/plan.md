
Användaren vill att jag:
1. Lägger till sektion 13–24 (bakgrunds-/geofence-flödet) i `docs/time-tracking-architecture.md`
2. Sedan skriver hela det samlade dokumentet (del 1 + del 2) i ett enda långt chattmeddelande som kan kopieras

Detta är en enkel dokumentationsuppgift — ingen kod, inga tester, inga frågor behövs. Plan är trivialt enkel.

## Plan

**Steg 1 — Uppdatera `docs/time-tracking-architecture.md`**
Lägg till sektionerna 13–24 efter befintlig sektion 12. Innehållet är exakt det jag redan presenterat i föregående chattsvar:
- §13 Varför finns geofence-timern
- §14 Tre signaler för närvaro
- §15 Vad är en ankomst tekniskt
- §16 När personen lämnar platsen (inkl. midnattssplit, GPS-bortfall)
- §17 Auto-generering till tidrapport (DB-trigger `sync_location_entry_to_time_report`)
- §18 Manuell timer vs geofence — samverkan
- §19 Anomalies — diskrepanser
- §20 Pushnotis-flöde (arrival reminders)
- §21 Reseregistrering (travel_time_logs)
- §22 Personalens upplevelse — exempel hela dagen
- §23 Vad som inte sker automatiskt (medvetet)
- §24 Sammanfattning — närvaro vs arbetstid

**Steg 2 — Skriva hela dokumentet i chatten**
Efter filändringen klistrar jag in hela `docs/time-tracking-architecture.md` (sektion 1–24 sammanslaget) i ett enda chattmeddelande, formaterat så användaren kan kopiera det rakt av.

Inga andra filer berörs. Inga öppna frågor.
