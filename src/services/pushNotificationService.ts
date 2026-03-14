import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { mobileApi } from './mobileApiService';

let initialized = false;

export async function initPushNotifications(staffId: string): Promise<void> {
  if (initialized) return;
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not a native platform, skipping push registration');
    return;
  }

  try {
    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[Push] Permission not granted');
      return;
    }

    // Register with APNs/FCM
    await PushNotifications.register();

    // Listen for registration success
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token received:', token.value.slice(0, 20) + '...');
      try {
        await mobileApi.registerPushToken(token.value);
        console.log('[Push] Token registered with server');
      } catch (err) {
        console.error('[Push] Failed to register token:', err);
      }
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration error:', error);
    });

    // Handle received notifications (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Notification received in foreground:', notification);
      // Could show an in-app toast here
    });

    // Handle notification tap
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

    initialized = true;
    console.log('[Push] Push notifications initialized');
  } catch (err) {
    console.error('[Push] Init error:', err);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await PushNotifications.removeAllListeners();
    initialized = false;
    console.log('[Push] Unregistered');
  } catch (err) {
    console.error('[Push] Unregister error:', err);
  }
}
