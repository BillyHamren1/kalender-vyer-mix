import UIKit
import Capacitor

/// Custom subclass of CAPBridgeViewController.
/// Used to enable Safari Web Inspector debugging for the Capacitor WKWebView.
class MainViewController: CAPBridgeViewController {

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        // Enable Safari Web Inspector for this WKWebView on iOS 16.4+.
        // Without this, Safari shows "no inspectable applications" even when
        // Web Inspector is enabled on the device.
        if #available(iOS 16.4, *) {
            webView?.isInspectable = true
        }
    }
}
