import Foundation
import Capacitor
import UIKit
#if canImport(SwiftUI)
import SwiftUI
#endif

/// Capacitor plugin bridging React (`useNativeSiteScan` → `SiteScanMeasure.openMeasure`)
/// to the native SwiftUI MeasureScreen.
///
/// Returns a JSON payload describing the captured measurements:
/// {
///   saved: Bool,
///   scanId: String?,
///   measurementCount: Int,
///   capture: { measurements: [...], captureStartedAt, captureCompletedAt }
/// }
@objc(SiteScanMeasurePlugin)
public class SiteScanMeasurePlugin: CAPPlugin {

    private var pendingCall: CAPPluginCall?

    @objc func openMeasure(_ call: CAPPluginCall) {
        call.keepAlive = true
        self.pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let bridgeVC = self.bridge?.viewController else {
                call.reject("No root view controller")
                return
            }

            #if canImport(SwiftUI) && canImport(ARKit)
            let scanId = call.getString("scanId")
            let bookingId = call.getString("bookingId")
            let title = call.getString("title") ?? ""

            let host = SiteScanMeasureHostingController(
                scanId: scanId,
                bookingId: bookingId,
                initialTitle: title
            ) { [weak self] result in
                guard let self = self, let pending = self.pendingCall else { return }
                pending.resolve(result.toJSObject())
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
    public let capture: MeasureCapture?

    func toJSObject() -> [String: Any] {
        var obj: [String: Any] = [
            "saved": saved,
            "scanId": scanId ?? NSNull(),
            "measurementCount": capture?.measurements.count ?? 0
        ]
        if let capture = capture {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            if let data = try? encoder.encode(capture),
               let json = try? JSONSerialization.jsonObject(with: data) {
                obj["capture"] = json
            }
        }
        return obj
    }
}
