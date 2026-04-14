

## Smart ankomsttid — GPS-baserad tidskorrigering

### Koncept

När användaren trycker "Starta" i geofence-prompten, men det har gått tid sedan GPS:en först detekterade att hen var inom radien, visas ett meddelande: *"Enligt GPS anlände du kl. 08:00. Vill du korrigera starttiden?"* med möjlighet att använda ankomsttiden eller nuvarande tid.

### Tekniska ändringar

**1. `useGeofencing.ts` — Spara ankomsttid**
- Lägg till `arrivalTimestamp?: number` i `GeofenceEvent`-interfacet
- När en enter-event triggas (rad ~237), sätt `arrivalTimestamp: Date.now()` på eventet
- Denna timestamp bevaras i state tills användaren agerar

**2. `GeofencePrompt.tsx` — Visa tidsavvikelse**
- Beräkna `timeSinceArrival = now - event.arrivalTimestamp`
- Om > 5 minuter: visa ett info-meddelande med den formaterade ankomsttiden
- Lägg till en tredje knapp/alternativ: "Starta från [08:00]" bredvid den vanliga "Starta"
- Callback ändras från `onConfirm()` till `onConfirm(correctedStartTime?: string)` så att anroparen vet om användaren vill korrigera

**3. `MobileJobs.tsx` — Hantera korrigerad tid**
- `handleGeofenceConfirm` tar emot valfri `correctedStartTime`
- Om korrigerad tid skickas: `startTimer(...)` anropas med den tiden som `startTime` istället för `new Date().toISOString()`

**4. `useGeofencing.ts` — startTimer med valfri starttid**
- Lägg till `customStartTime?: string` parameter i `startTimer`
- Använd `customStartTime || new Date().toISOString()` som `startTime` i ActiveTimer

### UI-flöde

```text
┌─────────────────────────────┐
│  Du är vid projektet!       │
│  141m från Swedish game fair│
├─────────────────────────────┤
│  Swedish game fair          │
│  Venngarn D:38              │
│                             │
│  ⚠ Enligt GPS anlände du   │
│  kl. 08:00 (för 2h sedan)  │
│                             │
│  ┌──────────┐ ┌───────────┐│
│  │ Inte nu  │ │▼ Starta   ││
│  └──────────┘ └───────────┘│
│  ┌─────────────────────────┐│
│  │ 🕐 Starta från 08:00   ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `useGeofencing.ts` | Lägg till `arrivalTimestamp` i GeofenceEvent, `customStartTime` i startTimer |
| `GeofencePrompt.tsx` | Visa ankomsttid-meddelande + extra knapp om > 5 min skillnad |
| `MobileJobs.tsx` | `handleGeofenceConfirm` hanterar korrigerad starttid |

