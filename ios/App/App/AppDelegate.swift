import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // --- Firebase + APNs bootstrap (required for push notifications) ---
        // GoogleService-Info.plist MUST be added to the Xcode project before this runs.
        FirebaseApp.configure()

        // Tell iOS we are interested in notifications and give APNs a chance to hand
        // us a device token. Capacitor's @capacitor/push-notifications plugin then
        // listens for the resulting NSNotification posts and bridges the token to JS.
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self

        // Kick off APNs registration immediately so the OS has the token ready by
        // the time the JS layer calls PushNotifications.register(). Without this
        // call iOS NEVER asks Apple for an APNs token and FCM can never deliver.
        application.registerForRemoteNotifications()

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - APNs <-> Firebase Messaging bridging

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Hand the raw APNs token to Firebase so FCM can mint an FCM token bound to it.
        Messaging.messaging().apnsToken = deviceToken
        // Also notify Capacitor's plugin (legacy path — keeps in-app refresh working).
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // Show banner/sound when a notification arrives while the app is in the foreground.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    // MARK: - MessagingDelegate

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        // FCM hands us a fresh token here. The Capacitor plugin emits its own
        // 'registration' event from the APNs path, but on iOS we want the FCM
        // token (so server-side can talk FCM v1). Post a notification the JS
        // layer's existing 'registration' listener already understands.
        guard let token = fcmToken else { return }
        if let data = token.data(using: .utf8) {
            NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: data)
        }
    }
}
