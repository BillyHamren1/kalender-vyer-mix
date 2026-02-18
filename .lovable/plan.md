
## Mål
Placera bokningsinformationen och uppgiftslistan sida vid sida i en tvåkolumnslayout på projektvyn, och gör uppgiftswidgeten visuellt renare och mer kompakt.

## Nuläge

Idag är layouten i `ProjectLayout.tsx`:
```
[BookingInfoExpanded]  ← full bredd
[Outlet → ProjectViewPage]
  [ProjectTaskList]    ← full bredd
  [Transport]
  [Filer]
  [Kommentarer]
  [Historik]
```

## Ny layout

```
[Kolumn vänster – 60%]     [Kolumn höger – 40%]
 BookingInfoExpanded         Uppgifter (kompakt)
                             Transport
```

Filer, kommentarer och historik förblir i full bredd under tvåkolumnslayouten.

## Tekniska ändringar

### 1. `src/pages/project/ProjectLayout.tsx`
- Ta bort `BookingInfoExpanded` från layoutfilen (den flyttas ner till `ProjectViewPage`).

### 2. `src/pages/project/ProjectViewPage.tsx`
- Importera `BookingInfoExpanded` och läs `booking`, `bookingAttachments` och `projectLeader` från `detail`-kontexten.
- Wrap toppen i en `grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6`:
  - **Vänster kolumn**: `BookingInfoExpanded`
  - **Höger kolumn**: Uppgiftswidgeten (kompakt ny design) + Transport-sektion
- Filer, kommentarer och historik renderas under i full bredd (som idag).

### 3. `src/components/project/ProjectTaskList.tsx` — kompakt design
Gör uppgiftskortet visuellt snyggare och mindre:
- Kompaktare `CardHeader` med mindre padding
- Knapptext för "Lägg till" förkortas till en `+`-ikon utan text
- Uppgiftsrader lite tätare (`py-2` istället för `py-2.5`)
- Lägg till en liten progress-bar högst upp (klarade/totalt) för visuell feedback
- Sektionsrubriker ("Klara", "Milstolpar") mer subtila

## Visuell sketch

```text
┌────────────────────────────────┬──────────────────────┐
│ BookingInfoExpanded            │ ✓ Uppgifter      [+] │
│  (med utrustning och bilder)   │ ━━━━━━━━━━━░░ 5/8   │
│                                │ □ Transportbokning   │
│                                │ □ Riggschema klart   │
│                                │ □ Personal bekräftad │
│                                │ ─────────────────── │
│                                │ □ Truck transport   │
└────────────────────────────────┴──────────────────────┘
  Filer | Kommentarer | Historik (full bredd)
```

## Filer att ändra

| Fil | Ändring |
|---|---|
| `src/pages/project/ProjectLayout.tsx` | Ta bort `BookingInfoExpanded` från overview-blocket |
| `src/pages/project/ProjectViewPage.tsx` | Tvåkolumnslayout med bokning + uppgifter sida vid sida |
| `src/components/project/ProjectTaskList.tsx` | Kompaktare, snyggare design med progress-bar |
