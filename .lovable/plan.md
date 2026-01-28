
# Plan: Komplett API för Tidrapporteringsappen

## Bakgrund

Tidrapporteringsappen behöver ett säkert och komplett API för att:
1. **Autentisera personal** via `staff_accounts`
2. **Skapa tidrapporter** som kopplas till rätt bokning/projekt
3. **Hantera utlägg (purchases)** med kvittobilder
4. **Skapa kommentarer** i projekt
5. **Ladda upp bilder/filer** till projekt

## Dataflöde

```text
+-------------------+         +----------------------+         +------------------+
| Tidrapporteringsapp| ------> | mobile-app-api       | ------> | Supabase DB      |
| (Mobilapp)        |         | (Edge Function)      |         |                  |
+-------------------+         +----------------------+         +------------------+
       |                              |                               |
       | 1. Login                     | Validerar staff_accounts      |
       | 2. Hämta bokningar           | Filtrerar på schemalagda      |
       | 3. Skapa tidrapport          | Sparar i time_reports         |
       | 4. Skapa utlägg              | Sparar i project_purchases    |
       | 5. Ladda upp bild            | Sparar i project-files bucket |
       | 6. Skapa kommentar           | Sparar i project_comments     |
```

## API-struktur

### Autentisering

| Endpoint | Metod | Beskrivning |
|----------|-------|-------------|
| `/login` | POST | Logga in med username/password, returnerar session token |
| `/me` | GET | Hämta nuvarande användares info (kräver token) |

### Tidrapporter

| Endpoint | Metod | Beskrivning |
|----------|-------|-------------|
| `/bookings` | GET | Hämta bokningar personalen är schemalagd på |
| `/time-reports` | POST | Skapa ny tidrapport |
| `/time-reports` | GET | Hämta egna tidrapporter |

### Projekt & Ekonomi

| Endpoint | Metod | Beskrivning |
|----------|-------|-------------|
| `/projects/{booking_id}` | GET | Hämta projekt kopplat till bokning |
| `/purchases` | POST | Skapa nytt utlägg med kvittobild |
| `/comments` | POST | Skapa kommentar i projekt |
| `/files` | POST | Ladda upp fil/bild till projekt |

---

## Teknisk implementation

### 1. Ny Edge Function: `mobile-app-api`

Skapar en ny edge function som hanterar alla endpoints för mobilappen:

```
supabase/functions/mobile-app-api/index.ts
```

### 2. Autentiseringslogik

- Validerar `username` + `password_hash` mot `staff_accounts`
- Genererar en enkel session-token (Base64 av staff_id + timestamp + secret)
- Verifierar token vid varje anrop

### 3. Kopplingen Bokning → Projekt

Systemet hittar rätt projekt automatiskt:

1. Personal loggar in → får `staff_id`
2. Hämtar bokningar från `booking_staff_assignments` där `staff_id` matchar
3. Vid tidrapport: `booking_id` sparas i `time_reports`
4. Projektet hittas via `projects.booking_id = time_reports.booking_id`

### 4. Utlägg med kvittobild

1. Mobilappen skickar bild som base64
2. Edge function laddar upp till `project-files` bucket
3. Skapar post i `project_purchases` med `receipt_url`

### 5. Kommentarer

- Sparas i `project_comments` med `project_id`, `author_name`, `content`

### 6. Filuppladdning

- Sparas i `project_files` med koppling till projekt
- Bilder laddas upp till befintlig `project-files` storage bucket

---

## Ändringar i detta system (admin-webben)

### Kommentarer i projektvyn

- Befintlig `ProjectComments.tsx` fungerar redan
- Inga ändringar behövs - kommentarer synkroniseras automatiskt

### Utlägg/kvitton

- Befintlig `PurchasesList.tsx` visar redan utlägg
- Lägg till visning av kvittobild om `receipt_url` finns

### Projektfiler

- Befintlig `ProjectFiles.tsx` visar redan filer
- Bilder uppladdade från appen syns automatiskt

---

## Filer som skapas/ändras

| Fil | Åtgärd |
|-----|--------|
| `supabase/functions/mobile-app-api/index.ts` | **SKAPAS** - Ny edge function |
| `supabase/config.toml` | **ÄNDRAS** - Lägg till konfiguration |
| `src/components/project/PurchasesList.tsx` | **ÄNDRAS** - Visa kvittobild |

---

## JSON-format för API-anrop

### Login
```json
POST /mobile-app-api
{
  "action": "login",
  "data": {
    "username": "andris.sergejevs",
    "password": "lösenord123"
  }
}
```

### Hämta bokningar
```json
POST /mobile-app-api
{
  "action": "get_bookings",
  "token": "eyJ..."
}
```

### Skapa tidrapport
```json
POST /mobile-app-api
{
  "action": "create_time_report",
  "token": "eyJ...",
  "data": {
    "booking_id": "abc-123",
    "report_date": "2026-01-28",
    "start_time": "07:00",
    "end_time": "16:00",
    "hours_worked": 8,
    "overtime_hours": 0,
    "break_time": 1,
    "description": "Rigg och byggnation"
  }
}
```

### Skapa utlägg med kvitto
```json
POST /mobile-app-api
{
  "action": "create_purchase",
  "token": "eyJ...",
  "data": {
    "booking_id": "abc-123",
    "description": "Skruvar och material",
    "amount": 450,
    "supplier": "Bauhaus",
    "category": "material",
    "receipt_image": "data:image/jpeg;base64,/9j/4AAQ..."
  }
}
```

### Ladda upp projektbild
```json
POST /mobile-app-api
{
  "action": "upload_file",
  "token": "eyJ...",
  "data": {
    "booking_id": "abc-123",
    "file_name": "rigg-foto.jpg",
    "file_type": "image/jpeg",
    "file_data": "data:image/jpeg;base64,/9j/4AAQ..."
  }
}
```

### Skapa kommentar
```json
POST /mobile-app-api
{
  "action": "create_comment",
  "token": "eyJ...",
  "data": {
    "booking_id": "abc-123",
    "content": "Leverans framflyttad till kl 10"
  }
}
```

---

## Säkerhet

1. **Token-baserad autentisering** - Varje anrop kräver giltig token
2. **Verifiering av staff_id** - Personal kan bara se sina egna bokningar
3. **Filvalidering** - Endast tillåtna filtyper (bilder, PDF)
4. **Storleksbegränsning** - Max 10MB per fil

---

## Sammanfattning

Denna plan skapar ett komplett API som:

- Låter tidrapporteringsappen logga in personal säkert
- Visar endast de bokningar personalen är schemalagd på
- Sparar tidrapporter kopplade till rätt bokning/projekt
- Hanterar utlägg med kvittobilder
- Möjliggör kommentarer och filuppladdning direkt i projektet
- Synkroniserar all data med admin-webben i realtid
