

# Full översättning av mobilappen — alla synliga UI-strängar

## Mål
När användaren väljer engelska i mobilappen ska **inget** svenskt visas. Inga halvöversatta dialoger, inga svenska toasts, inga svenska knappar.

## Vad som täcks (allt UI i `/m/`)

### Skärmar (pages)
Alla sidor under `src/pages/mobile/`:
- Hem, Mina jobb, Jobbdetalj, Tidrapport, Mina avvikelser, Mina flaggor, Profil, Inställningar, Inloggning, Resor, Kvitton, Meddelanden, Lager-uppgifter, Uppgiftsdetalj, m.fl.
- Inkluderar: rubriker, tomma states ("Inga jobb idag"), filterchips, statusbadges, datum-/tidsformat, knapp­etiketter.

### Dialoger & overlays
Alla 14 dialoger från etapp 1 + alla övriga modaler:
- Stop/Break, WorkDayAssistant, ActivityLeave, EndOfDay, AnomalyClassification, Arrival, EndDayOnArrivalHome, LastShift, NextAction, StaleDay, StaleTimer, TimerConflict, TravelCompleted, UnifiedArrival, Geofence, SmartArrival, samt bekräftelse-/varningsdialoger.

### Komponenter i mobil-shell
- `MobileHeader`, `MobileBottomNav`, `GlobalActiveTimerBanner`, `WorkDayHeaderTimer` (label only — siffror är språk­neutrala), notis-toasts, offline-banner, sync-indikator.

### Toasts & systemmeddelanden
Alla `toast.success/error/info`-anrop som skickas från mobilkoden — felmeddelanden vid timer-start, sparbekräftelser, GPS-fel, nätverksfel, etc.

### Formulär
Placeholders, valideringsfel, hjälptexter, knappar (Spara/Avbryt/Bekräfta osv).

## Arbetssätt

1. **Inventera**: gå igenom varje fil under `src/pages/mobile/` och `src/components/mobile-app/` och lista varje hårdkodad svensk sträng.
2. **Lägg in nycklar**: alla strängar läggs in i `src/i18n/translations.ts` med svenska + engelska parallellt.
3. **Koppla in**: byt ut hårdkodade strängar mot `t('nyckel')` (med interpolation där det behövs, t.ex. `t('greeting', { name })`).
4. **Verifiera per skärm**: gå igenom appen skärm för skärm i engelskt läge och bekräfta att inget svenskt syns.
5. **Lås in**: lägg till en enkel lint-regel/guideline så framtida kod aldrig kan introducera hårdkodad svenska i `/m/`.

## Etapper (så du ser progress, inte en jätteklump)

- **Etapp A — Dialoger** (de 14 från förra omgången): koppla in nycklarna jag redan lagt in.
- **Etapp B — Mobil-shell**: header, bottom nav, banners, toasts.
- **Etapp C — Huvudskärmar**: Hem, Mina jobb, Jobbdetalj, Tidrapport.
- **Etapp D — Sekundära skärmar**: Resor, Kvitton, Meddelanden, Lager-uppgifter, Profil, Inställningar, Mina flaggor, Mina avvikelser.
- **Etapp E — Slutgenomgång**: jag går igenom appen i engelskt läge och fixar allt jag ser som fortfarande är svenskt.

Efter varje etapp får du tillbaka appen i fungerande skick — du kan testa och säga "fortsätt".

## Vad du som användare behöver göra
Ingenting tekniskt. Bara byta språk i appen och säga till om du ser något svenskt kvar.

## Garanti
Inga ändringar i logik, dataflöden, timer-arkitektur eller dagtimer. Bara strängar.

