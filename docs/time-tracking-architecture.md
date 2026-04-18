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

*Detta dokument är levande. Uppdatera vid varje arkitekturbeslut som rör tidrapportering.*
