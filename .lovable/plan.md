

## Varning vid manuell timerstart utanför geofence

### Problem
När en användare manuellt startar en timer (utan geofence-prompt) finns ingen kontroll av om de faktiskt befinner sig nära arbetsplatsen. De kan av misstag starta timer för fel jobb.

### Lösning
Innan `startTimer` anropas vid manuellt klick, kontrollera avståndet mellan `userPosition` och bokningens/projektets/platsens koordinater. Om avståndet överstiger geofence-radien (150m), visa en bekräftelsedialog:

> *"Du verkar inte vara vid [Platsnamn]. Avståndet är ca [X] m. Vill du starta timern ändå?"*

### Ändringar

| Fil | Ändring |
|-----|---------|
| `useGeofencing.ts` | Exportera `haversineDistance` och `ENTER_RADIUS` |
| `MobileJobs.tsx` | I `handleTimerToggle` och `handleProjectTimerToggle`: beräkna avstånd, visa confirm-dialog om utanför radie |
| `MobileJobDetail.tsx` | Samma check i `handleTimerToggle` för detaljvyn |
| Ny: `DistanceWarningDialog.tsx` | Enkel bekräftelsedialog med avståndsinformation |

### UI-flöde

```text
┌──────────────────────────────┐
│  ⚠ Du verkar inte vara      │
│  i närheten                  │
├──────────────────────────────┤
│                              │
│  Enligt GPS befinner du dig  │
│  ca 2.3 km från "Kund AB".  │
│                              │
│  Vill du starta timern ändå? │
│                              │
│  ┌──────────┐ ┌────────────┐ │
│  │ Avbryt   │ │ Starta ändå│ │
│  └──────────┘ └────────────┘ │
└──────────────────────────────┘
```

### Logik
- Kräver att `userPosition` finns och att bokningen har koordinater
- Om ingen GPS eller inga koordinater → inget hinder (starta direkt)
- Tröskel: `ENTER_RADIUS` (150m) — samma som geofence
- Dialogen visas bara vid **manuell** start, inte vid geofence-bekräftelse (den är redan platsbaserad)

