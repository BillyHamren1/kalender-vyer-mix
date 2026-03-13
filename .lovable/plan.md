

# Fakturering via Fortnox — Integrationsplan

## Sammanfattning
Sätta upp en Fortnox-faktureringsintegration som anropar en extern edge function (`fortnox-create-invoice`) på EventFlow-backenden (`wpzhsmrbjmxglowyoyky.supabase.co`). Detta blir grunden för en kommande fakturasida.

## Vad som byggs

### 1. Fortnox Invoice Service (`src/services/fortnoxInvoiceService.ts`)
En ny service-fil som hanterar anropet till den externa Fortnox edge function:

- **`createFortnoxInvoice(payload, clientData?)`** — Hämtar Supabase-session token, bygger request body enligt API-specen, och POSTar till `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/fortnox-create-invoice`
- Returnerar `{ success, invoiceNumber, fortnoxInvoiceId, documentNumber, customerNumber }` eller kastar fel
- Autentisering sker via användarens Supabase JWT (samma session som planeringssystemet)

### 2. TypeScript-typer (`src/types/fortnoxInvoice.ts`)
Typedefinitioner för:
- `FortnoxInvoicePayload` — hela request-strukturen (CustomerNumber, InvoiceRows, etc.)
- `FortnoxInvoiceRow` — enskild fakturarad
- `FortnoxClientData` — kunddata för automatisk kundregistrering
- `FortnoxInvoiceResponse` — svarsformat

### 3. React Query Hook (`src/hooks/useFortnoxInvoice.ts`)
- `useCreateFortnoxInvoice()` — en `useMutation` som wrappar servicen
- Toast-meddelanden vid lyckat/misslyckat anrop
- Invaliderar relevanta query-caches efter lyckad fakturering

### 4. Faktureringssida (stub) (`src/pages/InvoicingPage.tsx`)
- Tom sida med route `/invoicing` som registreras i `App.tsx`
- Placeholder för kommande UI-flöde (väntar på UI-prompt)

## Tekniska detaljer

- **Autentisering**: Använder `supabase.auth.getSession()` för att hämta access token. Token skickas som `Bearer` i Authorization-headern.
- **URL**: Hårdkodad till EventFlow-instansen (`wpzhsmrbjmxglowyoyky.supabase.co`), samma mönster som redan används i `import-bookings` och `APITester`.
- **Ingen egen edge function behövs** — vi anropar direkt från klienten till den externa edge function (samma Supabase-auth fungerar tack vare att det är samma auth-provider).
- **Inga databasändringar** i denna iteration.

