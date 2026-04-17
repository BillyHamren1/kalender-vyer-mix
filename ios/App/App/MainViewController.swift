import UIKit
import Capacitor

/// Custom subclass of CAPBridgeViewController.
/// Used to enable Safari Web Inspector debugging for the Capacitor WKWebView.
class MainViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Force the WebView to live below the iOS status bar/safe area.
        // This protects the Time app even if the generated Capacitor config
        // has not been synced into the native project yet.
        additionalSafeAreaInsets.top = UIApplication.shared.statusBarFrame.height
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        // Enable Safari Web Inspector for this WKWebView on iOS 16.4+.
        // Without this, Safari shows "no inspectable applications" even when
        // Web Inspector is enabled on the device.
        if #available(iOS 16.4, *) {
            webView?.isInspectable = true
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()

        let topInset = view.window?.windowScene?.statusBarManager?.statusBarFrame.height ?? view.safeAreaInsets.top
        additionalSafeAreaInsets.top = max(0, topInset)
    }
}
