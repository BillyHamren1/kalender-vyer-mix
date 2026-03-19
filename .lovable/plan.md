

# Integrera Zebra RFID SDK i Android-pluginen

## Sammanfattning

Hela RFID-pluginen (`ZebraRfidPlugin.java`) är en **stub** — all SDK-kod är utkommenterad. Readern kan vara Bluetooth-parad på Android-nivå, men appen kan inte prata med den. För att fixa "ingen reader" behöver den riktiga Zebra RFID SDK:n (rfidapi3) kopplas in.

## Steg

### 1. Ladda ner Zebra RFID SDK
- Hämta `rfidapi3.aar` från [Zebra Developer Portal](https://www.zebra.com/us/en/support-downloads/software/developer-tools/rfid-sdk-for-android.html)
- Placera filen i `android/app/libs/rfidapi3.aar`

### 2. Konfigurera Gradle
I `android/app/build.gradle`, lägg till:
```groovy
repositories {
    flatDir { dirs 'libs' }
}
dependencies {
    implementation(name: 'rfidapi3', ext: 'aar')
}
```

### 3. Aktivera SDK-koden i pluginen
I `ZebraRfidPlugin.java` — avkommentera alla `TODO`-sektioner:
- Import av `com.zebra.rfid.api3.*`
- `Readers`-initiering i `load()`
- Riktig anslutning i `connectReader()`
- `disconnectReader()`, `startInventory()`, `stopInventory()` — riktiga SDK-anrop
- `RfidEventHandler`-klassen (tag reads + status events)
- Cleanup i `handleOnDestroy()`

Ta bort stub-rejects (`call.reject("Zebra RFID SDK not yet integrated...")`)

### 4. Synka och bygg
```bash
git pull
npx cap sync android
# Bygg via Android Studio eller: npx cap run android
```

## Vad Lovable kan göra vs. vad du måste göra manuellt

| Uppgift | Var |
|---|---|
| Avkommentera SDK-koden i Java-pluginen | **Lovable kan göra detta** |
| Ladda ner `rfidapi3.aar` från Zebra | **Manuellt** — kräver nedladdning + placering i `libs/` |
| Skapa/uppdatera `build.gradle` med dependency | **Lovable kan göra detta** |
| `npx cap sync` + bygga APK | **Manuellt** — lokalt i Android Studio |

## Teknisk detalj
All infrastruktur på TypeScript-sidan (bridge, events, dedup, status-hantering) är redan klar. Det enda som saknas är att Java-pluginen faktiskt anropar Zebra SDK istället för att returnera `reject`.

