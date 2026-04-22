import UIKit
#if canImport(SwiftUI)
import SwiftUI
#endif

/// Hosts the SwiftUI MeasureScreen as a fullscreen modal launched from the
/// Capacitor plugin. Result (saved measurements as JSON) is delivered via onClose.
#if canImport(SwiftUI) && canImport(ARKit)
final class SiteScanMeasureHostingController: UIHostingController<AnyView> {

    private let onClose: (SiteScanMeasureResult) -> Void

    init(
        scanId: String?,
        bookingId: String?,
        initialTitle: String,
        onClose: @escaping (SiteScanMeasureResult) -> Void
    ) {
        self.onClose = onClose

        // Bootstrap with placeholder; real view is wired below so we can
        // safely capture self for the callbacks.
        super.init(rootView: AnyView(EmptyView()))

        let screen = MeasureScreen(
            initialTitle: initialTitle,
            onSaved: { [weak self] capture in
                self?.dismissWithCapture(capture, scanId: scanId, bookingId: bookingId)
            },
            onClose: { [weak self] in
                self?.dismissWithResult(SiteScanMeasureResult(
                    saved: false, scanId: scanId, capture: nil
                ))
            }
        )
        self.rootView = AnyView(screen)
    }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func dismissWithCapture(_ capture: MeasureCapture, scanId: String?, bookingId: String?) {
        let result = SiteScanMeasureResult(saved: !capture.measurements.isEmpty, scanId: scanId, capture: capture)
        dismissWithResult(result)
    }

    private func dismissWithResult(_ result: SiteScanMeasureResult) {
        dismiss(animated: true) { [weak self] in
            self?.onClose(result)
        }
    }
}
#endif
