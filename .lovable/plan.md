

## Problem

`scripts/build-android.js` Step 4b (lines 122-179) unconditionally injects Firebase Cloud Messaging (`firebase-messaging`, `google-services` plugin) into the Android Gradle files for **both** Time and Scanner builds. This means the Scanner APK ships with FCM native dependencies, which can trigger permission prompts and background push registration at the OS level — even though the JS runtime guards prevent your code from using them.

The `capacitor.scanner.config.ts` correctly omits the `PushNotifications` plugin config, and `pushNotificationService.ts` has the `isScanner` guard. But the native FCM SDK is still bundled.

## Fix

**Wrap the Firebase/FCM injection in `build-android.js` so it only runs for `time` mode.**

In `scripts/build-android.js`, change Step 4b (lines 122-179) to be conditional:

```javascript
// ── Step 4b: Inject Firebase / Google Services into Gradle (TIME only) ─
if (mode === 'time') {
  console.log('\n4️⃣b Injecting Firebase Cloud Messaging into Gradle...');
  // ... existing FCM injection code ...
} else {
  console.log('\n4️⃣b Skipping Firebase (not needed for scanner)');
}
```

This single change ensures:
- **Time app**: FCM is injected as before (push notifications work)
- **Scanner app**: No FCM dependencies in the native build (no push prompts, no background registration)

### Files to change

| File | Change |
|------|--------|
| `scripts/build-android.js` | Wrap lines 123-179 (Firebase injection) in `if (mode === 'time')` |

After this change, rebuild Scanner with `npm run android:scanner` and the native FCM code will no longer be included.

