
# Lagg till radering av bilder i mobilappen

## Sammanfattning
Anvandaren ska kunna ta bort uppladdade bilder fran jobbvyn i mobilappen. Idag saknas bade backend-stod och UI-knappar for detta.

## Andringar

### 1. Edge Function: Ny `delete_file`-handler
**Fil:** `supabase/functions/mobile-app-api/index.ts`

- Lagg till `case 'delete_file'` i switch-satsen (rad 80-110)
- Ny funktion `handleDeleteFile` som:
  - Tar emot `file_id`
  - Hamtar filen fran `project_files`-tabellen for att fa URL och project_id
  - Extraherar lagringssokvaegen fran URL:en (splittar pa `/project-files/`)
  - Raderar filen fran Supabase Storage-bucket `project-files`
  - Raderar posten fran databastabellen `project_files`
  - Returnerar `{ success: true }`
- Samma moenster som befintliga `deleteProjectFile` i desktop-systemet

### 2. Frontend API: Ny metod `deleteFile`
**Fil:** `src/services/mobileApiService.ts`

- Lagg till metoden:
```text
deleteFile: (fileId: string) =>
  callApi<{ success: boolean }>('delete_file', { file_id: fileId })
```

### 3. UI: Raderingsknapp pa bilder och i helskarmslage
**Fil:** `src/components/mobile-app/job-tabs/JobPhotosTab.tsx`

- **I bildrutnatet**: Lagg till en liten rod papperskorg-ikon (`Trash2`) i ovre hoegra hornet pa varje bild. Klick oeppnar en bekraftelsedialog.
- **I helskarmslaget**: Lagg till en "Radera"-knapp laengst ner (rod) bredvid stang-knappen.
- **Bekraftelse**: Anvand `window.confirm('Vill du radera denna bild?')` for att forhindra misstag.
- **State-hantering**: Efter lyckad radering, uppdatera listan genom att filtrera bort den raderade filen fran `files`-state. Stang aven helskarmslaget om bilden som visas raderas.
- **Feedback**: Visa `toast.success('Bilden har raderats')` vid lyckat resultat.

## Visuellt resultat

```text
+---------------------------+
|  [Bild]         [Trash]   |  <- Papperskorg-ikon i hoernet
|                           |
|                           |
+---------------------------+
```

I helskarmslaget:

```text
+-------------------------------+
|                         [X]   |
|                               |
|        [Stor bild]            |
|                               |
|     [Radera bild]             |  <- Rod knapp
+-------------------------------+
```

## Filer som andras

| Fil | Andring |
|-----|---------|
| `supabase/functions/mobile-app-api/index.ts` | Ny `delete_file`-action + `handleDeleteFile`-funktion |
| `src/services/mobileApiService.ts` | Ny `deleteFile`-metod |
| `src/components/mobile-app/job-tabs/JobPhotosTab.tsx` | Raderingsknappar i rutnaat och helskarm, bekraftelsedialog |
