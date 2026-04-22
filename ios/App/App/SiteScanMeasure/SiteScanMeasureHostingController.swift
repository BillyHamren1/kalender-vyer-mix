import UIKit
#if canImport(SwiftUI)
import SwiftUI
#endif

/**
 * UIHostingController wrapper that presents the SwiftUI `MeasureScreen`
 * as a fullscreen modal from the Capacitor plugin and reports the result
 * back when the user dismisses it.
 *
 * The actual `MeasureScreen` SwiftUI view is provided by the ported
 * SiteScanMobile sources (see README in this folder). This controller
 * only handles presentation and result delivery.
 */
#if canImport(SwiftUI) && canImport(ARKit)
final class SiteScanMeasureHostingController: UIHostingController<AnyView> {

    private let onClose: (SiteScanMeasureResult) -> Void
    private let scanId: String?
    private let bookingId: String?

    init(
        scanId: String?,
        bookingId: String?,
        initialTitle: String,
        onClose: @escaping (SiteScanMeasureResult) -> Void
    ) {
        self.onClose = onClose
        self.scanId = scanId
        self.bookingId = bookingId

        // The wrapped SwiftUI view is built lazily so we can inject a
        // dismiss callback. `MeasureScreen` itself is the ported SwiftUI
        // screen from SiteScanMobile.
        let placeholder = AnyView(
            MeasureScreenWrapper(
                initialTitle: initialTitle,
                onSaved: { _ in },
                onClose: { _ in }
            )
        )
        super.init(rootView: placeholder)

        let wrapper = MeasureScreenWrapper(
            initialTitle: initialTitle,
            onSaved: { [weak self] savedScanId in
                self?.dismissWithResult(saved: true, scanId: savedScanId)
            },
            onClose: { [weak self] _ in
                self?.dismissWithResult(saved: false, scanId: nil)
            }
        )
        self.rootView = AnyView(wrapper)
    }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func dismissWithResult(saved: Bool, scanId: String?) {
        let result = SiteScanMeasureResult(saved: saved, scanId: scanId)
        dismiss(animated: true) { [weak self] in
            self?.onClose(result)
        }
    }
}

/// Thin SwiftUI wrapper around the ported `MeasureScreen` so we can
/// inject save/close callbacks without modifying the original view.
struct MeasureScreenWrapper: View {
    let initialTitle: String
    let onSaved: (String?) -> Void
    let onClose: (Void) -> Void

    var body: some View {
        // NOTE: `MeasureScreen` is the ported SwiftUI view from
        // SiteScanMobile. It must be added to the Xcode target along
        // with its dependencies (ARSessionManager, MeasureViewModel,
        // ARMeasureView, models, design tokens). See README.md in this
        // folder for the exact file list.
        MeasureScreen()
            .onDisappear { onClose(()) }
    }
}
#endif
