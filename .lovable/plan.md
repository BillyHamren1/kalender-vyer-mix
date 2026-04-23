

# AI verklighetschecker — auto-korrigerar tyst, ingen admin-övervakning

## Princip

Systemet observerar löpande vad GPS säger vs vad loggarna säger. När AI:n är **högst sannolikt** säker (>0.85) **rättas det tyst** utan notis till användaren eller admin. Bara osäkra fall (0.5–0.85) frågar användaren själv. Admin involveras aldrig i den löpande korrigeringen.

## Konfidensnivåer och handling

| Konfidens | Handling | Synlighet |
|---|---|---|
| **>0.85** | Auto-korrigera tyst | Loggas i `ai_reality_corrections` (audit), ingen UI-notis |
| **0.5–0.85** | Push till användaren själv: "Är du på Lager nu? Ja/Nej" | Bara användarens egen mobil |
| **<0.5** | Ingen åtgärd | Loggas tyst som "uncertain", inget händer |

Admin-banner i `StaffTimeReports` **utgår helt** från planen.

## Vad som auto-korrigeras tyst (>0.85)

Konkreta fall där GPS-bevis är så starkt att inget mänskligt beslut behövs:

1. **Travel utan destination + 3+ pings inne i känd geofence i 10+ min** → stäng travel på första pingen i geofencen, öppna location-entry, skapa workday om saknas. Exakt Raivis-fallet idag.
2. **Öppen location-entry + GPS visar att personen lämnat geofencen för >30 min** → stäng location-entry på sista pingen inne i geofencen.
3. **Workday öppen + ingen aktivitet senaste 4h + sista GPS-ping >2h gammal** → stäng workday på sista aktivitetsspår.
4. **Öppen workday över midnatt utan aktivitet efter 22:00** → stäng på sista aktivitet samma dag.

Allt loggas till `ai_reality_corrections` så att:
- användaren kan se vad som korrigerades i `/m/my-flags` (fortfarande transparent, bara inte avbrytande)
- admin kan i efterhand revidera via en passiv historik-vy (inte en aktiv banner)
- en `Ångra`-knapp finns på varje korrigering i 7 dagar

## Vad som frågar användaren (0.5–0.85)

- Travel öppen + GPS i okänd plats utan geofence → push: "Är du framme? Vart?"
- Två geofences överlappar → push: "Är du på Lager eller på Westmans?"
- Workday öppen utan aktivitet men GPS rör sig → push: "Jobbar du fortfarande?"

Push:en visas en gång, snooze 1h om ignorerad, max 3 ggr/dag.

## Tekniska komponenter

**Ny edge function:** `reality-reconciler`
- Cron var 5:e min via `pg_cron` + `pg_net`
- Auth via `x-cron-secret`
- Per org: hämta aktiva staff (öppen workday/travel/location eller GPS-ping senaste 30 min)
- Pre-filter: hoppa över staff där inget ändrats sedan senaste check (sparar ~80% av AI-anrop)
- För övriga: bygg situationsrapport, anropa Lovable AI Gateway (`google/gemini-3-flash-preview`, low effort, structured output via tool calling)
- Branchning på konfidens enligt tabell ovan
- Auto-apply via befintliga helpers i `mobile-app-api` (close_travel, create_location_entry, ensure_workday)

**Ny tabell:** `ai_reality_corrections`
```
id uuid PK
organization_id uuid
staff_id uuid
detected_at timestamptz
situation_kind text
confidence numeric
ai_reasoning text             -- svensk förklaring
applied_actions jsonb         -- vad som faktiskt gjordes
status text                   -- applied | asked_user | uncertain | reverted
reverted_at timestamptz
reverted_by uuid
push_sent_at timestamptz
push_response text            -- yes | no | snoozed | ignored
```
RLS: tenant-isolerad, staff ser sina egna, admin ser alla i org.

**Ny delad helper:** `supabase/functions/_shared/situation-builder.ts`
- En SQL-batch per staff som returnerar: öppen workday, öppen travel, öppna location-entries, senaste 2h GPS-pings, geofence-träffar, senaste manuella interaktion.

**Ny delad helper:** `supabase/functions/_shared/reality-actions.ts`
- `applyCloseTravelAndOpenLocation(staffId, geofenceId, atIso)`
- `applyCloseStaleLocation(staffId, entryId, atIso)`
- `applyCloseStaleWorkday(staffId, workdayId, atIso)`
- `applyEnsureWorkday(staffId, atIso)`
Alla idempotenta, alla loggar till `ai_reality_corrections`.

**Push-notiser:** befintlig FCM-pipeline via `unified-messaging` — ny notistyp `reality_check` med Ja/Nej-knappar.

**Mobil UI:** `/m/my-flags` får en sektion "Automatiska korrigeringar (senaste 7d)" med ångra-knapp. Inga avbrytande dialoger.

**Engångs-cleanup för Raivis idag:** migration som stänger travel kl 13:31, skapar Lager-entry från 13:31, skapar workday från 07:05.

## Filer som skapas/ändras

- **Ny:** `supabase/functions/reality-reconciler/index.ts`
- **Ny:** `supabase/functions/_shared/situation-builder.ts`
- **Ny:** `supabase/functions/_shared/reality-actions.ts`
- **Ny migration:** `ai_reality_corrections`-tabell + RLS + index
- **Engångs-fix:** Raivis 2026-04-23 (close travel + open location + create workday)
- **Cron:** `pg_cron` schedule var 5:e min
- **Ändras:** `src/pages/mobile/MyFlags.tsx` — sektion för auto-korrigeringar med ångra
- **Ändras:** `supabase/config.toml` — `reality-reconciler` med `verify_jwt = false`
- **Test:** `supabase/functions/reality-reconciler/situation_builder_test.ts` — Raivis-fallet detekteras och auto-korrigeras

## Resultat

- Raivis-typ-fall städas tyst inom 5 min — ingen ser, inget stör
- Användaren får bara en push när AI:n faktiskt är osäker
- Admin behöver aldrig sitta och övervaka — `StaffTimeReports` förblir ren
- Full audit i `ai_reality_corrections` om något skulle se konstigt ut i efterhand
- Ångra-möjlighet i 7 dagar för transparens, utan att tvinga användaren att agera

