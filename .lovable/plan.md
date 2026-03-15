

# Fix: Push Notification Freeze on Android

## Root Cause

The freeze happens because of a **race condition between `register()` and `addListener('registration')`**. The flow is:

1. `requestPermissions()` → user taps Allow
2. `register()` is called → this triggers FCM registration which fires the `registration` event
3. **But the `addListener('registration')` is set up AFTER `register()` returns**

On Android, `register()` can fire the `registration` event synchronously/immediately before the listener is attached. The Capacitor bridge may also block waiting for a listener response that never comes, causing the WebView to freeze.

Additionally, `initPushNotifications` is called with `await` in the `login` callback (line 52), meaning the entire login flow blocks until push init completes — if push init hangs, the app freezes.

## Fix (2 files)

### 1. `src/services/pushNotificationService.ts`

- **Register listeners BEFORE calling `register()`** — this ensures the `registration` event is caught
- **Add a mutex lock** to prevent parallel init calls
- **Wrap everything in try/catch with timeouts** so it never blocks indefinitely
- **Fire-and-forget pattern** — the function resolves immediately after calling `register()`, token handling happens asynchronously via listeners

### 2. `src/contexts/MobileAuthContext.tsx`

- **Fire-and-forget**: Call `initPushNotifications()` without `await` — don't let push init block login or session restore
- This ensures the app continues rendering regardless of push outcome

## Key Changes

```typescript
// pushNotificationService.ts — fixed order
export async function initPushNotifications(staffId: string): Promise<void> {
  if (initializing || initialized) return;
  initializing = true;
  
  try {
    // 1. Request permission
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') { initializing = false; return; }

    // 2. Set up listeners FIRST (before register)
    await PushNotifications.removeAllListeners(); // clean slate
    PushNotifications.addListener('registration', ...);
    PushNotifications.addListener('registrationError', ...);
    PushNotifications.addListener('pushNotificationReceived', ...);
    PushNotifications.addListener('pushNotificationActionPerformed', ...);

    // 3. THEN register — event will be caught by listener above
    await PushNotifications.register();
    
    initialized = true;
  } catch (err) {
    console.error('[Push] Init error:', err);
  } finally {
    initializing = false;
  }
}
```

```typescript
// MobileAuthContext.tsx — fire and forget
initPushNotifications(res.staff.id); // no await, no .then()
```

