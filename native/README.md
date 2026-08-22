# Native app boundaries

| App | Package ID | Android project | Native responsibility |
|---|---|---|---|
| EventFlow Time | `se.eventflow.time` | `native/time/android` | Time, camera/QR, location and notifications |
| EventFlow Scanner | `se.eventflow.scanner` | `native/scanner/android` | Zebra DataWedge and RFID/API3 |

The projects are immutable app boundaries. Build scripts select the matching
Capacitor config through `CAPACITOR_APP_MODE`; they must never copy config files
or rewrite package IDs, Gradle files, icons or another app's project.

## Verification and builds

```bash
npm run android:time:verify
npm run android:time:debug

ZEBRA_API3_AAR_PATH=/secure/path/API3_LIB-RELEASE.aar \
ZEBRA_API3_AAR_SHA256=<sha256> \
npm run android:scanner:debug
```

Release builds use separate signing inputs:

- `EVENTFLOW_TIME_KEYSTORE_PATH`, `EVENTFLOW_TIME_STORE_PASSWORD`,
  `EVENTFLOW_TIME_KEY_ALIAS`, `EVENTFLOW_TIME_KEY_PASSWORD`
- `EVENTFLOW_SCANNER_KEYSTORE_PATH`, `EVENTFLOW_SCANNER_STORE_PASSWORD`,
  `EVENTFLOW_SCANNER_KEY_ALIAS`, `EVENTFLOW_SCANNER_KEY_PASSWORD`

Time release additionally requires `EVENTFLOW_TIME_GOOGLE_SERVICES_JSON_PATH`.
Keystores, service configuration and licensed SDK binaries are ignored by Git.
Gradle uses the ignored project cache `.gradle-eventflow/` by default; CI may
override it with `EVENTFLOW_GRADLE_USER_HOME`.
