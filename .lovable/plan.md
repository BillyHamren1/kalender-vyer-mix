## Vad jag uppfattat

Vi jobbar **enbart** med kartvyn (geofence-filter, ping-färger, datumkänslighet på projekt-geofences). Workday-systemet är borttaget och får inte återinföras. Jag fick inte spara till `mem://` i plan-läget, så jag behöver att du växlar till build mode för att lägga regeln på minnet.

## Plan

1. Skapa `mem://constraints/no-workday-logic-v1` med innehåll:
   - Förbjudet att återinföra workday-timers, `workday_flags`, EOD-dialoger, `process-day-timer-auto-stop`, `close-stale-workday-entries`, auto-arrival-workday, watchdog-stop osv.
   - Förbjudet att blanda in workday-resonemang i karta/GPS/geofence/Time Engine-arbete.
   - Gamla memories som nämner workday (workday-timer-v1, end-day-vs-end-activity-v2, planning-aware-watchdog-v1, workday-assistant-integration-v1, auto-arrival-start-v1, no-proactive-break-reminders-v1) är **historik**, inte aktiva regler.
   - Sanningen: tid = ren GPS-signal + admin-fördelning enligt Single Timer Policy + Time Engine.

2. Uppdatera `mem://index.md` Core-sektionen med en ny rad högst upp:
   > **No Workday Logic**: Workday-systemet är borttaget. Återinför aldrig workday/EOD/auto-stop-workday. Se [No Workday Logic](mem://constraints/no-workday-logic-v1).

3. Inga ändringar i appkoden i detta steg — vi fortsätter sedan på kartvyn där vi var.

Växla till build mode så lägger jag in det direkt.