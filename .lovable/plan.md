

# Genomgang av bokningsdetaljvyn -- problem och forbattringsforslag

## Sammanfattning

Jag har gatt igenom hela bokningsdetaljflodet och hittat flera problem: oanvanda props, debug-loggar kvar i produktion, inkonsekvent sprak (blandat svenska/engelska), stilavvikelser fran designsystemet, och en komponent som inte foljer samma Card-standard som ovriga.

---

## Problem som hittades

### 1. Oanvanda props och dod kod

**BookingDetailContent.tsx** tar emot tre props som aldrig anvands i renderingen:
- `lastViewedDate` -- definieras i interfacet, skickas fran BookingDetail, men anvands aldrig
- `onLogisticsChange` -- definieras i interfacet, skickas fran BookingDetail, men ingen komponent anvander den (inget LogisticsOptionsForm renderas langre)
- `onReloadData` -- samma sak, definieras men anvands aldrig

**BookingDetail.tsx** destrukturerar fran hooken men anvander aldrig:
- `isSyncingToCalendar` -- importeras men anvands inte
- `syncWithCalendar` -- importeras men anvands inte
- `handleDateChange` -- importeras men anvands inte (addDate/removeDate anvands istallet)

### 2. Debug console.logs i produktion

**BookingDetail.tsx** har fyra console.log-satser som inte bor vara kvar:
- Rad 21: `console.log('BookingDetail component mounted with params:', ...)`
- Rad 46: `console.log('BookingDetail useEffect triggered...')`
- Rad 56-57: `console.log('Booking data changed:', booking)` och `console.log('Booking products:', ...)`

Det finns ocksa en hel `useEffect` (rad 55-58) som bara loggar -- kan tas bort helt.

### 3. Inkonsekvent sprak (svenska vs engelska)

Hela applikationen verkar vara riktad mot svenska anvandare men manga korttitlar ar pa engelska:
- "Delivery Information" bor vara "Leveransinformation"
- "Schedule" bor vara "Schema"
- "Rig Days" / "Event Dates" / "Rig Down Dates" -- kan behallas pa engelska (branschtermer)
- "Products" bor vara "Produkter"
- "Attachments" / "No attachments available" bor vara "Bilagor" / "Inga bilagor tillgangliga"
- "Internal Notes" / "Save" / "Cancel" bor vara "Interna anteckningar" / "Spara" / "Avbryt"
- "Client" bor vara "Kund"
- "Project Assignment" bor vara "Projekttilldelning"
- "Confirm Status Change" i dialogen bor vara pa svenska

### 4. ProjectAssignmentCard avviker fran designstandarden

`ProjectAssignmentCard.tsx` anvander annorlunda styling:
- `className="mb-4"` (marginal) istallet for `shadow-sm` som alla andra kort
- `pb-3` / `text-lg` istallet for `py-3 px-4` / `text-base` som ovriga
- Visar ratt `project ID` som en `font-mono bg-gray-100`-rad -- anvandaren bryr sig troligen inte om UUID
- Anvander `variant="secondary"` pa badge (bor vara `bg-blue-100 text-blue-800` som det redan ar, men `variant` overrides kan stalla till det)

### 5. MapDrawingCard lightbox-problem

`MapDrawingCard.tsx` -- DialogContent saknar `bg-card` (designsystemet kraver att alla dialoger har `bg-card`-bakgrund). Den har ocksa `p-2` vilket ger valdigt liten padding.

### 6. DeliveryInformationCard auto-save pa varje knapptryckning

`DeliveryInformationCard.tsx` anropar `onSave()` vid varje enstaka teckenandring i kontaktfalten (rad 126-164). Det innebar en databasforfragan per knapptryckning. Bor debounce:as.

---

## Atgardsplan

### Steg 1: Rensa dod kod och debug-loggar
- Ta bort console.log-raderna i BookingDetail.tsx
- Ta bort den debug-only useEffect (rad 54-58)
- Ta bort oanvanda destrukturerade variabler: `isSyncingToCalendar`, `syncWithCalendar`, `handleDateChange`
- Ta bort oanvanda props fran BookingDetailContent-interfacet: `lastViewedDate`, `onLogisticsChange`, `onReloadData`
- Ta bort att dessa skickas fran BookingDetail.tsx

### Steg 2: Konsekvent svenskt sprak
Uppdatera alla korttitlar och etiketter till svenska:
- ClientInformation: "Kund: {client}"
- DeliveryInformationCard: "Leveransinformation"
- ScheduleCard: "Schema"
- ProductsList: "Produkter ({count})"
- AttachmentsList: "Bilagor" / "Inga bilagor tillgangliga"
- InternalNotes: "Interna anteckningar" / "Spara" / "Avbryt" / "Klicka for att lagga till anteckningar..."
- ProjectAssignmentCard: "Projekttilldelning" / "Tilldelad till projekt"
- StatusChangeForm: "Bekrafta statusandring" (dialog)

### Steg 3: ProjectAssignmentCard -- anpassa till designstandard
- Byt `className="mb-4"` till `className="shadow-sm"` (som ovriga kort)
- Anpassa CardHeader till `py-3 px-4` och `text-base`
- Ta bort visning av ra projekt-UUID (ointressant for anvandaren)
- Gor kortet klickbart (navigera till projektet) om projekt ar tilldelat

### Steg 4: MapDrawingCard lightbox-fix
- Lagg till `bg-card` pa DialogContent
- Justera padding for battre visning

### Steg 5: Debounce auto-save i DeliveryInformationCard
- Lagg till en debounce (500ms) pa kontaktfaltens auto-save sa det inte sker en databasforfragan per knapptryckning

---

## Filer som andras

| Fil | Andring |
|-----|---------|
| `src/pages/BookingDetail.tsx` | Ta bort console.logs, debug useEffect, oanvanda variabler, oanvanda props |
| `src/components/booking/detail/BookingDetailContent.tsx` | Ta bort oanvanda props fran interface |
| `src/components/booking/ClientInformation.tsx` | Svenskt sprak |
| `src/components/booking/DeliveryInformationCard.tsx` | Svenskt sprak + debounce auto-save |
| `src/components/booking/ScheduleCard.tsx` | Svenskt sprak |
| `src/components/booking/ProductsList.tsx` | Svenskt sprak |
| `src/components/booking/AttachmentsList.tsx` | Svenskt sprak |
| `src/components/booking/InternalNotes.tsx` | Svenskt sprak |
| `src/components/booking/ProjectAssignmentCard.tsx` | Designstandard + svenskt sprak |
| `src/components/booking/MapDrawingCard.tsx` | `bg-card` pa dialog |
| `src/components/booking/StatusChangeForm.tsx` | Svenskt sprak i dialog |

