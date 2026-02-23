

## Plan: Ekonomisk översikt med tidsgruppering och projektstatus

### Vad ska byggas

1. **Tidsgrupperad summering** -- En knapprad (Dag/Vecka/Manad) langst upp pa ekonomisidan som grupperar och summerar alla projektsiffror per vald tidsperiod baserat pa bokningens eventdatum.

2. **Visa projektstatus i listan** -- Varje projekt i tabellen "Alla projekt" far en tydlig badge som visar om projektet ar oppet (Planering/Pagaende) eller stangt (Avslutat/Levererat).

3. **Stanga projekt fran ekonomioversikten** -- En snabbknapp i tabellraden for att markera ett projekt som "Avslutat" direkt fran ekonomivyn, utan att behova navigera in i projektet.

---

### Tekniska detaljer

**1. Utoka datahantningen (`useEconomyOverviewData.ts`)**
- Hamta aven `completed` och `delivered` projekt (inte bara aktiva) -- ta bort `.in('status', ...)` filtret
- Hamta `booking_id` + relaterat eventdatum fran `bookings`-tabellen sa att varje projekt kan kopplas till ett datum for gruppering
- Exportera eventdate i `ProjectWithEconomy`-interfacet

**2. Tidsgruppering i UI (`EconomyOverview.tsx`)**
- Lagga till state for vald period: `day | week | month`
- Tre knappar (ToggleGroup) under KPI-korten: "Dag", "Vecka", "Manad"
- Grupperingslogik med `date-fns`: `startOfDay`, `startOfWeek`, `startOfMonth`
- Visa en summerad rad per tidsperiod med kollapsbar lista av projekt under varje period
- KPI-korten uppdateras baserat pa vald period (eller visar totalt)

**3. Projektstatus-badge i tabellen (`EconomyOverview.tsx`)**
- Byt ut den nuvarande "Status"-kolumnen (som visar avvikelse-%) till tva kolumner: "Avvikelse" och "Status"
- Anvand befintliga `PROJECT_STATUS_LABELS` och `PROJECT_STATUS_COLORS` fran `src/types/project.ts`
- Badge visar: Planering (bla), Pagaende (gul), Levererat (lila), Avslutat (gron)

**4. Stanga-projekt-knapp**
- Lagg till en liten knapp/ikon (CheckCircle) pa varje rad i tabellen for att stanga projektet
- Klick oppnar en bekraftelsedialog (AlertDialog): "Vill du markera [projektnamn] som avslutat?"
- Vid bekraftelse: UPDATE projektet till status `completed` via Supabase, och invalidera React Query-cachen

**Filer som andras:**
- `src/hooks/useEconomyOverviewData.ts` -- utoka query, lagg till eventdate
- `src/pages/EconomyOverview.tsx` -- tidsgruppering, statusbadge, stang-knapp
- `src/types/project.ts` -- ingen andring behovs, statusar finns redan

**Ingen databasandring kravs** -- statuset `completed` finns redan i projektmodellen.
