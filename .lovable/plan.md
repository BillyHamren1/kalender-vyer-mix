
## Problemet

Databasen (`booking_attachments`) innehåller faktiska dubbletter — samma bild-URL finns med flera olika `id`. Exempelvis:
- `tent-0-view-b-1771376044790.png` → 2 rader
- `tent-0-view-a-1771376044636.png` → 2 rader
- `kartritning-2026-02-18.jpg` → 2 rader (en av dessa med annan URL)

Importen (`syncAllAttachments`) kördes tydligen vid mer än ett tillfälle och skapade dessa dubbletter trots det dedupliceringslogik som finns.

## Lösning: Två delar

### Del 1 — Databasrensning (SQL som körs manuellt av dig)

Du behöver köra följande SQL i Supabase > SQL Editor för att ta bort duplikaten och behålla en rad per unik URL per bokning:

```sql
DELETE FROM booking_attachments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY booking_id, url
             ORDER BY uploaded_at ASC
           ) AS rn
    FROM booking_attachments
    WHERE booking_id = '7faa62ad-8eb0-49ad-82c2-b9d256a8c15b'
  ) sub
  WHERE rn > 1
);
```

### Del 2 — Frontend-skydd i `BookingInfoExpanded.tsx`

Lägg till URL-baserad deduplicering i komponenten så att om dubbletter slipper igenom till frontend filtreras de bort:

```typescript
// Dedupa på URL, behåll första förekomsten
const uniqueAttachments = bookingAttachments.filter(
  (a, idx, arr) => arr.findIndex(x => x.url === a.url) === idx
);

const imageAttachments = uniqueAttachments.filter(a =>
  a.file_type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.url)
);
```

## Filer att ändra

| Del | Vad |
|---|---|
| SQL (körs av dig) | Ta bort dubbletter ur `booking_attachments` för denna bokning |
| `src/components/project/BookingInfoExpanded.tsx` | Lägg till URL-dedup innan `imageAttachments`-filtret |

## Ordning

1. Jag lägger till frontend-skyddet i koden
2. Du kör SQL-satsen i Supabase SQL Editor för att städa databasen
