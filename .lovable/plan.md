

## Fix: tydlig "Avsluta dagen"-knapp i timer-bannern

### Vad som faktiskt finns idag
- TimerRow har bara **en** röd "Avsluta"-knapp → kör `handleStop` (per-timer EOD-check, sparar bara den raden).
- Det finns INGEN "Avsluta dagen"-knapp i UI:t.
- "Avsluta dagen" finns bara som ett event (`request-end-day`) som dispatchas från `WorkDayAssistant` när den triggar `last_workplace_for_day`-prompten.
- Resultat: om assistenten inte triggar har användaren ingen knapp att avsluta dagen med → upplevs som att appen "fortsätter registrera".

### Vad jag bygger

**1. Lägg till en "Avsluta dagen"-knapp i `GlobalActiveTimerBanner`**
- Visas under timer-listan (under alla `TimerRow`) när `timers.size >= 1`.
- Sekundär stil (outline) så den inte konkurrerar visuellt med per-rad "Avsluta".
- onClick → `window.dispatchEvent(new CustomEvent('request-end-day'))` (samma event som assistenten redan använder, så vi går genom samma sekventiella EOD-kö).
- Disabled när `savingKeys.size > 0` eller `eodProcessingRef.current === true`.

**2. Förtydliga rad-knappens etikett**
- Byt "Avsluta" → "Avsluta aktivitet" på TimerRow så det blir uppenbart att den bara stoppar EN sak.
- Titeln (tooltip) förblir den nuvarande förklaringen.

**3. Säkerställ att event-flödet fungerar även när bannern är montered men listan är tom**
- Bannern monteras alltid (ligger i `MobileAppLayout`). Knappen renderas bara när det finns timers. Om alla timers redan är stoppade behövs inte knappen.

### Layout
```text
┌────────────────────────────────────┐
│ 🏢 Lager Stockholm     01:23:45    │
│ Startad 07:27          [Avsluta aktivitet] │
├────────────────────────────────────┤
│ 🏢 Projekt X          00:42:10    │
│ Startad 09:00          [Avsluta aktivitet] │
├────────────────────────────────────┤
│        [ Avsluta dagen ]            │  ← NY, sekundär
└────────────────────────────────────┘
```

### Berörda filer
- `src/components/mobile-app/GlobalActiveTimerBanner.tsx` — ny knapp + ändrad etikett

### Inte i denna ändring
- Ingen ändring av EOD-logiken eller `useWorkSession`
- Ingen ändring av `WorkDayAssistant`
- Ingen ändring av eventnamn (`request-end-day` återanvänds)
- Inga nya kontraktstester behövs (befintligt `request-end-day`-event används)

### QA efter implementation
1. Starta en location-timer i Lager → verifiera att "Avsluta dagen"-knappen syns i bannern.
2. Tryck "Avsluta aktivitet" → bara den raden stängs; knappen "Avsluta dagen" försvinner när sista timer är stängd.
3. Med 2+ aktiva timers, tryck "Avsluta dagen" → EOD-kön drar dem sekventiellt (en dialog i taget).
4. Med 1 aktiv timer som har geofence-exit >2 min → "Avsluta dagen" öppnar EndOfDayStopDialog för den.

