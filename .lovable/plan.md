

## Fix: Bekräftelsedialog innan signering + teal-färg

### Ändringar i `src/components/scanner/ManualChecklistView.tsx`

1. **Ändra knappfärg** från `bg-green-600 hover:bg-green-700` till `bg-primary hover:bg-primary/90` (teal).

2. **Lägg till bekräftelsedialog** med `ConfirmationDialog`-komponenten (finns redan i projektet). När användaren trycker "Signera" visas frågan:
   - Titel: "Signera packlista"
   - Beskrivning: "Har du säkerställt att allt i listan är packat?"
   - Bekräfta: "Ja"
   - Avbryt: "Nej"
   - Vid bekräftelse: `toast.success('Signering klar!')`

3. **Wrappa knappen** med `ConfirmationDialog` som trigger.

```text
Tryck "Signera"
    ↓
┌─────────────────────────────────┐
│  Signera packlista              │
│                                 │
│  Har du säkerställt att allt    │
│  i listan är packat?            │
│                                 │
│            [ Nej ]  [ Ja ]      │
└─────────────────────────────────┘
    ↓ Ja
  toast('Signering klar!')
```

