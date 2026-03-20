

## Genomgång: Flödet mellan Planning och Tidrapportappen

### Nuvarande flöde

```text
MOBILAPP (Personal)                    PLANNING (Admin)
─────────────────                      ────────────────
1. GPS auto-timer / manuell timer      
   → stopTimer()                       
   → mobileApi.createTimeReport()      
   → Edge Function: mobile-app-api     
   → INSERT i time_reports             
                                       
2. Manuell tidrapport (/m/time-report) 
   → mobileApi.createTimeReport()      
   → Edge Function: mobile-app-api     
   → INSERT i time_reports             
                                       ← Realtime-prenumeration på time_reports
                                       ← Visar i:
                                         A) TimeReportApprovals (/staff-management/time-approvals)
                                         B) EconomyTimeReports (Ekonomi-tab "Rapporterad tid")
                                         C) StaffCostTable (Projektets ekonomi-tab)
                                         D) StaffDetail (Personaldetalj)
                                       
                                       → Godkänn → UPDATE time_reports (approved=true)
```

### Identifierade problem

**1. Duplicerad godkännandelogik på 4 ställen — inkonsekvent**
Godkännande av tidrapporter görs på fyra separata ställen, med olika beteenden:

| Plats | Sparar `approved_by`? | Uppdaterar `approved_at`? |
|---|---|---|
| `TimeReportApprovalPanel` | ✅ "Admin" (hårdkodat) | ✅ |
| `EconomyTimeReports` | ❌ | ✅ |
| `StaffCostTable` (projektekonomi) | ✅ "Projektledare" (hårdkodat) | ✅ |
| `EconomyTimeReports` (godkänn alla) | ❌ | ✅ |

**Problem**: `approved_by` är hårdkodat som "Admin" eller "Projektledare" istället för att använda den inloggade användarens namn. `EconomyTimeReports` sparar inte `approved_by` alls.

**2. `TimeReportForm` (admin-skapad) — använder gammal service**
I `StaffDetail.tsx` kan admin lägga till tidrapporter via `TimeReportForm`, som anropar `timeReportService.createTimeReport()` — en Edge Function (`time-reports`). Men alla andra ställen i systemet (projektvy, mobilen) använder direkta Supabase-inserts eller `mobile-app-api`. Oklart om Edge Function `time-reports` ens fungerar korrekt.

**3. Ingen redigering av tidrapporter**
Personal kan bara skapa tidrapporter, aldrig redigera eller ta bort dem. Admin kan bara godkänna eller radera — inte redigera timmar/tider. Om en rapport har fel data måste man radera och be personalen skapa en ny.

**4. Invalidering av queries saknas i `EconomyTimeReports`**  
Vid godkännande invalideras `economy-time-reports`, `pending-time-reports` och `economy-overview` — men INTE `project-time-reports` eller `staff-economy-overview`, så projektekonomivyn och personalöversikten blir inaktuella.

**5. `timeReportService.ts` — potentiellt oanvänd/trasig**
`timeReportService.ts` anropar Edge Functions (`time-reports`, `time-reports/summary`, `fetch-tracked-time`). `fetch-tracked-time` används via `useTrackedTimeData` i `StaffDetail`, men `time-reports`-endpointen (GET/POST/PUT/DELETE) skickar ingen body-data korrekt (GET med `body: null`, DELETE utan id i URL). Troligen trasig.

### Åtgärdsplan

**1. Konsolidera godkännandelogik**
- Skapa en shared `useApproveTimeReport`-hook som alla vyer använder
- Hämta `approved_by` från den inloggade användarens profil istället för hårdkodat "Admin"
- Invalidera alla relevanta query-keys konsekvent: `pending-time-reports`, `economy-time-reports`, `project-time-reports`, `staff-economy-overview`

**2. Fixa `EconomyTimeReports` — spara `approved_by`**
- Lägg till `approved_by` vid godkännande (använd den nya hooken)

**3. Lägg till redigeringsmöjlighet**
- I `TimeReportApprovalPanel`: lägg till möjlighet att redigera timmar, start/slut-tid och beskrivning innan godkännande
- I mobilappen: låt personal redigera sina egna ej-godkända rapporter

**4. Ta bort `timeReportService.ts` GET/POST/PUT/DELETE** 
- Behåll bara `getTrackedTime()` (som faktiskt fungerar via `fetch-tracked-time`)
- Ersätt `TimeReportForm`s anrop med direkt Supabase insert (samma mönster som `projectStaffService.createTimeReport`)

### Tekniska detaljer

**Ny hook: `src/hooks/useApproveTimeReport.ts`**
- Tar `reportId` och optional `queryKeysToInvalidate`
- Hämtar användarnamn från profil-context eller `profiles`-tabellen
- Kör `supabase.from('time_reports').update({ approved: true, approved_at, approved_by })`
- Invaliderar alla relevanta keys

**Filer som ändras:**
- `src/hooks/useApproveTimeReport.ts` (ny)
- `src/components/staff/TimeReportApprovalPanel.tsx` (använd ny hook + lägg till edit-möjlighet)
- `src/pages/EconomyTimeReports.tsx` (använd ny hook)
- `src/components/project/StaffCostTable.tsx` (använd ny hook)
- `src/services/timeReportService.ts` (ta bort trasiga metoder, behåll `getTrackedTime`)
- `src/components/time-reports/TimeReportForm.tsx` (byt till direkt Supabase insert)

**Ingen databasändring behövs** — tabellen har redan `approved`, `approved_at`, `approved_by` kolumner.

