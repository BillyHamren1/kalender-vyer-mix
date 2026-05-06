
## Mål

Producera en komplett, läsbar rapport över **varje beslut systemet tagit idag (2026-05-06) för din org** — så vi kan se exakt vad som auto-startats, auto-stängts, vad som är förslag vs sanning, och var datan blivit fel.

## Vad rapporten kommer att täcka

Per anställd, kronologiskt under dagen, med beslut + källa + confidence + om beslutet skrev till sanning eller bara till förslag:

1. **Workdays** — varje rad: vem startade (`started_by`: staff själv / `server_workday_first` / `server_auto_start_repair` / admin), `metadata.auto_start_source`, `reason_codes`, `confidence`, start/slut, review_status.
2. **Location time entries (LTE)** — varje timer: `source` (manual / `auto_start` / `location_auto` / watchdog), entered/exited, `total_minutes`, `stop_source` + `stop_reason` + `stopped_by`, `metadata.auto_start`.
3. **Time reports** — varje rad: `source`, start/end, hours_worked, `source_entry_id` (kopplad till LTE?), booking/large_project/location, approved.
4. **Travel logs** — varje rad: `source` (`gap_derived` / `gps` / `manual`), `auto_detected`, from→to, godkänd?
5. **Assistant events** — varje arrival/departure/home_arrival: `suggested_action`, `resolution_status` (pending / auto_closed_by_later_action / dismissed / applied_*), kopplad till workday/LTE/time_report?
6. **Workday flags** — varje flagga: typ, severity, om resolved.
7. **Process-location-auto-start backfill-körningen** — vad den faktiskt skrev: 11 LTE-rader + 22 assistant_events + 4 switch + 4 travel, med vilka staff/targets.

## Format

* **CSV-bundle** i `/mnt/documents/decisions-2026-05-06/`:
  - `workdays.csv`
  - `location_time_entries.csv`
  - `time_reports.csv`
  - `travel_logs.csv`
  - `assistant_events.csv`
  - `workday_flags.csv`
  - `auto_decisions_summary.csv` (en rad per beslut: tid, staff, beslut, källa, confidence, target, resultat)
* **Markdown-sammanfattning** `decisions-2026-05-06/REPORT.md` som per anställd listar:
  - Vad fanns innan idag startade
  - Vilka auto-beslut systemet tog (med tidsstämpel + källkod-path)
  - Vad användaren gjort manuellt
  - Vilka beslut som ser felaktiga ut (öppna pågående workdays utan slut, LTE utan stop, dubbletter, motstridiga assistant_events, gap_derived travel >180 min, etc.)

## Genomförande (default-mode)

1. Kör SQL-queries mot alla 6 tabellerna filtrerade på `organization_id = f5e5cade-…` och dagens Stockholm-fönster.
2. Skriv ett Python-script som joinar staff_members, organization_locations, bookings, large_projects för läsbara namn.
3. Generera CSV + markdown till `/mnt/documents/`.
4. Leverera nedladdningsbara artifacts.

## Vad jag INTE gör

* Inga skrivningar/cleanups av datan i denna omgång — bara rapport.
* När du sett rapporten väljer du vilka beslut som ska rullas tillbaka eller korrigeras.

Säg "kör" så genererar jag rapporten direkt.
