---
name: WorkDay Timer (Day Clock)
description: Header day-timer that auto-starts at first activity timer and runs until user explicitly ends the day
type: feature
---
EventFlow Time visar en lugn "dagtimer" uppe i headern (`WorkDayHeaderTimer`, monterad inuti `HeaderShell` så den följer alla mobile headers).

Regler:
- Källa: `useWorkDayTimer` (ny hook). Persisterar start-ISO i localStorage `eventflow-workday-start`.
- Auto-start: när första aktivitets-timer startar (lyssnar på `timer-state-changed`) adopteras tidigaste `startTime` från `eventflow-mobile-timers` som dagstart. Backdaterade starter (ankomst-popup) flyttar dagstarten bakåt.
- Auto-recovery: om `WORKDAY_KEY` saknas men aktiv timer finns → adopteras tidigaste startTime. Omöjligt att "tappa" dagtimern vid reload.
- Day-rollover: stale workday-start utan aktiva timers äldre än 18h kasseras.
- Avsluta: rensas endast på `workday-ended`-eventet, som dispatchas av `GlobalActiveTimerBanner.processNextEod` när EOD-kön har dränerats och inga timers återstår. Aldrig auto-stopp baserat på inaktivitet.
- Visning: kompakt pill (Sun-ikon + HH:MM:SS / MM:SS) i `bg-primary-foreground/10`. Pointer-events none, overlayad i header top-right.

Filer: `src/hooks/useWorkDayTimer.ts`, `src/components/mobile-app/WorkDayHeaderTimer.tsx`, `src/components/mobile-app/MobileHeader.tsx` (HeaderShell-overlay), `src/components/mobile-app/GlobalActiveTimerBanner.tsx` (dispatch `workday-ended`).
