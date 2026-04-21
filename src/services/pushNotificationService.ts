import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { mobileApi } from './mobileApiService';

let initialized = false;
let initializing = false;

/**
 * Fire-and-forget push init — NEVER await this from auth/startup.
 * Calling code should use: initPushNotifications(staffId); // no await
 */
export function initPushNotifications(staffId: string): void {
  const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
  if (isScanner) {
    console.log('[Push] Scanner mode — push notifications disabled');
    return;
  }
  if (initialized || initializing) {
    console.log('[Push] Already initialized or initializing, skipping');
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not a native platform, skipping push registration');
    return;
  }

  initializing = true;

  // Run the entire flow asynchronously — never blocks the caller
  _doInit(staffId).catch((err) => {
    console.error('[Push] Init error (caught at top level):', err);
  }).finally(() => {
    initializing = false;
  });
}

async function _doInit(staffId: string): Promise<void> {
  // 1. Request permission — with safety timeout
  let permResult: { receive: string };
  try {
    permResult = await withTimeout(
      PushNotifications.requestPermissions(),
      8000,
      '[Push] requestPermissions timed out'
    );
  } catch (err) {
    console.warn('[Push] Permission request failed or timed out:', err);
    return;
  }

  if (permResult.receive !== 'granted') {
    console.log('[Push] Permission not granted');
    return;
  }

  // 2. Clean slate — remove old listeners (non-critical, wrap defensively)
  try {
    await PushNotifications.removeAllListeners();
  } catch (err) {
    console.warn('[Push] removeAllListeners failed:', err);
  }

  // 3. Set up ALL listeners BEFORE calling register()
  PushNotifications.addListener('registration', (token) => {
    console.log('[Push] Token received:', token.value?.slice(0, 20) + '...');
    // Save token async — never block on this
    mobileApi.registerPushToken(token.value).then(() => {
      console.log('[Push] Token registered with server');
    }).catch((err) => {
      console.error('[Push] Failed to register token with server:', err);
    });
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[Push] Registration error:', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Notification received in foreground:', notification);
    
    // Dispatch custom event so hooks/components can react (e.g. badge refresh)
    window.dispatchEvent(new CustomEvent('push-notification-received', {
      detail: notification,
    }));

    // Show in-app toast using sonner (imported dynamically to avoid circular deps)
    const title = notification.title || 'Nytt meddelande';
    const body = notification.body || '';
    const data = notification.data || {};

    // Use dynamic import to avoid pulling toast into the push init chain
    import('sonner').then(({ toast }) => {
      toast(title, {
        description: body,
        duration: 5000,
        action: data.notification_type === 'message' ? {
          label: 'Visa',
          onClick: () => { window.location.href = '/m/inbox'; },
        } : data.notification_type === 'assignment' || data.notification_type === 'schedule' ? {
          label: 'Visa',
          onClick: () => { window.location.href = data.booking_id ? `/m/job/${data.booking_id}` : '/m'; },
        } : undefined,
      });
    }).catch(() => {
      // Fallback: silent — notification is still in the system tray
    });
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[Push] Notification tapped:', action);
    const data = action.notification.data;

    if (data?.notification_type === 'message') {
      window.location.href = '/m/inbox';
    } else if (data?.notification_type === 'assignment') {
      window.location.href = data.booking_id ? `/m/job/${data.booking_id}` : '/m';
    } else if (data?.notification_type === 'schedule') {
      window.location.href = data.booking_id ? `/m/job/${data.booking_id}` : '/m';
    } else if (data?.notification_type === 'broadcast') {
      window.location.href = '/m/inbox';
    } else {
      window.location.href = '/m';
    }
  });

  // 4. Register with APNs/FCM — timeout-protected so it can never hang
  try {
    await withTimeout(
      PushNotifications.register(),
      10000,
      '[Push] register() timed out'
    );
    initialized = true;
    console.log('[Push] Push notifications initialized');
  } catch (err) {
    // register() timed out or threw — not fatal, token may still arrive
    // via the 'registration' listener later
    console.warn('[Push] register() failed or timed out, continuing:', err);
    initialized = true; // Mark as initialized so we don't retry endlessly
  }
}

/** Race a promise against a timeout — prevents indefinite hangs */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function unregisterPushNotifications(): Promise<void> {
  const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
  if (isScanner) return;
  if (!Capacitor.isNativePlatform()) return;

  try {
    await PushNotifications.removeAllListeners();
    initialized = false;
    initializing = false;
    console.log('[Push] Unregistered');
  } catch (err) {
    console.error('[Push] Unregister error:', err);
}

/**
 * Schedule a local notification (no server round-trip).
 *
 * Used by client-side detectors (e.g. last-shift-end prompt) that need to
 * surface a notification even if the app is backgrounded. On non-native
 * platforms or scanner mode this is a silent no-op — the in-app dialog
 * still shows because the calling hook also opens it directly.
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  options?: { id?: number; data?: Record<string, unknown> }
): Promise<void> {
  const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
  if (isScanner) return;
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: options?.id ?? Math.floor(Date.now() % 2_000_000_000),
          title,
          body,
          schedule: { at: new Date(Date.now() + 100) },
          extra: options?.data || {},
        },
      ],
    });
  } catch (err) {
    console.warn('[Push] scheduleLocalNotification failed:', err);
  }
}
}
