import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { mobileApi } from './mobileApiService';

let initialized = false;
let initializing = false;

export async function initPushNotifications(staffId: string): Promise<void> {
  if (initialized || initializing) {
    console.log('[Push] Already initialized or initializing, skipping');
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not a native platform, skipping push registration');
    return;
  }

  initializing = true;

  try {
    // 1. Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[Push] Permission not granted');
      initializing = false;
      return;
    }

    // 2. Clean slate — remove any old listeners first
    await PushNotifications.removeAllListeners();

    // 3. Set up ALL listeners BEFORE calling register()
    // This prevents the race condition where register() fires the
    // 'registration' event before the listener is attached (Android)
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token received:', token.value.slice(0, 20) + '...');
      try {
        await mobileApi.registerPushToken(token.value);
        console.log('[Push] Token registered with server');
      } catch (err) {
        console.error('[Push] Failed to register token with server:', err);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Notification received in foreground:', notification);
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

    // 4. NOW register with APNs/FCM — listeners are already in place
    await PushNotifications.register();

    initialized = true;
    console.log('[Push] Push notifications initialized');
  } catch (err) {
    console.error('[Push] Init error:', err);
  } finally {
    initializing = false;
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await PushNotifications.removeAllListeners();
    initialized = false;
    initializing = false;
    console.log('[Push] Unregistered');
  } catch (err) {
    console.error('[Push] Unregister error:', err);
  }
}
