

## Mål

Server-side cron stänger övergivna timers varje natt. När användaren öppnar appen morgonen efter får hen en dialog med **konkreta tidsförslag** baserat på faktisk GPS-historik och kan bekräfta vilken tid som var den verkliga sluttiden — istället för att blint acceptera en gissad +8h-stängning.

## Flödet

```text
Natt 03:00 UTC
   └─► close-stale-workday-entries cron körs
          ├─► Stänger location_time_entries (entered_at + 8h, provisionellt)
          ├─► Stänger travel_time_logs (started_at + 1h)
          ├─► Stänger time_reports
          └─► Skriver workday_flag: auto_closed_overnight
                med context.suggested_end_times = [
                  { kind: 'left_workplace', label: 'Du åkte från Bauhaus', time: '17:42', source_id },
                  { kind: 'stopped_en_route', label: 'Du stannade vid OKQ8 Solna', time: '18:05', lat, lng },
                  { kind: 'arrived_home', label: 'Du kom hem', time: '18:32', lat, lng }
                ]

Morgon — användaren öppnar appen
   └─► useWorkdayFlagPrompt visar StaleDayCorrectionDialog
          "Din arbetsdag stängdes automatiskt. När slutade du egentligen?"
          [ ] 17:42 — Du åkte från Bauhaus
          [ ] 18:05 — Du stannade vid OKQ8 Solna (på väg hem)
          [ ] 18:32 — Du kom hem
          [ ] Annan tid (tidsväljare)
          [ Avbryt ]    [ Bekräfta ]
   └─► Vid bekräftelse: justerar exited_at/end_time + markerar flag som löst
```

## Tidsförslag — datakällor

Cron-funktionen bygger `suggested_end_times` per användare/dag genom att kombinera:

1. **Sista geofence-EXIT** (från `staff_locations` eller senaste `workplace-exit` event sparat) — `kind: 'left_workplace'`. Det här är primärförslaget.
2. **Längre stopp under resa** — slå upp `staff_locations`-pings för dagen efter sista EXIT. Identifiera punkter där användaren stod stilla > 10 min (radius < 50m). Reverse-geocoda via befintlig Mapbox-token för läsbar etikett. Max 2 stopp.
3. **Hemankomst** — om `staff_inferred_home_locations` finns för användaren, hitta första ping inom 100m av hemmet efter sista EXIT — `kind: 'arrived_home'`.

Alla förslag sparas i `workday_flags.context` som JSON-array. Inga nya tabeller.

## Server-side cron — `close-stale-workday-entries`

**Fil:** `supabase/functions/close-stale-workday-entries/index.ts`
- Auth: `x-cron-secret` header mot `CRON_SECRET` env.
- Per organization, hittar öppna entries äldre än 14h.
- Stänger med provisionell sluttid (entered_at + 8h, clamped till slutet av entry_date).
- Bygger `suggested_end_times` (se ovan) genom att queryera `staff_locations` för dygnet.
- Skriver `workday_flag` med `kind: 'auto_closed_overnight'`, `severity: 'warning'`, `needs_user_input: true`, `context: { provisional_end_iso, suggested_end_times: [...], affected_entries: [{table, id}] }`.
- Schemalägger morgon-push via befintlig `send-push-notification`-funktion (delivery_at = imorgon 07:30 i org-tidszon).

**pg_cron:** schemalagt 02:00 UTC dagligen via `cron.schedule` + `net.http_post` med `x-cron-secret`.

## Klient — `StaleDayCorrectionDialog`

**Fil:** `src/components/mobile-app/StaleDayCorrectionDialog.tsx`
- Triggas från `useWorkdayFlagPrompt` när `kind === 'auto_closed_overnight'` och `needs_user_input = true`.
- Visar lista med radio-knappar för varje förslag i `context.suggested_end_times` + "Annan tid" (tidsväljare).
- Vid bekräftelse: anropar ny endpoint `mobile-app-api/correctStaleDayEnd` med `{flag_id, chosen_end_iso}`.
- Backend justerar relevanta `location_time_entries.exited_at` / `travel_time_logs.ended_at` / `time_reports.end_time` (de som listades i `affected_entries`), räknar om `total_minutes`, markerar flaggan som `resolved_at = now()`, `resolution_kind = 'user_corrected'`.

## Filer

**Nya:**
- `supabase/functions/close-stale-workday-entries/index.ts`
- `supabase/functions/close-stale-workday-entries/index.test.ts`
- `src/components/mobile-app/StaleDayCorrectionDialog.tsx`
- `src/hooks/useStaleDayCorrection.ts` (lyssnar på workday_flags realtime, öppnar dialog)

**Ändras:**
- `supabase/config.toml` — registrera funktionen
- `supabase/functions/mobile-app-api/index.ts` — ny route `correctStaleDayEnd`
- `supabase/functions/mobile-app-api/staleEntryAutoClose.test.ts` — avmarkera U/V/W/Y/Z, peka mot nya funktionen
- `src/components/mobile-app/MobileGlobalOverlays.tsx` — montera `useStaleDayCorrection`
- `src/components/admin/workdayFlagLabels.ts` (eller motsv.) — etikett för `auto_closed_overnight`

**Secrets:** `CRON_SECRET` (32-byte slumpsträng)

**Inga DB-migrationer** — alla tabeller finns (`location_time_entries`, `travel_time_logs`, `time_reports`, `workday_flags`, `staff_locations`, `staff_inferred_home_locations`).

## Validering

- **A**: Användare lämnar Bauhaus 17:42, stannar vid OKQ8 18:05, kommer hem 18:32, glömmer logga ut. Cron kör 03:00, skapar flag med 3 förslag.
- **B**: Användaren öppnar appen 07:00, ser dialog, väljer "17:42 — Du åkte från Bauhaus". Backend justerar `exited_at` till 17:42, räknar om minuter, löser flaggan.
- **C**: Användaren väljer "Annan tid" → tidsväljare → 18:00. Samma effekt med custom-tid.
- **D**: Inga staff_locations-pings finns (telefon avstängd) → bara `left_workplace`-förslaget visas + "Annan tid".
- **E**: Cron körs två gånger samma natt → andra körningen no-op (alla redan stängda).
- **F**: Org A:s entries påverkar inte org B.
- **G**: Anrop utan `x-cron-secret` → 401.

