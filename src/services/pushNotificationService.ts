import { Capacitor } from '@capacitor/core';
import { App, type AppState } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { mobileApi } from './mobileApiService';

let initialized = false;
let initializing = false;
let appResumeListenerAttached = false;

const LAST_REGISTER_KEY = 'push:last_register_at';
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

function markRegistered(): void {
  try {
    localStorage.setItem(LAST_REGISTER_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function shouldRefresh(): boolean {
  try {
    const raw = localStorage.getItem(LAST_REGISTER_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > REFRESH_AFTER_MS;
  } catch {
    return true;
  }
}

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

  // Attach the app-resume refresh listener exactly once per session.
  attachAppResumeRefresh(staffId);
}

/**
 * Re-trigger PushNotifications.register() when the app comes to the
 * foreground if our last successful registration is older than 24h.
 * This forces FCM/APNs to hand us a fresh token if rotation happened
 * while the app was backgrounded — keeps device_tokens table healthy.
 */
function attachAppResumeRefresh(_staffId: string): void {
  if (appResumeListenerAttached) return;
  if (!Capacitor.isNativePlatform()) return;
  appResumeListenerAttached = true;

  try {
    App.addListener('appStateChange', (state: AppState) => {
      if (!state.isActive) return;
      if (!shouldRefresh()) {
        console.log('[Push] Resume — token still fresh, skip re-register');
        return;
      }
      console.log('[Push] Resume — last register >24h ago, calling register() again');
      // Reset listeners not required: register() is idempotent and the
      // existing 'registration' listener (set up in _doInit) will catch
      // any new token that FCM/APNs hands back.
      PushNotifications.register().catch((err) => {
        console.warn('[Push] Resume register() failed (non-fatal):', err);
      });
    }).catch((err) => {
      console.warn('[Push] Failed to attach appStateChange listener:', err);
    });
  } catch (err) {
    console.warn('[Push] attachAppResumeRefresh threw:', err);
  }
}

async function _doInit(staffId: string): Promise<void> {
  // 1. CHECK current permission status first — never re-prompt if the user
  //    has already answered (granted OR denied). iOS/Android persist the
  //    answer across launches; asking again every login is a UX bug and on
  //    iOS the OS silently ignores repeat requests anyway.
  let currentStatus: string = 'prompt';
  try {
    const check = await withTimeout(
      PushNotifications.checkPermissions(),
      4000,
      '[Push] checkPermissions timed out'
    );
    currentStatus = check.receive;
    console.log('[Push] Current permission status:', currentStatus);
  } catch (err) {
    console.warn('[Push] checkPermissions failed, assuming prompt:', err);
  }

  // Only show the OS dialog when the user has NEVER answered before.
  if (currentStatus === 'prompt' || currentStatus === 'prompt-with-rationale') {
    console.log('[Push] First-time prompt — requesting permission');
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
    currentStatus = permResult.receive;
  }

  if (currentStatus !== 'granted') {
    console.log('[Push] Permission not granted (status:', currentStatus, ') — skipping register');
    return;
  }

  // 2. Set up ALL listeners BEFORE calling register().
  //    NOTE: We intentionally do NOT call PushNotifications.removeAllListeners()
  //    here. Other parts of the app (notably useGpsPulseHandler) register their
  //    own listeners on the same plugin, and removeAllListeners would silently
  //    wipe them — causing gps_pulse silent pushes to never be handled.
  //    Dubblettskydd sker via initialized/initializing-flaggorna ovan.

  PushNotifications.addListener('registration', (token) => {
    console.log('[Push] Token received:', token.value?.slice(0, 20) + '...');
    // Save token async — never block on this
    mobileApi.registerPushToken(token.value).then(() => {
      markRegistered();
      console.log('[Push] Token registered with server');
    }).catch((err) => {
      console.error('[Push] Failed to register token with server:', err);
    });
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[Push] Registration error:', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const data = (notification?.data ?? (notification as any)?.notification?.data ?? {}) as Record<string, any>;

    // ── Silent system events (gps_pulse) — dispatch only, no UI ──
    if (data?.type === 'gps_pulse') {
      console.log('[Push] gps_pulse received (silent) — dispatching event');
      try {
        window.dispatchEvent(new CustomEvent('gps-pulse-received', { detail: data }));
      } catch (err) {
        console.warn('[Push] gps-pulse-received dispatch failed:', err);
      }
      // Also dispatch the general event so other listeners can observe it,
      // but skip any toast/navigation for this silent system event.
      try {
        window.dispatchEvent(new CustomEvent('push-notification-received', { detail: notification }));
      } catch { /* ignore */ }
      return;
    }

    console.log('[Push] Notification received in foreground:', notification);

    // Dispatch custom event so hooks/components can react (e.g. badge refresh, location_ping)
    window.dispatchEvent(new CustomEvent('push-notification-received', {
      detail: notification,
    }));

    // location_ping is a silent system request — no toast/navigation.
    if (data?.notification_type === 'location_ping') {
      return;
    }

    // Show in-app toast using sonner (imported dynamically to avoid circular deps)
    const title = notification.title || 'Nytt meddelande';
    const body = notification.body || '';

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
    try { localStorage.removeItem(LAST_REGISTER_KEY); } catch { /* ignore */ }
    console.log('[Push] Unregistered');
  } catch (err) {
    console.error('[Push] Unregister error:', err);
  }
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
