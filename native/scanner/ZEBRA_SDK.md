# Zebra API3 build input

The licensed Zebra RFID API3 AAR is not stored in Git. Every scanner build must
receive an explicit file and expected checksum:

```bash
export ZEBRA_API3_AAR_PATH=/secure/path/API3_LIB-RELEASE.aar
export ZEBRA_API3_AAR_SHA256=$(sha256sum "$ZEBRA_API3_AAR_PATH" | cut -d ' ' -f 1)
npm run android:scanner:debug
```

The build verifies SHA-256 before staging the binary as the ignored file
`native/scanner/android/app/libs/zebra-api3.aar`. Missing input or checksum
mismatch is a hard failure before Capacitor or Gradle runs.
