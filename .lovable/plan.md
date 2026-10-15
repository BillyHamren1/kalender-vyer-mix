# Diagnos: Brain iOS projektlista "unavailable" (2026-10-15)

Endast läsning. Ingen kod, driftsättning eller data ändrad.

## Bevis från produktion
- planning-mobile-read, driftsatt version **31** (edge-loggar).
- Anrop i par, mönster sida 1 OK / sida 2 fel:
  - 06:58:21 200 (2024 ms) → 06:58:23 **503 planning_read_failed** (541 ms)
  - 06:58:26 200 (890 ms) → 06:58:28 **503 planning_read_failed** (595 ms)
- Inga anrop kl 07:00–07:05 utöver shutdown-loggar. Felet uppstår efter signatur, nonce och behörighet (annars 401/403).
- PLANNING_BRAIN_READ_SIGNING_SECRET: finns (värdet inte läst).

## Schema (live) – ingen avvikelse
Alla valda kolumner finns: projects.deleted_at/is_internal/planning_status, calendar_events.source_date/times_locked, booking_staff_assignments.role/team_id/assignment_date. Inget saknat fält.

## Orsak (bekräftad med radantal)
`index.ts` rad 212–231: listan kör tre frågor med **samma** `range(offset, offset+199)` och `count: 'exact'`. Frans August oktober 2026:
- projects (ej raderade): 310 → sida 2 (offset 200) giltig
- calendar_events i perioden: 59
- booking_staff_assignments i perioden: 102

På sida 2 begär koden rad 200–399 av kalendern/personalen, som bara har 59/102 rader. PostgREST svarar då **HTTP 416, PGRST103 "Requested range not satisfiable"**, vilket koden slår ihop till 503 planning_read_failed. Infördes när projektlistan blev "alla icke-raderade projekt" (fler än 200) medan kalender/personal behöll samma offset.

## Fix för Codex (i git)
- Paginera endast projects med `offset`. Läs kalender och personal för perioden en gång (begränsat, t.ex. LINK_LIMIT 2000 med count-kontroll → 503 window_too_large), eller endast på sida 1, oberoende av projektsidans offset.
- Alternativt: behandla PGRST103 som tom sida per fråga – men separat paginering är det korrekta.
- Logga failande steg (`projects|calendar_events|assignments`) + PostgREST-kod i outcome-loggen, utan id:n.
- Regressionstest: 310 projekt, 59 händelser, 102 tilldelningar, offset=200 → 200 med 110 projekt.

## Repo-version
Lokal index.ts sha256 64e0f3f3…6fa3c, senaste commit som rör funktionen 852d0d68 (2026-10-15 07:05 UTC). Driftsatt v31; byte-jämförelse mot bundlen ej gjord.
