
## Problem: Bokningsbilder syns inte i projektvy

Bilder importerade från det externa API:t (tent_images, attachments, product images) sparas i tabellen `booking_attachments` kopplat till ett `booking_id`. Projektdetaljer-sidan (`/project/:id`) visar däremot enbart filer från `project_files`-tabellen kopplat till ett `project_id`. De två datakällorna visas aldrig tillsammans.

### Dataflöde idag

```text
Externa API  →  import-bookings  →  booking_attachments  (booking_id)
                                          ↓
                                   Visas BARA i mobilappens
                                   booking.attachments-sektion

Web-UI upload →  project_files  (project_id)
                       ↓
                 Visas i ProjectFiles-tab i webb-UI
                 + mobilappens "Bilder"-flik (get_project_files)
```

### Lösning

Lägg till bokningsbilagor (`booking_attachments`) som en skrivskyddad sektion i webb-UI:ts projektvy, bredvid de uppladdningsbara `project_files`. Inga nya tabeller eller migrationer behövs.

### Tekniska ändringar

**1. `src/services/projectService.ts`**

Ny funktion `fetchBookingAttachments(bookingId: string)` som hämtar från `booking_attachments`:

```typescript
export const fetchBookingAttachments = async (bookingId: string) => {
  const { data, error } = await supabase
    .from('booking_attachments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data || [];
};
```

**2. `src/hooks/useProjectDetail.tsx`**

Lägg till en ny query som hämtar `booking_attachments` när bokning finns:

```typescript
const bookingAttachmentsQuery = useQuery({
  queryKey: ['booking-attachments', bookingId],
  queryFn: () => fetchBookingAttachments(bookingId!),
  enabled: !!bookingId
});
```

Returnera `bookingAttachments: bookingAttachmentsQuery.data || []` i hook-returen.

**3. `src/components/project/ProjectFiles.tsx`**

Utöka komponenten med en `bookingAttachments`-prop och lägg till en skrivskyddad sektion "Bilder från bokning" ovanför de uppladdningsbara filerna. Bilder renderas som miniatyrbilder (thumbnails), övriga filer som länkar. Inget delete/upload-gränssnitt för bokningsbilagor.

**4. `src/pages/ProjectDetail.tsx`**

Skicka med `bookingAttachments` till `ProjectFiles`-komponenten.

### Mockup

```text
┌─ Filer ──────────────────────────────────────┐
│                                              │
│  Bilder från bokning (4)                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                │
│  │ 🖼 │ │ 🖼 │ │ 🖼 │ │ 🖼 │                │
│  └────┘ └────┘ └────┘ └────┘                │
│  Tält 1 - Framsida  •  Tält 1 - Sida  ...   │
│                                              │
│  ─────────────────────────────────────────  │
│                                              │
│  Uppladdade filer                            │
│  [Upload-knapp]                              │
│  (tom om inga filer finns)                   │
└──────────────────────────────────────────────┘
```

### Filer att ändra

1. `src/services/projectService.ts` — lägg till `fetchBookingAttachments`
2. `src/hooks/useProjectDetail.tsx` — ny query + returnera `bookingAttachments`
3. `src/components/project/ProjectFiles.tsx` — ny skrivskyddad sektion
4. `src/pages/ProjectDetail.tsx` — skicka prop

Inga databasmigrationer eller Edge Function-ändringar behövs.
