## Mål

Gör om `PhaseDatesEditor` (höger widget i `BookingPlacementDialog`) till en **wizard med 3 steg** istället för att visa alla tre faserna staplade samtidigt:

1. **Steg 1 – RIG** (riggdagar, tider, team)
2. **Steg 2 – EVENT** (eventdagar, tider, team)
3. **Steg 3 – NEDRIGG** (demonteringsdagar, tider, team)

Personalkalendern till vänster fortsätter att visa alla valda dagar (rig + event + rigDown) hela tiden — bara editorn till höger blir stegvis.

## UI

Wizard-widget överst i `PhaseDatesEditor`:

```text
┌───────────── Datum & tider ────────────┐
│  ●─────○─────○                         │
│  Rig   Event Nedrigg     (Steg 1 av 3) │
├────────────────────────────────────────┤
│  [Aktuell fas: PhaseBlock-innehållet]  │
│                                        │
│   Kalender (en månad i taget)          │
│   Start / Slut                         │
│   Team                                 │
├────────────────────────────────────────┤
│         [← Tillbaka]   [Nästa →]       │
└────────────────────────────────────────┘
```

- Stepper visar tre prickar med fasnamn och en räknare "Steg X av 3".
- Klick på en prick hoppar direkt till den fasen (fri navigation, inga lås).
- Steg 1: bara **Nästa →**.
- Steg 2: **← Tillbaka** + **Nästa →**.
- Steg 3: **← Tillbaka** (ingen Nästa — användaren använder dialogens egen **Slutför planering**-knapp i footern).
- Klar-markering: en fas räknas som "klar" (grön bock på steppern) om minst en dag är vald för fasen, eller om fasen är låst (`isPhaseLocked`).
- Låst fas (`Fast tid`-badge) visas som tidigare i den aktiva stegvyn.

## Förändring per fil

**`src/components/project/PhaseDatesEditor.tsx`**
- Lägg till `const [step, setStep] = useState<DayKind>('rig')`.
- Ersätt `PHASES.map(...)`-renderingen med:
  - En `PhaseStepper`-rad (3 prickar, klickbara, visar klar/aktiv/inaktiv).
  - Render endast `<PhaseBlock phase={step} ... />`.
  - Navigationsknappar (`← Tillbaka` / `Nästa →`) under PhaseBlock.
- Ingen ändring av `PhaseBlock`-internerna eller props-API:t mot `BookingPlacementDialog`.

**`src/components/project/BookingPlacementDialog.tsx`**
- Ingen ändring i logik. `PlacementDayCalendar` får fortfarande `calendarDates` (alla faser), så personalkalendern visar hela bilden även medan användaren bara redigerar en fas i taget.

## Det här ändras inte

- Spar-flöde (`handleFinish`), datamodell, `PlanningDay`, `seedDaysFromBooking`, kalender-skrivningar.
- Personalkalendern till vänster (visar fortsatt alla dagar).
- "Detta är ett stort projekt"-checkboxen och dess kontroller (ligger kvar utanför wizarden, under).
- Inga DB-ändringar, inga edge functions, inga policies.
