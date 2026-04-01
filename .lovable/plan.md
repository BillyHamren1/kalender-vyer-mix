

# Fix: Kan inte spara fast plats — koordinatfält och nummerinput

## Problem
Med `<input type="number">` i en svensk webbläsare tolkas decimalkomma (`,`) annorlunda. Webbläsaren kan returnera tom sträng eller felaktigt värde via `.value`, vilket gör att `parseFloat()` returnerar `NaN` → valideringen misslyckas → "Namn, latitud och longitud krävs".

## Lösning

### `src/components/ops-control/OrganizationLocationsManager.tsx`

1. **Byt `type="number"` till `type="text"` med `inputMode="decimal"`** på latitud-, longitud- och radie-fälten — detta undviker webbläsarens lokala nummerformatering.

2. **Lägg till komma-till-punkt-konvertering** i `handleSave` så att "59,3293" tolkas korrekt:
   ```typescript
   const normalize = (v: string) => parseFloat(v.replace(',', '.'));
   const lat = normalize(form.latitude);
   const lng = normalize(form.longitude);
   const radius = parseInt(form.radius_meters.replace(',', '.')) || 100;
   ```

3. **Validera rimliga koordinatvärden** (latitud -90 till 90, longitud -180 till 180) och visa tydligt felmeddelande om värdena är utanför intervallet — t.ex. "592929.61" är inte en giltig latitud.

### Inga andra filer påverkas.

