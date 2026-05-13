# Tolkad dagstidslinje → spegling → end-of-day commit

Vi bygger **EN** tidslinje per person och dag som är systemets tolkning av vad som hänt. Den uppdateras löpande från GPS + scanner + manuella bekräftelser, men **ingenting skrivs till `time_reports` förrän dagen avslutas**. Tidslinjen är samma för admin och personens app — appen är en spegel.

## Mental modell

```text
        pings + scans + planning + manuella ankomster
                          │
                          ▼
              ┌──────────────────────────┐
              │  DayTimeline (cache)     │  ← en rad per person+dag
              │  segments: [             │
              │    { project,  09:00–10:30 },
              │    { travel,   10:30–10:45 },
              │    { project,  10:45–12:00 },  ← samma projekt, slogs ihop
              │    { warehouse,12:30–14:00 },
              │    { unknown,  14:00–14:20 }   ← väntar på info
              │  ]                       │
              └──────────────────────────┘
                          │
                          ├──► Admin-vy (StaffTimeReportDetail)  — läs/ändra
                          ├──► Mobil-app (MobileTimeReport)      — spegel
                          │
                  [End-of-Day commit]   ← när personen avslutar dagen
                          │
                          ▼
                  time_reports (en rad per kontigt projekt-/warehouse-/travel-segment)
```

## Viktigt: tolkning får ändra sig under dagen

Exemplet du gav: kl 10:30 ser systemet en utresa, klassar **preliminärt** som `travel`. Kl 10:45 är personen tillbaka på projektet. Tolkaren noterar då att "kort utstick (<30 min) från och tillbaka till samma projekt = ärende för projektet" och slår ihop **10:30–10:45 till `project`** i samma block som 09:00–12:00. Tidslinjen ändras — inga rapporter har skrivits ännu, så inget att städa.

Reglerna lever i en ren tolkare: `interpretDayTimeline(rawSegments, context) → DayTimeline`. Idempotent: samma input = samma output.

## Vad finns redan, vad är nytt

Existerar och återanvänds:
- `buildGpsDayTimeline` (pings → råa stay/travel/gap-segment)
- `resolveWorkTargets` (dagens projekt/lokationer)
- `staff_day_report_cache` (mobilen läser redan denna)
- `mobile-app-api admin_create_time_report` (enda skrivvägen till `time_reports`)

Nytt:
- `interpretDayTimeline.ts` — pure rules ovanpå råa segment (slå ihop, omklassa korta utstick, lyfta scans, hantera unknown).
- `compute-day-timeline` edge function — kör buildGpsDayTimeline + resolveWorkTargets + interpretDayTimeline och uppdaterar `staff_day_report_cache`. Triggas av: ny ping, ny scan, manuell ändring, cron var 5:e min för aktiva, end-of-day-stängning.
- `commitDayTimelineToTimeReports.ts` — kör vid end-of-day. Tar färdig tidslinje, slår ihop kontigt block per `(target_kind, target_id)` och skriver via `admin_create_time_report`. Idempotent på `(staff_id, date, block_index)`.

## Filer

```text
supabase/functions/_shared/time-engine/
  interpretDayTimeline.ts              ~220 r  (pure rules)
  commitDayTimelineToTimeReports.ts    ~140 r  (end-of-day skrivare)
  __tests__/
    interpretDayTimeline.test.ts       ~scenarier nedan
    commitDayTimeline.test.ts          ~idempotens + dedup

supabase/functions/compute-day-timeline/index.ts   ~120 r
  HTTP entrypoint: { staffId, date } → uppdaterar cache, returnerar timeline

supabase/functions/close-stale-workday-entries/index.ts
  + anropa compute-day-timeline + commitDayTimelineToTimeReports vid stängning

supabase/functions/mobile-app-api/index.ts
  + i existerande end_workday-actionen: kalla commit-funktionen

supabase/migrations/<ts>_day_timeline_block_key.sql
  ALTER TABLE time_reports
    ADD COLUMN day_timeline_block_key text NULL;
  CREATE UNIQUE INDEX time_reports_day_timeline_block_key_uniq
    ON time_reports(day_timeline_block_key)
    WHERE day_timeline_block_key IS NOT NULL;

src/hooks/useDayTimeline.ts                ~80 r
  React Query mot staff_day_report_cache + realtime-invalidate

src/components/staff/DayTimelineView.tsx   ~180 r
  Visuell tidslinje (segment-strip + lista). Används av:
    - StaffTimeReportDetail (admin)
    - MobileTimeReport       (spegel)
```

## Tolkningsregler (interpretDayTimeline)

1. **Slå ihop kontigt** — segment med samma target inom < 5 min mellanrum blir ett.
2. **Kort utstick = projektets ärende** — `travel` < 30 min mellan två segment med samma projekt → omklassa till samma projekt.
3. **Scanner-bekräftelse låser** — om scan finns på lager under ett segment: `warehouse`, kan inte tolkas om.
4. **Manuell bekräftelse låser** — admin/personens egen ändring vinner alltid över heuristik.
5. **Okänd plats förblir `unknown`** — inget gissande. Visas som "Okänd plats — bekräfta?" i båda vyerna.
6. **Natt 00:00–05:00** — inga auto-tolkningar (Night auto-start guard).
7. **GPS-gap ≥ 15 min** — eget segment `gps_gap`, blir aldrig travel.

Allt detta är ren funktion. Testas med scenarier:

```text
- utresa+åter <30 min till samma projekt   → ett project-block
- utresa+åter till annat projekt           → travel + nytt project
- scan på lager mitt under "okänd"         → warehouse
- två närliggande pings på projekt + 3 min gap → ett block
- nattarbete 23:00–02:00                    → bevaras (manuell start)
- ändrad classification i admin             → läcker inte tillbaka vid omberäkning
```

## End-of-Day commit (commitDayTimelineToTimeReports)

När personen klickar "Avsluta dagen" (eller stale-watchdog stänger):
1. Kör en sista `compute-day-timeline`.
2. Plocka segment av typ `project` / `warehouse` / `travel` (inte `unknown`, inte `gps_gap`, inte `private`).
3. Per kontigt block: anropa `admin_create_time_report` med `day_timeline_block_key = ${staffId}:${date}:${blockIndex}`.
4. UNIQUE-index → idempotent. Återkörning = inga dubletter.
5. `unknown`-segment skrivs **inte**. De ligger kvar i tidslinjen som "behöver bekräftas" tills admin/personen bestämmer.

## Vad som INTE byggs

- Ingen löpande skrivning till `time_reports` under dagen.
- Inga separata aktivitets-/projekt-/plats-timers (redan förbjudet av Single Timer Policy).
- Ingen admin-allokator-UI.
- Ingen automatisk skrivning av `unknown` — det kräver mänsklig bekräftelse.

## Risker

- **Tolkning ändras efter att person sett något** → mitigering: visa "uppdaterad nu" + diff i mobilen; manuell bekräftelse låser alltid.
- **End-of-day commit krockar med befintlig rapport** → UNIQUE-index + befintliga overlap-triggers fångar; commit returnerar { written, skipped, conflicts }.
- **Stora dagar (många segment)** → tolkaren är O(n), targets cachas per dag.

---

Säg till så bygger jag i ordning: migration + `interpretDayTimeline` + tester → `compute-day-timeline` edge + cron → `useDayTimeline` + `DayTimelineView` (admin först, sen mobilspegel) → `commitDayTimelineToTimeReports` + koppla in i end_workday + stale-watchdog.
