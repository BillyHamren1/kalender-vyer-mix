

## Projektekonomi via Eventflow-bookings Supabase

### Sammanfattning

Istället for att lagra ekonomidata lokalt ska detta system hämta och skriva all ekonomidata (budget, utlägg, offerter, fakturor, tidrapporter) direkt mot eventflow-bookings Supabase-databas. En edge function agerar som proxy -- frontend anropar edge-functionen, som i sin tur kopplar mot eventflow-bookings Supabase med användarens JWT eller en service-role-nyckel.

### Arkitektur

```text
[Frontend]  -->  [Edge Function: project-economy-proxy]  -->  [Eventflow-booking Supabase]
   |                     |
   | POST /read          | createClient(EF_SUPABASE_URL, EF_SUPABASE_ANON_KEY)
   | POST /write         | Forwarded JWT or service role
   |                     |
```

### Vad som krävs

**1. Secrets som behöver konfigureras**

Två nya hemligheter behöver läggas till i detta projekts Supabase:

- `EF_SUPABASE_URL` -- eventflow-bookings Supabase-projektets URL
- `EF_SUPABASE_ANON_KEY` -- eventflow-bookings anon/publishable key (eller service role key beroende på deras RLS-setup)

**2. Ny Edge Function: `project-economy-proxy`**

Edge-functionen tar emot anrop från frontenden och proxyar dem mot eventflow-bookings Supabase. Den hanterar:

- `GET /budget` -- hämta budget for en bokning
- `POST /budget` -- spara/uppdatera budget
- `GET /purchases` -- lista utlägg
- `POST /purchases` -- skapa utlägg
- `DELETE /purchases` -- ta bort utlägg
- `GET /quotes` -- lista offerter
- `POST /quotes` -- skapa offert
- `GET /invoices` -- lista fakturor
- `POST /invoices` -- skapa faktura
- `GET /time-reports` -- lista tidrapporter
- `POST /approve-time-report` -- godkänn tidrapport

Edge-functionen skapar en Supabase-klient mot eventflow-bookings databas och utför operationerna där.

**3. Ny service-fil: `src/services/projectEconomyProxyService.ts`**

Ersätter nuvarande `projectEconomyService.ts` med anrop mot edge-functionen istället för direkta Supabase-queries. Samma TypeScript-typer och funktionssignaturer behålls så att `useProjectEconomy`-hooken och alla UI-komponenter fungerar utan ändringar.

**4. Uppdatera hook: `src/hooks/useProjectEconomy.ts`**

Byt import från `projectEconomyService` till `projectEconomyProxyService`.

### Vad som INTE ändras

- UI-komponenter (`ProjectEconomyTab`, `EconomySummaryCard`, `StaffCostTable`, etc.) -- dessa förblir identiska
- `EconomyTimeReports.tsx` -- denna sida behöver också uppdateras att hämta via proxy
- TypeScript-typer i `src/types/projectEconomy.ts` -- behålls som de är

### Fråga innan implementation

Innan jag kan bygga detta behöver jag veta:

1. **Tabellnamn i eventflow-bookings Supabase** -- heter tabellerna samma sak (`project_budget`, `project_purchases`, etc.) eller har de andra namn?
2. **Autentisering** -- ska edge-functionen använda en service-role-nyckel (full åtkomst) eller forwarda användarens JWT (kräver att användaren finns i båda systemen)?
3. **Eventflow-bookings Supabase-URL och anon key** -- dessa behöver konfigureras som secrets

### Filer att skapa/ändra

| Fil | Åtgärd |
|-----|--------|
| `supabase/functions/project-economy-proxy/index.ts` | Ny edge function |
| `supabase/config.toml` | Lägg till function config |
| `src/services/projectEconomyProxyService.ts` | Ny proxy-service |
| `src/hooks/useProjectEconomy.ts` | Byt service-import |
| `src/pages/EconomyTimeReports.tsx` | Byt till proxy-service |

### Viktigt: Kräver information från dig

Innan jag kan implementera detta behöver jag:
- Eventflow-bookings **Supabase URL** och **anon key** (eller service role key)
- Bekräftelse på att tabellnamnen matchar
- Hur autentiseringen ska fungera (JWT forward eller service role)
