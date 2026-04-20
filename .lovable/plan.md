

## Diagnos

Background-geolocation slutar pinga efter att timern stoppas. Jag behöver verifiera **varför** — finns flera möjliga orsaker:

### Hypoteser att kolla

1. **`useBackgroundLocationReporter` lyssnar bara på `staffId`** (rad 73 i useBackgroundLocationReporter.ts). Det betyder att watchern fortsätter köra så länge användaren är inloggad — den ska INTE stoppa pga timer-stopp. Så varför slutar pingarna?

2. **Native: app går till bakgrund/dödas av OS.** `BackgroundGeolocation` ska överleva, men:
   - Kräver `Always Allow`-permission på iOS — om användaren bara gett "While Using" stoppar OS pingarna när skärmen släcks/appen backgrundas.
   - Android kan döda processen aggressivt utan foreground-service-notis.

3. **Web (PWA i browsern):** `navigator.geolocation.watchPosition` PAUSAR alltid när tabben tappar fokus eller skärmen släcks. Detta är browserspec, inte en bugg.

4. **Logout/auth-token expiry:** Om token rensas (`clearAuth`) avmonteras `MobileAuthProvider`-staff → effekten cleanup'ar och stoppar BackgroundGeolocation. Värt att kolla auth-loggar.

### Plan för undersökning (default-läge)

Jag behöver köra läs-queries för att avgöra rotorsaken:

1. **Sista GPS-pingens tidpunkt vs sista timer-stopp** för de 4 användarna — visar om pingar dog exakt vid stop eller fortsatte ett tag.
2. **Logout-events i auth-loggen** — om de loggade ut → förväntat beteende, ingen bugg.
3. **`device_info` / `platform`-kolumnen i `staff_location_history`** (om finns) — för att veta web vs native.
4. **Push-token timestamps** — sista `last_active`-tid på `push_tokens` för att gissa när appen faktiskt stängdes.
5. **Inspektera koden** för att verifiera att inget i `stopSession`/`endDay`-flödet anropar `BackgroundGeolocation.stop()` av misstag.

### Leverans

Efter undersökningen presenterar jag en kort rapport med:
- **Rotorsak** per användare (loggade ut / OS-permission / app stängd / browser-paus / faktisk bugg).
- **Konkret fix-förslag** OM det är en bugg vi äger (t.ex. lägga till foreground-service-notis på Android, kräva `Always Allow` på iOS, eller visa varning till användaren när permission är otillräcklig).
- **Inga kodändringar** görs i detta steg — bara analys + rekommendation.

