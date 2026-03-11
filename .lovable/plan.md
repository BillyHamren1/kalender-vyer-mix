

# Systemanalys: Planner — Nuläge, Problem & Luckor

## Arkitekturöversikt

```text
┌─────────────────────────────────────────────────────────┐
│  App.tsx                                                │
│  ├── CalendarContext (legacy: lastViewedDate, lastPath) │
│  ├── PlannerStoreProvider (ny: central state)           │
│  └── LegacyStateBridge (syncar context → store)        │
├─────────────────────────────────────────────────────────┤
│  Pages                                                  │
│  ├── CustomCalendarPage (lokal useState × 8)            │
│  └── WarehouseCalendarPage (lokal useState × N)         │
├─────────────────────────────────────────────────────────┤
│  Hooks (datakällor)                                     │
│  ├── useRealTimeCalendarEvents (events, realtime sub)   │
│  ├── useWarehouseCalendarEvents                         │
│  ├── useDashboardEvents                                 │
│  ├── useUnifiedStaffOperations                          │
│  └── useTeamResources                                   │
├─────────────────────────────────────────────────────────┤
│  Adapters / Store                                       │
│  ├── plannerStore (useReducer, selector hooks)          │
│  ├── planner-event-adapters (→ PlannerEvent)            │
│  ├── usePlannerEvents (unified wrapper)                 │
│  ├── useMemoizedEvents (dedup + ref stability)          │
│  ├── useEventEditController (mutex)                     │
│  └── eventEditHelpers (shared update logic)             │
├─────────────────────────────────────────────────────────┤
│  Components (rendering)                                 │
│  ├── CustomCalendar → TimeGrid → CustomEvent            │
│  ├── custom/CustomResourceTimeGrid → ResourceColumn     │
│  └── EventHoverCard, QuickTimeEditPopover, etc.         │
└─────────────────────────────────────────────────────────┘
```

---

## PROBLEM 1: PlannerStore skapades men används inte

**Status:** Storen finns, selector-hooks finns, men **ingen komponent läser från den**. Bara `usePlannerSync()` skriver till den från 3 ställen (App.tsx, CustomCalendarPage, WarehouseCalendarPage). Storen är en "write-only" dead store.

**Konsekvens:** Hela investeringen i centraliserad state ger inget värde ännu. Komponenter fortsätter läsa från lokala `useState`.

---

## PROBLEM 2: useEventEditController — per-instans, inte global

`useEventEditController()` anropas **inuti varje `CustomEvent`**. Varje event-instans har sin **egen** controller med eget state. Mutex:en skyddar alltså bara mot konflikter *inom samma event-komponent*, inte mellan olika events.

**Konsekvens:** Om användaren klickar quick-edit på Event A och sedan på Event B, kan båda vara öppna samtidigt — exakt det scenariot controllern var tänkt att förhindra.

**Fix:** Controllern måste lyftas till en gemensam nivå (Context eller PlannerStore) och konsumeras via context i CustomEvent.

---

## PROBLEM 3: Dubblerad datahämtning

`useRealTimeCalendarEvents` hämtar **alla** events globalt (`fetchCalendarEvents()` utan datumfilter), sedan gör en andra query för alla bookings. Den returnerar alla events till CustomCalendarPage som i sin tur filtrerar per dag/resurs i `getEventsForDayAndResource`.

**Konsekvens:**
- Ingen datumavgränsning — vid 1000+ events hämtas allt
- Booking batch-query körs även om events inte ändrats
- `refreshEvents` anropas två gånger i `handleEventResize` (rad 73-76 i CustomCalendar.tsx)

---

## PROBLEM 4: console.log-spam i produktion

`TimeGrid.tsx` rad 156-183 har **fyra** `console.log`-anrop i `getEventPosition()` — som körs **per event per render**. Med 100 events × 7 dagar = hundratals logs per frame.

---

## PROBLEM 5: Trippel state-lager utan klar ägare

Samma datum-/vy-state existerar i tre lager:
1. `CalendarContext` (App.tsx) — `lastViewedDate`
2. `PlannerStore` — `selectedDate`, `viewMode`
3. Lokal `useState` i CustomCalendarPage — `currentWeekStart`, `viewMode`

Data flödar: **lokal → store** (via sync) och **context → store** (via bridge), men ingen komponent läser från store. Det finns ingen garanti att alla tre är synkade vid race conditions.

---

## PROBLEM 6: usePlannerEvents / planner-event-adapters — oanvända

Adaptrarna (`fromCalendarEvent`, `fromWarehouseEvent`, etc.) och `usePlannerEvents` har tester men **importeras inte** av någon komponent utanför test-filer. `PlannerEvent`-typen finns men inget i renderträdet använder den.

---

## PROBLEM 7: useMemoizedEvents — oanvänd

`useStableEvents` och `useResourceDateEvents` skapades men **importeras inte** av någon komponent.

---

## PROBLEM 8: eventEditHelpers — delvis oanvända

`updateEventTime()` och `moveEventToDate()` finns som shared helpers men QuickTimeEditPopover och MoveEventDateDialog verkar fortfarande använda sin egna logik internt. Bara `validateTimeRange` och `validateDate` är testade.

---

## PROBLEM 9: Brist i TimeGrid — O(n) filter per resurs per dag

`getEventsForDayAndResource` i CustomCalendar.tsx (rad 63-71) gör `events.filter()` för **varje** resurs × dag-kombination. Med 7 dagar × 5 resurser × 200 events = 7000 iterationer per render, utan memoization.

---

## PROBLEM 10: CustomEvent skapar nya hook-instanser per render

Varje `CustomEvent` anropar:
- `useEventNavigation()` — skapar ny instans
- `useEventEditController()` — skapar ny instans (problem 2)

Med 100 synliga events = 200 hook-instanser som alla skapar egna refs, callbacks, state.

---

## Sammanfattning: Vad som bör åtgärdas

| Prioritet | Problem | Svårighetsgrad |
|-----------|---------|----------------|
| **Kritisk** | EditController per-instans (ingen verklig mutex) | Medel — lyft till context |
| **Hög** | PlannerStore write-only (ingen läser) | Medel — börja läsa från store |
| **Hög** | console.log-spam i TimeGrid | Trivial — ta bort |
| **Hög** | getEventsForDayAndResource utan memo | Låg — memoize med useMemo |
| **Medel** | Oanvända abstraktioner (adapters, memoized hooks) | Koppla in eller ta bort |
| **Medel** | Dubbel refreshEvents i handleEventResize | Trivial |
| **Låg** | Trippel date-state utan tydlig ägare | Kräver migrationsstrategi |
| **Låg** | Obegränsad datahämtning (alla events) | Kräver backend/query-ändring |

---

## Vad som FUNGERAR bra

- **Dedup-guard** i realtime-synken (rad 150-156) — skyddar mot INSERT-dubbletter
- **dateUtils.ts** — solid, centraliserad UTC-hantering
- **Testlagret** — 159 tester täcker adapters, store, utils, controller
- **React.memo** på CustomEvent, EventHoverCard, ResourceColumn
- **Batch booking-query** istället för N+1

