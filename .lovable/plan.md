

## Flytta returtransport till "Datum & Detaljer"-steget med checkbox

### Vad som ska andras
Idag ligger "Boka + retur" som en separat knapp pa bekraftelsesteget. Anvandaren vill istallet ha en checkbox i "Datum & Detaljer"-steget dar man kan kryssa i att det ska bokas en returtransport. Nar checkboxen ar ikryssad ska man fylla i kontaktperson, telefon och valfri e-post for returtransporten (dvs. kontaktinformation for upphantningen vid rivningsdatumet).

### Anvandargranssnittet

I steget "Datum & Detaljer" (steg 2 for egen, steg 3 for partner), efter upphantningsadress-faltet, laggs till:

```text
+----------------------------------------------------+
| [x] Ateratransport (retur)                         |
|                                                     |
| Returdatum: [2026-02-15] (forifyllt med rigdowndate)|
| Returtid:   [09:00 v]                              |
| Returadress (upphantning): [Leveransadressen]       |
|                                                     |
| Kontaktperson (retur) *                             |
| [___________________________]                       |
| Telefon (retur) *                                   |
| [___________________________]                       |
| E-post (retur)                                      |
| [___________________________]                       |
+----------------------------------------------------+
```

### Teknisk plan

**Fil: `src/components/logistics/TransportBookingTab.tsx`**

1. **Utoka `WizardData`-interfacet** med nya falt:
   - `includeReturn: boolean` -- om returtransport ska bokas
   - `returnDate: string` -- returdatum (forifyllt fran `rigdowndate`)
   - `returnTime: string` -- returtid (forifyllt fran `transportTime`)
   - `returnPickupAddress: string` -- var returtransporten hamtar (forifyllt fran leveransadressen)
   - `returnContactName: string` -- kontaktperson for returen
   - `returnContactPhone: string` -- telefon for returen
   - `returnContactEmail: string` -- e-post for returen (valfritt)

2. **Lagg till checkbox-sektion i "Datum & Detaljer"-steget** (efter upphantningsadress/favoriter):
   - En Checkbox-komponent med label "Atertransport (retur)"
   - Nar ikryssad visas falt for:
     - Returdatum (forifyllt med `wizardBooking.rigdowndate`, redigerbart)
     - Returtid (dropdown, samma tidsluckor som huvudtransporten)
     - Returadress (forifyllt med leveransadressen fran bokningen)
     - Kontaktperson (retur) -- obligatoriskt
     - Telefon (retur) -- obligatoriskt
     - E-post (retur) -- valfritt
   - Checkbox ar disabled om bokningen saknar `rigdowndate` (med tooltip-forklaring)
   - Validering: "Nasta"-knappen kraver att returnContactName och returnContactPhone ar ifyllda om `includeReturn` ar true

3. **Uppdatera bekraftelsesteget** (steg 3/4):
   - Visa en extra sammanfattnings-ruta for returtransporten om `includeReturn` ar true
   - Visar returdatum, tid, adress och kontaktperson
   - Ta bort "Boka + retur"-knappen fran bekraftelsesteget (ersatts av checkbox-flodet)

4. **Uppdatera `handleSubmitWizard`**:
   - Istallet for att ta `includeReturn` som parameter, las av `wizardData.includeReturn`
   - Anvand `wizardData.returnDate`, `wizardData.returnTime`, `wizardData.returnPickupAddress` for returen
   - Skicka med kontaktinformation for returtransporten (lagras i assignment-metadata eller som kommentar)

5. **Importera Checkbox-komponenten** fran `@/components/ui/checkbox`

### Filer som andras
- **`src/components/logistics/TransportBookingTab.tsx`** -- enda filen som behovs andras

### Valideringslogik
- Om `includeReturn` ar true men `rigdowndate` saknas: visa varning, avaktivera retursektionen
- Om `includeReturn` ar true: "Nasta"-knappen kraver att returnContactName och returnContactPhone ar ifyllda, samt att returnDate och returnTime ar valda
- Om `includeReturn` ar false: allt fungerar som vanligt (befintligt flode for "Boka transport")
