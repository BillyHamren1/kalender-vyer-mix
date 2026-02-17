
## Ny container på dashboarden: Alla bokningar

### Vad som ska byggas

En ny, fristående sektion längst ner på dashboarden (`PlanningDashboard.tsx`) som visar **alla bokningar precis som de är** — inga projektkopplingar, inga triageknappar. Enbart bokningsdata med sök och filter.

### Layout på dashboarden

```text
[Kalendervy]          [Nya bokningar]
                      (befintligt)

──────────────────────────────────────
  ALLA BOKNINGAR  (ny sektion, full bredd)
  [Sök...]  [Status ▾]  [Datum från]  [Datum till]
  ┌─────────────────────────────────────────────────┐
  │ #2601-1  A Catering   CONFIRMED   2026-02-20 ... │
  │ #2601-2  Företag AB   PENDING     2026-02-22 ... │
  │ ...                                              │
  └─────────────────────────────────────────────────┘
```

### Ny komponent: `DashboardAllBookings.tsx`

Skapas i `src/components/dashboard/`. Komponenten:

**Data**: Hämtar alla bokningar via `fetchBookings()` med React Query (queryKey: `['all-bookings-dashboard']`). Ingen filtrering på status i databasen — allt hämtas och filtreras lokalt.

**Sök** (fritextsökning):
- Söker på: klientnamn, bokningsnummer, leveransadress, stad

**Filtrerbar på**:
- Status: Alla / CONFIRMED / PENDING / CANCELLED / OFFER
- Datum från (eventDate)
- Datum till (eventDate)

**Bokningskort / rader** visar:
- Bokningsnummer (`#XXXX-X`)
- Klientnamn
- Status-badge (med befintlig `StatusBadge`-komponent)
- Riggdatum → Eventdatum → Returdatum
- Leveransadress + stad
- Antal produkter
- Klickbar → navigerar till `/booking/{id}`

**Utseende**: Samma stil som övriga dashboard-komponenter — rounded-2xl, gradient bakgrund, shadow. Tabellvy med hover-effekt per rad. Scrollbar vid många rader (`max-h-[600px] overflow-y-auto`).

**Tom-state**: Visar ett meddelande "Inga bokningar hittades" med ett filter-reset-alternativ.

### Ändring i `PlanningDashboard.tsx`

Lägg till den nya komponenten som en ny sektion under det befintliga grid:

```tsx
{/* Alla bokningar */}
<div className="mb-6">
  <DashboardAllBookings />
</div>
```

### Filer att skapa/ändra

1. **Ny fil**: `src/components/dashboard/DashboardAllBookings.tsx`
2. **Ändrad fil**: `src/pages/PlanningDashboard.tsx` — importera och rendera den nya komponenten

### Inga databasändringar behövs

Befintlig `fetchBookings()` används direkt. All filtrering sker på klientsidan i React-state.
