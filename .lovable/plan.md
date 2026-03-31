

## Packningskalender för "Planera packning"

### Vad byggs
En månads-/veckokalender som visar **packningsprojekt** baserat på deras `start_date` och `end_date` (synkade från bokningen). Ingen rigg/event/riv — bara packningsrelaterad data: klientnamn, status och packningsperiod.

### Design

```text
┌──────────────────────────────────────────────────┐
│  [Månad] [Vecka]        ◀  April 2026  ▶        │
├──────────────────────────────────────────────────┤
│ Mån │ Tis │ Ons │ Tor │ Fre │ Lör │ Sön         │
├─────┼─────┼─────┼─────┼─────┼─────┼─────────────┤
│  6  │  7  │  8  │  9  │ 10  │     │              │
│     │ ▌Kund AB ━━━━━━━━━━━▌  (Planering)        │
│     │     │ ▌Festival ━━━━━━━▌   (Packad)        │
│     │     │     │     │ ▌XY Corp▌ (Under arbete) │
└──────────────────────────────────────────────────┘
```

- Varje packning visas som en horisontell bar från `start_date` till `end_date`
- Packningar utan datum visas i en "Ej schemalagda"-sektion under kalendern
- Färgkodning baserat på **packningsstatus** (planning=blå, in_progress=gul, packed=teal, delivered=lila, completed=grön)
- Klick → navigerar till `/warehouse/packing/{id}`

### Teknisk plan

**1. Skapa `src/components/packing/PackingCalendarView.tsx`**
- Props: `packings: PackingWithBooking[]`
- State: `viewMode` (month/week), `currentDate`
- Månadsvy: 7-kolumns grid, packningar renderas som multi-day bars
- Veckovy: samma grid men bara 7 dagar, mer vertikal plats
- Navigation med pilar, "Idag"-knapp
- Statusfärgkodade bars med klientnamn
- Klick → `navigate(/warehouse/packing/{id})`

**2. Uppdatera `src/pages/PackingManagement.tsx`**
- Importera och rendera `PackingCalendarView` mellan IncomingPackingList och PackingDashboard
- Skicka befintlig `packings`-data

### Filer
- **Skapa**: `src/components/packing/PackingCalendarView.tsx`
- **Ändra**: `src/pages/PackingManagement.tsx`

