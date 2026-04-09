

## Granskning av Scanner-appen: RFID + Kolli

### Nuläge — vad som fungerar bra

**RFID-flödet** är arkitektoniskt korrekt:
- Native Java-plugin (ZebraRfidPlugin.java) → Capacitor events → ZebraRfidBridge → ScannerService → useScanProcessor
- Dedup, tag-räknare, inventory start/stopp, auto-connect — allt på plats
- RfidStatusBar visar status, räknare och kontroller

**Kolli-flödet** fungerar end-to-end:
- Skapa kolli → scanna/klicka produkter → tilldela till kolli → nästa kolli
- Backend: UNIQUE constraint, org_id-filter, parcel_number auto-increment

---

### Identifierade problem

**1. RFID: Session-dedup blockerar permanent**
`useScanProcessor` har en `scannedThisSessionRef` (Set) som aldrig rensas. Om samma EPC scannas igen (t.ex. efter att man tagit bort en artikel med minus-läge) ignoreras den tyst. `rfid.resetSession()` rensar bara tag-räknare — inte session-dedup.

**2. RFID: Ingen visuell koppling mellan tagg och produkt**
RFID-taggar identifieras via EPC-hex men det finns ingen mapping EPC → produktnamn i UI:t. Användaren ser bara "matched/unmatched"-räknare men vet inte *vilken* produkt som matchades.

**3. Kolli: Ingen översikt över kolliinnehåll**
Det finns ingen vy för att se vad som ligger i varje kolli. Man kan bara se kolli-nummer per produkt i listan.

**4. Kolli: Knappen är liten och lätt att missa**
"Kolli"-knappen sitter bland flera knappar i verktygsfältet utan visuell vikt.

**5. Kolli: Ingen bekräftelse vid start**
Att klicka "Kolli" skapar omedelbart ett nytt kolli utan bekräftelse — risk för oavsiktliga tomma kollin.

---

### Åtgärdsplan

#### Steg 1: Fixa RFID session-dedup
- Lägg till `clearSessionDedup()` i `useScanProcessor` som rensar `scannedThisSessionRef`
- Anropa den från `rfid.resetSession()` via en ny callback-prop
- Rensa även automatiskt vid byte från minus-läge till normal-läge

#### Steg 2: Förbättra kolli-UX
- **Bekräftelsedialog** vid "Starta kolli": Visa kort dialog med "Starta Kolli #N?" istället för direkt skapande
- **Kolli-sammanfattning**: Lägg till en expanderbar sektion i kolli-läget som visar antal produkter per kolli (hämta från `get_parcels` + räkna items per parcel)
- **Tydligare knapp**: Gör kolli-knappen mer framträdande med ikon + text och en badge om kollin redan finns

#### Steg 3: RFID feedback-förbättring
- Visa senast matchad produkt direkt i `RfidStatusBar` (produktnamn + SKU) vid varje lyckat RFID-scan
- Lägg till en `lastMatchedProduct`-state i `useRfidManager`

### Filer som ändras
- `src/hooks/scanner/useScanProcessor.ts` — clearSessionDedup + exponera
- `src/hooks/scanner/useRfidManager.ts` — lastMatchedProduct state
- `src/components/scanner/VerificationView.tsx` — kolli bekräftelse, sammanfattning, bättre knapp
- `src/components/scanner/RfidStatusBar.tsx` — visa senast matchad produkt

