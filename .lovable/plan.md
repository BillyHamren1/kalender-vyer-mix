# Fix: "Failed to send a request to the Edge Function" på packningssidan

## Grundorsak (verifierad)
De nya funktionerna `packing-preflight-check` och `packing-preflight-batch` svarar på webbläsarens CORS-preflight med:

```
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

Men supabase-js 2.116 skickar även `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version`. Eftersom dessa saknas i allow-listan blockerar webbläsaren anropet redan vid preflight — anropet når aldrig funktionen och supabase-js kastar `FunctionsFetchError` med exakt texten "Failed to send a request to the Edge Function" (toasten på skärmdumpen från "Kontrollera"-knappen i WMS-kopplingspanelen).

Bevis: funktionerna som fungerar (`edit-packing-list`, `repair-packing-items`, `apply-packing-change-request`, `_shared/scannerCors.ts`) listar samtliga dessa headers; de två preflight-funktionerna gör det inte. Live-test med curl visar att det deployade OPTIONS-svaret saknar dem.

## Åtgärd
1. Uppdatera `Access-Control-Allow-Headers` i:
   - `supabase/functions/packing-preflight-check/index.ts`
   - `supabase/functions/packing-preflight-batch/index.ts`
   till samma lista som de fungerande funktionerna (lägg till de fyra `x-supabase-client-*`-headerna). Inga andra logikändringar.
2. Svepkontroll: leta efter andra edge-funktioner med samma smala header-lista som anropas från webbläsaren och åtgärda dem i samma pass (t.ex. `_shared/cors.ts` om den används av webbanropade funktioner — verifiera per funktion innan ändring).
3. Deploya endast `packing-preflight-check` och `packing-preflight-batch`.
4. Verifiera:
   - curl OPTIONS mot båda funktionerna med de fyra extra headerna i `Access-Control-Request-Headers` → svar ska lista dem.
   - Statiskt test som låser att preflight-funktionernas allow-headers innehåller `x-supabase-client-platform` m.fl. (samma mönster som befintliga static-tester).
   - `tsc` + preview-bygge grönt.
   - Playwright mot packningssidan: klicka "Kontrollera" i WMS-koppling → ingen engelsk fel-toast, panelen visar antingen verifierat resultat eller ett svenskt, begripligt felmeddelande.

## Tekniska detaljer
- Filerna rör endast CORS-konstanten högst upp; funktionernas read-only-logik ändras inte.
- Ingen migration, inga secrets, ingen produktionsdata berörs.
- Deploy sker först efter gröna lokala tester.
