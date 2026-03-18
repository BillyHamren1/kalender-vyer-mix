

## Plan: Dokumentera DataWedge-konfiguration

Spara den korrekta Zebra DataWedge-konfigurationen som en referensfil i projektet så att alla utvecklare och driftpersonal vet exakt hur enheten ska ställas in.

### Fil att skapa

**`docs/zebra-datawedge-setup.md`** — Referensdokumentation för DataWedge-profil med:
- Intent Output = ON
- Intent action = `se.eventflow.scanner.SCAN`
- Delivery = Broadcast
- Keystroke Output = OFF
- Steg-för-steg-guide för att konfigurera profilen på enheten

Uppdatera även kommentaren i **`android/app/src/main/java/se/eventflow/scanner/DataWedgePlugin.java`** (redan korrekt, behålls som är).

