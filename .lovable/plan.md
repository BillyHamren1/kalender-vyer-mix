

## Fix: QR-knappen i scanner-appen + build-fel

### Problem 1: QR-knappen öppnar inte kameran
Koden skickar `skipCamera={false}` korrekt, men det finns två troliga orsaker till att kameran inte syns:

1. **I webbläsaren (preview)**: `getUserMedia` blockeras ofta i iframes. Kameran misslyckas tyst och användaren ser bara textfältet.
2. **På enheten (Capacitor)**: `BarcodeDetector` API finns inte i alla WebViews. Om den saknas visas kameran men utan skanningsförmåga — och felmeddelandena är otydliga.

**Lösning**: Förbättra QRScanner så att:
- Om kameran misslyckas visas ett tydligt felmeddelande med "Försök igen"-knapp istället för att falla tillbaka till bara textfältet
- Lägg till en **fallback med `jsQR`-biblioteket** (npm-paket) för enheter utan BarcodeDetector API — detta gör att kameraskanningen fungerar i alla WebViews
- Om `getUserMedia` helt misslyckas (t.ex. i iframe), visa tydligt "Kameran kunde inte startas" + manuell inmatning

### Problem 2: Build-fel (Resend)
Edge-funktionen `handle-transport-response` importerar `npm:resend@4.0.0` men Deno kan inte hitta paketet.

**Lösning**: Lägg till resend i `supabase/functions/handle-transport-response/deno.json` (eller skapa filen om den saknas) med rätt import map, alternativt ändra importvägen.

### Tekniska detaljer

**Fil: `src/components/scanner/QRScanner.tsx`**
- Installera `jsqr` (npm-paket) som fallback för BarcodeDetector
- I `scanFrame`: om `detectorRef.current` saknas, använd `jsQR` med canvas-konvertering
- Visa tydlig UI-status: "Startar kameran...", "Kameran kunde inte startas", etc.

**Fil: `supabase/functions/handle-transport-response/deno.json`** (ny eller uppdatera)
- Lägg till `"resend": "npm:resend@4.0.0"` i imports

