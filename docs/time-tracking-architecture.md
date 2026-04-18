# Tidrapportering — Arkitektur & Beslutsdokument

> **Status:** Aktiv överenskommelse (2026-04-17 → 2026-04-18)
> **Scope:** Mobilappens tidrapportering, jobb-/projekt-/platstimers, manuella rapporter, godkännandeflöde och backend-spärrar.
> **Source of truth:** `location_time_entries` (server) för aktiva timers · `time_reports` (server) för avslutade pass.

---

## 1. Grundprinciper

1. **Servern är sanning.** Inget timer- eller tidrapportstillstånd får leva endast i klienten. localStorage får användas som **cache och offline-buffert**, aldrig som källa.
2. **Tid får aldrig försvinna.** Misslyckad nätverksoperation ska aldrig leda till att en pågående timer eller en sparad rapport tappas.
3. **Idempotens överallt.** Alla skrivande operationer (start_timer, stop_timer, createTimeReport) måste tåla att klienten retryar. Vi använder `client_dedupe_key` för timers.
4. **Backend är yttersta spärren.** UX-spärrar i frontend är bekvämlighet. Affärsregler (overlap, approved-lock, aktiv timer m.m.) måste valideras på server.
5. **Approved entries är heliga.** En godkänd rapport får aldrig ändras eller raderas tyst — bara via explicit unapprove av admin.

---

## 2. Timer-typer & ansvarsfördelning

Det finns tre typer av aktiva timers. Alla lagras i samma tabell — `location_time_entries` — med exakt **en** av tre källkolumner satt:

| Typ | Källkolumn | Triggad av | Användningsfall |
|---|---|---|---|
| **Location timer** | `location_id` | Geofence-entry på fast plats (kontor, lager) | Personalen kommer in på lagret → automatisk start |
| **Booking timer** | `booking_id` | Manuell start från jobb i mobilen | Personal trycker Play på ett kund-jobb |
| **Project timer** | `large_project_id` | Manuell start på stort projekt | Personal jobbar på ett stort projekt utan specifik booking |

**Constraint i DB:** `CHECK (num_nonnulls(location_id, booking_id, large_project_id) = 1)`
**Unik öppen timer per personal per källa:** Partial unique index på `(staff_id, source) WHERE exited_at IS NULL`. En person kan inte ha två öppna timers på samma jobb samtidigt.

> En person **kan** ha flera öppna timers samtidigt om de pekar på olika källor (t.ex. en passiv location-timer på lagret + en aktiv booking-timer). Detta är medvetet — geofencing och manuella starter är separata signaler. Stop-flödet hanterar detta via källval.

---

## 3. Aktiv timer-flöde (start → stop)

### 3.1 Start (optimistisk + server-master)

```
Klient                                          Server
------                                          ------
1. User trycker Play
2. Generera client_dedupe_key (uuid)
3. Skriv till lokal kö:
   eventflow-pending-timer-starts
4. Uppdatera UI optimistiskt
   (timer "syns" omedelbart)
5. POST mobile-app-api/start_timer  ─────────►  6. Validera:
                                                   - finns redan öppen entry med
                                                     samma dedupe_key? → returnera den
                                                   - finns annan öppen entry på
                                                     samma källa? → returnera 409
                                                   - skapa rad i location_time_entries
                                                     med entered_at = now()
                                                ◄─ 7. Returnera entry { id, entered_at }
8. Ta bort från pending-kö
9. Emit 'timer-server-synced' →
   uppdatera activeTimers Map med
   server-id (ersätter optimistiskt id)
```

**Vid nätverksfel i steg 5:**
- Pending-entry stannar i kön.
- Bakgrundssync (var 30s + vid online-event) försöker igen med samma `client_dedupe_key`.
- UI visar "Synkroniseras…"-badge på timern tills server bekräftat.

### 3.2 Stop (säker save-then-stop)

> **Kritiskt beslut:** Vi stoppar **aldrig** timern lokalt innan tidrapporten är säkrad på servern. Annars kan tid försvinna.

```
1. User trycker Stop
2. Beräkna start/end/hours/break lokalt
3. Visa "Sparar…"-state (timern kvar i UI)
4. POST mobile-app-api/createTimeReport
   med location_time_entry_id
   ┌─ Lyckas:
   │   5a. Server skapar time_report
   │   5b. Server sätter exited_at på location_time_entry
   │   5c. Klient tar bort från activeTimers
   │   5d. Toast "Rapport sparad: X.Xh"
   └─ Misslyckas:
       5e. Timer stannar aktiv lokalt + på server
       5f. Toast "Kunde inte spara — försök igen"
       5g. User kan trycka Stop igen (idempotent via dedupe på rapporten)
```

### 3.3 Recovery vid app-start / reload

1. Mount → `useGeofencing` kör `getActiveTimers` mot servern.
2. Resultatet bygger upp `activeTimers` Map för **alla tre typer**.
3. Lokal `eventflow-pending-timer-starts`-kö flushas (retry pending starts).
4. Stale lokala timers (äldre än 24h utan server-match) → varnar user, raderas inte automatiskt (säkerhetsnät).

---

## 4. Bakåttida starter (retroaktiva rapporter)

**Användningsfall:** "Jag glömde starta timern i morse, men jag jobbade 08:00–12:00."

### Regler
1. Manuell tidrapport får skapas för **valfritt datum** bakåt i tiden, så länge:
   - Den inte överlappar en annan rapport (se §5).
   - Den inte överlappar en **pågående** timer för samma personal.
   - Datum/tid är inte i framtiden (utöver dagens slut).
2. **Aktiv timer blockerar inte alla manuella rapporter** — bara de som överlappar med timerns intervall (mjuk spärr, se §6).
3. UI: I formuläret visas en varning "Du har en aktiv timer som startade kl. HH:MM" om relevant.

---

## 5. Overlap-validering (datetime-baserad)

**Tidigare problem:** Validering jämförde bara start_time/end_time som strängar → bröt vid nattskift.

**Ny logik (server-side, både i mobile-app-api och DB-trigger):**

```
För varje rapport bygg riktiga datetime-intervall:
  start_dt = report_date + start_time
  end_dt   = report_date + end_time
  if end_time < start_time:
      end_dt += 1 day   ← nattskift hanteras

Två rapporter A och B överlappar om:
  A.start_dt < B.end_dt  AND  B.start_dt < A.end_dt
  (samma staff_id, exklusive den rapport som uppdateras)
```

**Felmeddelande:** `"Tidsintervallet ${start}–${end} på ${date} överlappar en befintlig rapport (${otherStart}–${otherEnd})."`

---

## 6. Backend-spärrar (yttersta sanning)

Följande regler enforces på server (mobile-app-api + DB-triggers på `time_reports`):

| Regel | Var | Beteende vid brott |
|---|---|---|
| **Approved-lock** | DB-trigger | Allt utom `description` är låst när `approved=true`. Update raises exception. |
| **Overlap-fri** | DB-trigger + API | Datetime-intervall får inte krocka med annan rapport för samma `staff_id`. |
| **Aktiv timer-spärr (mjuk)** | API | Manuell rapport vars intervall överlappar pågående timer → 409. |
| **Orimliga intervall** | API | `hours_worked > 16` eller `< 0` → 422 med tydligt felmeddelande. |
| **Break-cap** | API | `break_time` får inte överstiga `hours_worked`. Auto-avdrag 0.5h om pass > 5h och inget break angivits. |
| **Övertid-cap** | API | `overtime_hours` får inte överstiga `hours_worked`. |
| **Framtida datum** | API | `report_date > today + 1` → 422. |

UX-spärrar i frontend (TimeReportForm) får finnas för bättre upplevelse, men allt valideras igen på server. Ingen klient kan kringgå.

---

## 7. Lokal cache-policy (klient)

| Nyckel | Innehåll | TTL | Roll |
|---|---|---|---|
| `eventflow-active-timers` | Map över aktiva timers | Session | UI-cache, alltid omread från server vid mount |
| `eventflow-pending-timer-starts` | Kö av timer-starter som väntar på server-bekräftelse | Tills synkad | Offline-säkerhet |
| `eventflow-stale-timer-warning` | Lokala timers äldre än 24h utan server-match | Manuell | Säkerhetsnät — varnar user, raderas inte tyst |

**Regel:** Vid konflikt mellan lokal och server → **server vinner**. Lokal cache uppdateras.

---

## 8. UI-komponenter & ansvar

| Komponent | Roll |
|---|---|
| `useGeofencing` | Singel källa för aktiva timers i klienten. Hanterar start/stop/sync/recovery. |
| `GlobalActiveTimerBanner` | Visar pågående timer globalt i mobilappen. Lyssnar på `useGeofencing`. |
| `MobileJobDetail` (Play/Stop-knapp) | Anropar `startTimer`/`stopTimer` från `useGeofencing`. Visar "Sparar…"-state. |
| `TimeReportForm` (admin/web) | Manuell tidrapport. Validerar lokalt + server returnerar slutgiltig validering. |
| `mobile-app-api` Edge Function | start_timer · stop_timer · get_active_timers · createTimeReport · updateTimeReport. |
| DB-triggers på `time_reports` | Approved-lock + overlap-validering — kan inte kringgås. |

---

## 9. Felhantering — användarvänliga meddelanden

| Fel | Meddelande till user |
|---|---|
| Server unreachable vid start | "Timer startad — synkroniseras när du är online" (UI visar badge) |
| Server unreachable vid stop | "Kunde inte spara rapporten. Timern är fortfarande igång — försök igen." |
| Overlap | "Den här tiden krockar med en rapport du redan har: HH:MM–HH:MM" |
| Aktiv timer blockerar | "Du har en pågående timer som täcker den här tiden. Stoppa den först eller välj annat intervall." |
| Approved | "Den här rapporten är godkänd och kan inte ändras. Kontakta admin om du behöver justera." |
| Orimligt intervall | "Pass över 16h tillåts inte. Kontrollera tiderna." |

---

## 10. Beslut som är **avvisade** (förbjudet att återinföra)

- ❌ **Stoppa timern lokalt först, spara rapporten sedan.** Risk att tid försvinner.
- ❌ **Hård spärr — ingen manuell rapport så länge någon timer pågår.** För irriterande för retroaktiv rapportering på andra dagar.
- ❌ **Bara klient-validering av overlap.** Kringgås trivialt.
- ❌ **Overlap-check som strängjämförelse på HH:MM.** Bryter vid nattskift.
- ❌ **Storage av timer-state enbart i localStorage.** Data försvinner vid reload på annan enhet.

---

## 11. Migreringsstatus (pågående arbete)

- ✅ `location_time_entries` har `booking_id`, `large_project_id`, `client_dedupe_key`.
- ✅ CHECK-constraint för exakt en källa.
- ✅ Partial unique index för öppna timers.
- ✅ `mobile-app-api`: start_timer, stop_timer, get_active_timers.
- ✅ `useGeofencing`: optimistisk start + server-sync + recovery för alla tre typer.
- ⏳ DB-triggers för approved-lock och overlap (planerat — väntar på beslut om strikthet).
- ⏳ Mjuk spärr "aktiv timer vs manuell rapport" på server (planerat).
- ⏳ Admin-UI (`TimeReportForm`, `projectStaffService`) ska gå via API istället för direkt-DB, eller alternativt via DB-trigger som täcker båda vägarna.

---

## 12. Öppna frågor (att besluta nästa session)

1. **DB-trigger eller API-only för approved-lock + overlap?**
   - Rekommendation: DB-trigger (täcker alla skrivvägar inkl. admin-UI och direkt-SQL).
2. **Aktiv timer-spärr: hård eller mjuk?**
   - Rekommendation: Mjuk (blockera bara vid faktisk överlapp).
3. **Approved-lock omfattning: allt utom approval-fälten, eller tillåt även `description`?**
   - Rekommendation: Tillåt `description` (för efterhandskommentarer).

---

---

# DEL 2 — Bakgrunds-/geofence-flödet (automatisk tidsregistrering)

## 13. Varför finns geofence-timern?

Personal **glömmer** logga in. De kommer till lagret, börjar jobba, glömmer trycka Play. Eller de jobbar en hel dag och glömmer stoppa. Geofence-flödet är **säkerhetsnätet** som säkerställer att vi har en sann bild av när personen faktiskt var på plats — även om de aldrig rör appen.

Det är *inte* ersättning för manuell rapportering. Det är *parallell sanning* som vi sedan stämmer av mot.

---

## 14. Tre signaler som ger "var personen på plats?"

| Signal | Källa | Skapas när |
|---|---|---|
| **GPS-ping i bakgrunden** | `useBackgroundLocationReporter` (Capgo background-geolocation) | Var ~30s när appen är öppen ELLER i bakgrunden, så länge personen gett tillstånd |
| **Foreground geofence-event** | `useGeofencing` när appen är aktiv | Personen öppnar appen och är inom radien för en `organization_location` |
| **Pending arrival** | Cachelagras i `eventflow-pending-arrivals` om appen var stängd vid ankomst | Nästa gång appen öppnas — triggar arrival-prompt |

Alla tre leder till **samma sak**: en rad i `location_time_entries` med `location_id` satt och `source = 'gps'` (eller motsvarande automatisk markering).

---

## 15. Vad är en "ankomst" tekniskt?

1. GPS-pingen rapporterar position till servern.
2. Server kollar mot alla `organization_locations` för organisationen → finns det en plats inom dess `radius_meters`?
3. Om ja **och** personen inte redan har en öppen `location_time_entry` på den platsen → skapa en ny entry:
   ```
   location_time_entries {
     staff_id, location_id,
     entered_at: now(),
     source: 'gps',
     client_dedupe_key: hash(staff+location+date)
   }
   ```
4. Triggar pushnotis: "Du verkar vara på {Lager}. Starta din arbetsdag?" (via `arrival-reminder` cron, max 3 påminnelser).

> Detta sker **oavsett om appen är i förgrunden eller bakgrunden**. Det är därför background-geolocation är kritiskt.

---

## 16. Vad händer när personen lämnar platsen?

1. GPS-ping visar position **utanför** alla geofence-radier för den platsen.
2. Server stänger den öppna `location_time_entries`-raden:
   ```
   exited_at = now()
   ```
3. **Inget rapport-skapande än.** Bara en stängd "närvaro-period".
4. Om personen kommer tillbaka senare samma dag → ny entry skapas (vi grupperar inte automatiskt — flera in/ut samma dag = flera entries).

**Specialfall — midnatt:** En öppen GPS-entry stängs automatiskt vid 23:59:59 och en ny öppnas 00:00:00 om personen fortfarande är där. Detta för att undvika dygnsöverskridande automatrapporter (som annars skulle kollidera med overlap-reglerna).

**Specialfall — GPS dör / app dödas:** Om vi inte fått ping på >15 min och senaste position var inom radie → vi **stänger inte** entryn automatiskt. Vi vet inte om personen lämnat eller bara tappat signal. Stale entries hanteras manuellt av admin (se §19).

---

## 17. Från GPS-närvaro till tidrapport (auto-generering)

> Detta är hjärtat: hur blir en passiv närvaro-logg en faktisk tidrapport?

**DB-trigger `sync_location_entry_to_time_report`** körs när en `location_time_entries`-rad får `exited_at` satt:

1. Räkna ut `hours_worked = (exited_at - entered_at)` minus auto-rast (0.5h om > 5h).
2. Kolla: finns redan en **manuell** `time_report` för samma staff + datum som **täcker** detta intervall?
   - Ja → gör inget. Manuell rapport vinner alltid.
   - Nej → skapa automatiskt:
     ```
     time_reports {
       staff_id, booking_id: NULL (eller location-internt projekt),
       report_date, start_time, end_time, hours_worked,
       source: 'location_auto',
       approved: false,
       description: 'Auto-genererad från geofence (Lager)'
     }
     ```
3. Markeras tydligt i admin-UI med en grå badge "Auto" så det syns att den behöver granskas.

**Viktigt:** Auto-rapporten är **alltid `approved=false`**. Personalen eller admin måste aktivt godkänna den. Detta skiljer sig från manuella rapporter som personalen skapat själv (de kan vara förvalda som "väntar godkännande" men är medvetet skapade).

---

## 18. Manuell timer vs geofence — hur samverkar de?

**Regel:** Manuella timers (booking/project) trumfar alltid geofence.

| Situation | Vad händer |
|---|---|
| Personen startar jobb-timer på ett kund-jobb medan de är på lagret | Båda timers körs parallellt. Lager-entryn är passiv närvaro, jobb-entryn är aktivt arbete. Vid stop av jobb-timern skapas en `time_report` på det jobbet. Lager-entryn fortsätter tills personen går. |
| Personen lämnar lagret men jobb-timern är fortfarande aktiv | Lager-entryn stängs. Jobb-timern påverkas **inte** — den är manuell och fortsätter tills personen själv stoppar. |
| Personen stoppar jobb-timern och rapporten täcker hela dagen | Auto-trigger ser att manuell rapport täcker tiden → genererar **ingen** auto-rapport från lager-entryn. |
| Personen jobbar 08–17 men har bara manuell rapport 08–12 | Auto-trigger genererar en auto-rapport för 12–17 (eller hela 08–17 minus 08–12 → blir 12–17). Markeras som "Auto" + `approved=false`. |

---

## 19. Anomalies — när auto och manuell inte matchar

`time_report_anomalies`-tabellen loggar diskrepanser som behöver mänskligt beslut:

| Typ | Trigger | Vad personen ska svara |
|---|---|---|
| **Geofence utan rapport** | GPS visar närvaro >30 min, ingen manuell rapport, ingen auto-rapport (t.ex. för kort) | "Var det rast eller arbete?" |
| **Rapport utan geofence** | Manuell rapport finns men GPS visar att personen aldrig var inom radien | "Jobbade du på distans? Beskriv." |
| **Glapp i mitten** | Personen var på plats 08–17 men lämnade radien 12–13 | "Lunch?" → om ja, dras automatiskt från arbetstid |
| **Flera korta ut/in** | Personen lämnade och kom tillbaka 5+ ggr på en dag | Visas som info, ingen blockering |
| **Stale GPS-entry** | Öppen entry >24h utan exit | Admin-varning, inte personal |
| **Avbruten GPS-tracking** | Inga pings på 2+ timmar mitt under aktiv närvaro | Loggas, ingen blockering |

Anomalies visas i `MobileAnomalyClassificationDialog` när personen öppnar appen — **inte automatiskt vid skapande** (för att inte störa). De ligger i deras inkorg tills hanterade.

---

## 20. Pushnotis-flöde (arrival reminders)

`arrival-reminder` Edge Function (cron, var 5 min):

1. Hitta alla öppna `location_time_entries` med `source='gps'` där `entered_at > 10 min sedan`.
2. För varje: kolla om personen har **aktiv manuell timer** på den platsen.
   - Ja → ingen påminnelse.
   - Nej → skicka push: "Du är på {Lager}. Starta din arbetsdag?"
3. Max 3 påminnelser per närvaro-period (efter 10 min, 30 min, 60 min). Sedan tyst.
4. Om personen trycker "Ignorera" → `eventflow-arrival-dismissed-{location_id}-{date}` cachas → inga fler påminnelser den dagen.

---

## 21. Reseregistrering (relaterat men separat)

`travel_time_logs` skapas av `useTravelDetection` när:
- Personen rör sig >X km/h i Y minuter, **och**
- Det finns ett kommande jobb i deras schema, **och**
- De är på väg mot jobbets adress (Haversine-distans minskar).

Vid ankomst → reseloggen stängs. Visas som "Resa"-rad i admin tidrapportsvy, kopplad till destinationsprojektet. Räknas in i månadens totala timmar men är **inte** en `time_report` — egen tabell, egen logik.

---

## 22. Personalens upplevelse — hela dagen

```
07:45  Personen åker hemifrån
       → useTravelDetection: travel_time_log skapas (källa: GPS-rörelse mot jobb-adress)

08:12  Anländer lagret (inom 50m radie)
       → Background-GPS rapporterar position
       → Server skapar location_time_entries: source='gps', entered_at=08:12
       → travel_time_log stängs
       → Push: "Du är på Lager. Starta din arbetsdag?"

08:13  Personen öppnar appen
       → ArrivalPromptDialog visas
       → Personen trycker "Ja, starta 08:12" (suggested time från geofence)
       → Manuell location-timer startar med entered_at=08:12 (samma rad uppdateras eller ny manuell skapas)

10:30  Personen åker till kundjobb
       → Lämnar lager-radien → GPS-entry får exited_at=10:30
       → Auto-rapport-trigger: ingen manuell rapport täcker 08:12–10:30 ÄN (timern är fortfarande aktiv) → vänta

10:45  Anländer kund
       → Personen trycker Play på jobbet i appen
       → booking-timer startar (parallellt med location-timern som fortfarande är "aktiv" tekniskt)

15:00  Personen trycker Stop på jobbet
       → createTimeReport körs → time_report sparas (10:45–15:00, 4.25h, jobb XYZ)
       → booking-timer-raden får exited_at

15:20  Personen är tillbaka på lagret
       → Ny GPS-entry skapas (15:20–...)

17:00  Personen åker hem
       → GPS-entry stängs (15:20–17:00)
       → Manuell location-timer från morgonen är fortfarande aktiv enligt UI
       → Personen trycker Stop i appen → createTimeReport för location-tiden
       → MEN: överlappar med booking-timern 10:45–15:00!
       → Server returnerar 409 med tydligt fel
       → UI hjälper personen dela upp: 08:12–10:30 + 15:20–17:00 (lager) = 4.3h
       → Två rapporter sparas, ingen overlap

Nästa dag, admin granskar:
- Lager-rapport 1 (08:12–10:30) — manuell, väntar godkännande
- Jobb-rapport (10:45–15:00) — manuell, väntar godkännande
- Lager-rapport 2 (15:20–17:00) — manuell, väntar godkännande
- Reselogg 07:45–08:12 — auto, info
- Inga anomalies eftersom allt täcks av manuella rapporter
```

---

## 23. Vad som **inte** sker automatiskt (medvetet)

- ❌ **Vi auto-stoppar aldrig en manuell timer** även om personen lämnat platsen. De kan ha glömt stoppa, men vi vet inte om de är på lunch eller hemma. Anomaly skapas istället.
- ❌ **Vi auto-godkänner aldrig auto-rapporter.** `approved=false` alltid. Mänskligt beslut krävs.
- ❌ **Vi raderar aldrig manuella rapporter** även om geofence motsäger dem. Anomaly skapas, admin beslutar.
- ❌ **Vi skapar inte auto-rapporter för pass under 15 min.** För kort att vara meningsfullt → bara närvaro-logg.

---

## 24. Sammanfattning — två parallella sanningar

| Lager | Vad det är | Vem äger | Skapas av |
|---|---|---|---|
| **Närvaro** (`location_time_entries` + `source='gps'`) | "Var personen fysiskt på plats?" | Servern, automatiskt | GPS-pings |
| **Arbetstid** (`time_reports`) | "Vad ska personen få betalt för?" | Personalen + admin | Manuell rapport ELLER auto-trigger från närvaro |

**Närvaro är fakta. Arbetstid är beslut.** Geofence ger oss fakta utan att personalen behöver göra något. Det skyddar både personalen (de glömmer inte registrera tid) och företaget (vi har spårbarhet).

---

*Detta dokument är levande. Uppdatera vid varje arkitekturbeslut som rör tidrapportering.*
