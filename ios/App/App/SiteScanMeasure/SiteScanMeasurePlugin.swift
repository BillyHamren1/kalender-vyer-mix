import Foundation
import Capacitor
import UIKit
#if canImport(SwiftUI)
import SwiftUI
#endif

/**
 * Capacitor plugin bridging React (`useNativeSiteScan` →
 * `SiteScanMeasure.openMeasure`) to the native SwiftUI MeasureScreen.
 *
 * The native MeasureScreen + its dependencies (ARSessionManager,
 * MeasureViewModel, ARMeasureView, models, theme, services) are ported
 * from the SiteScanMobile project and live alongside this file under
 * `ios/App/App/SiteScanMeasure/`.
 *
 * Wiring required in Xcode (one-time setup, can't be done from Lovable):
 *   1. Add this folder to the App target.
 *   2. Add ARKit.framework and SceneKit.framework as required frameworks.
 *   3. Confirm `NSCameraUsageDescription` is present (already in
 *      `capacitor.time.config.ts`).
 *
 * After that, `npx cap sync ios` registers the plugin automatically via
 * the @objc(SiteScanMeasurePlugin) declaration below.
 */
@objc(SiteScanMeasurePlugin)
public class SiteScanMeasurePlugin: CAPPlugin {

    /// Holds the active call so we can resolve it when the user closes the
    /// native MeasureScreen.
    private var pendingCall: CAPPluginCall?

    @objc func openMeasure(_ call: CAPPluginCall) {
        // Keep the call until the SwiftUI screen closes.
        call.keepAlive = true
        self.pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let bridgeVC = self.bridge?.viewController else {
                call.reject("No root view controller")
                return
            }

            #if canImport(SwiftUI) && canImport(ARKit)
            // The SwiftUI MeasureScreen below is provided by the ported
            // SiteScanMobile sources (MeasureScreen.swift et al.).
            let scanId = call.getString("scanId")
            let bookingId = call.getString("bookingId")
            let title = call.getString("title") ?? ""

            let host = SiteScanMeasureHostingController(
                scanId: scanId,
                bookingId: bookingId,
                initialTitle: title
            ) { [weak self] result in
                guard let self = self, let pending = self.pendingCall else { return }
                pending.resolve([
                    "saved": result.saved,
                    "scanId": result.scanId ?? NSNull()
                ])
                self.pendingCall = nil
            }
            host.modalPresentationStyle = .fullScreen
            bridgeVC.present(host, animated: true)
            #else
            call.reject("ARKit / SwiftUI not available on this platform")
            #endif
        }
    }
}

/// Result returned from the native MeasureScreen back to JS.
public struct SiteScanMeasureResult {
    public let saved: Bool
    public let scanId: String?
}
