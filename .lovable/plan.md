## Problem

AI-kommentaren under varje GPS-dag babblar för att den inte vet vad personen *borde* göra (vilka jobb, vilken dags planering, vilka adresser), och den behandlar GPS-luckor som beteenden (sover/står stilla) istället för som datatäckningshål.

## Mål

Få kommentaren att låta som en arbetsledare som faktiskt känner organisationen: utgår från personens planerade jobb den dagen, känner igen andra organisations-jobb i närheten, och tystar oviktiga GPS-luckor istället för att spekulera om dem.

## Vad som ändras

### 1. Backend: ny kontextberikning i `gps-day-narrative`

Edge-funktionen tar idag emot färdiga "stays + moves" från klienten. Det räcker inte. Vi gör om den till att själv hämta organisationskontext för aktuell person + dag:

- **Planerade jobb idag**: läs `staff_assignments` × `calendar_events` för (staff_id, date) → lista med projekt/booking-namn, planerad start/slut, klient, adress, koordinater. Det är "vad personen *skulle* göra".
- **Närliggande organisationsjobb**: hämta alla aktiva projekt/large_projects/bookings för organisationen med geo (samma källa som `resolveWorkTargets`). Vi väger in dem som *kandidatförklaring* när ett okänt stopp ligger ≤ ~500 m från en känd jobbadress (även om personen inte var schemalagd där). Mappar t.ex. ett "okänt stopp" till "stannade vid jobbadressen Sveavägen 41 (projekt: Handelsbanken 2026)".
- **Boende/privata zoner**: samma logik som idag (hoppa över helt).

Detta läggs på serversidan så att vi (a) får org-isolering via RLS-säkert service role, (b) slipper skicka stora datamängder från klient, (c) kan caches per (staff, date) tillsammans med övrig tidslinje.

### 2. GPS-luckor: klassificera istället för att gissa

Klienten skickar redan stays + moves. Vi lägger till en tredje typ: `gap` — perioder mellan två stays där ingen ping fanns på X minuter och vi inte kan se rörelse. Reglerna:

- `gap.minutes < 60` ELLER `gap` ligger mellan två known-site-stays på samma plats → **utelämnas helt** i prompten (oviktig).
- `gap.minutes ≥ 60` och spänner över byte av plats → markeras `GPS_GAP` i prompten med tydlig instruktion "datatäckning saknas, gissa INTE vad personen gjorde".
- Natt (00–05 lokal tid) → utelämnas alltid, oavsett längd (matchar `night-auto-start-guard` och `night-gps-only-guard-ui`).

Detta görs i `useStaffGpsWeekSummary` så timeline-payloaden redan är "städad" när den når edge-funktionen, plus en spegelregel på serversidan så vi inte litar blint på klienten.

### 3. Ny prompt

System-prompten skrivs om från "nyfiken arbetsledare som spekulerar" till "erfaren arbetsledare som känner organisationen och dess jobb". Nyckelregler i prompten:

- Du får en lista över personens **planerade jobb idag** (med planerad tid + adress) — referera dem vid namn.
- Du får en lista över **andra närliggande organisationsjobb** — använd dem för att förklara okända stopp ("stannade vid Sveavägen 41 — det är vår jobbadress för projekt X").
- För okända stopp som inte matchar något jobb: använd POI/adress (Bauhaus, McDonald's, …) och spekulera *försiktigt* om syfte (lunch, materialinköp, tankning) — men bara om längd+tidpunkt gör det rimligt.
- **GPS-luckor**: nämn dem ENDAST när de bryter ett känt arbetsmönster (t.ex. försvinner mitt på dagen från projekt utan att dyka upp igen). Säg "GPS-signal saknas" — aldrig "personen sov/stod stilla". Korta luckor och nattluckor: nämn inte alls.
- Skriv 3–5 meningar, naturlig svenska, ingen markdown.
- Avsluta med "Inga avvikelser." enbart när dagen verkligen följer planen.

Modell: behåll `google/gemini-2.5-pro` (krävs för resonemang över strukturerad kontext).

### 4. Cache-nyckel uppdateras

`useStaffGpsDayNarrative` bumpar query-key till `v3` så befintliga cachade "babbel"-svar inte ligger kvar.

## Tekniska detaljer

Filer som ändras:

- `supabase/functions/gps-day-narrative/index.ts` — hämtar planerade jobb + närliggande org-jobb via service-role-klient, bygger berikad prompt, klassificerar gaps.
- `src/hooks/staff/useStaffGpsWeekSummary.ts` — lägger till `gap`-entries i `timeline` och filtrerar trivialer redan här. Skickar även `organization_id` med (om inte redan implicit via RLS).
- `src/hooks/staff/useStaffGpsDayNarrative.ts` — query-key bumpas till `v3`, payload utökas inte (kontexten hämtas på servern).
- Ingen DB-migration. Inget nytt UI.

## Vad detta inte gör

- Ändrar inte tidslinje-/tidrapport-vyer.
- Skriver inte tillbaka något till `time_reports` eller `staff_day_report_cache`.
- Försöker inte ersätta `analyze-unclear-segment` eller `ai-review-time-report-blocks` — det här är fortfarande en ren läs-AI för översiktskommentaren i veckopanelen.

## Test

Efter ändringen:
1. Deploy `gps-day-narrative`.
2. Curl-anropa funktionen för en dag där användaren vet vad som hände → verifiera att texten nämner rätt projekt och inte spekulerar om GPS-gap.
3. Öppna `/staff-management/gps-satellite-map` och granska 3–4 dagar i veckopanelen.
