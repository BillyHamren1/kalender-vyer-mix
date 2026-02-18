
## Problemet

`bookingAttachments` (bilder från bokning) visas på **två ställen** simultaneously:

1. **`BookingInfoExpanded`** — visar bilderna i "Bilder"-sektionen (nyligen tillagd)
2. **`ProjectFiles`** i `ProjectViewPage` — tar också emot `bookingAttachments` som prop och visar dem som "Bilder från bokning"

Produkterna dupliceras inte på samma sätt — det är bara bilderna och möjligen en gammal utrustningslista. Felet är att `bookingAttachments` skickas till `ProjectFiles` i `ProjectViewPage.tsx` rad 95 men visas nu redan i `BookingInfoExpanded`.

## Lösning

Ta bort `bookingAttachments`-propen från `<ProjectFiles>`-anropet i `ProjectViewPage.tsx`. Bilderna visas redan korrekt i "Bokning"-containern ovanför.

## Ändringar

### `src/pages/project/ProjectViewPage.tsx`

- Ta bort `bookingAttachments={bookingAttachments}` från `<ProjectFiles>`-anropet (rad 95)
- Uppdatera count i `SectionHeader` för Filer så att den bara räknar `files.length` (inte `+ bookingAttachments.length`)

### `src/components/project/ProjectFiles.tsx` (valfritt städning)

- Ta bort `bookingAttachments`-prop och all logik kopplad till den, eftersom bilderna nu hanteras av `BookingInfoExpanded`

## Resultat

```
┌─ Bokning ────────────────────────────┐
│  [Klientinfo, tidslinje]             │
│  ─── Utrustning ───                  │
│  Multiflex 10x21              1 st   │
│  ─── Bilder ───                      │
│  [bildgrid - visas EN gång]          │
└──────────────────────────────────────┘

┌─ Filer ──────────────────────────────┐
│  [Bara uppladdade projektfiler]      │
│  Inga bilder från bokning här        │
└──────────────────────────────────────┘
```

## Filer att ändra

| Fil | Ändring |
|---|---|
| `src/pages/project/ProjectViewPage.tsx` | Ta bort `bookingAttachments` prop från `<ProjectFiles>`, uppdatera count |
| `src/components/project/ProjectFiles.tsx` | Ta bort `bookingAttachments` prop-stöd och tillhörande JSX |
