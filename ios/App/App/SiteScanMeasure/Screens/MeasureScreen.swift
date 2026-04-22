import SwiftUI
import AVFoundation

#if canImport(ARKit)
import ARKit
#endif

/// Self-contained measurement screen for EventFlow Time.
/// Hosts ARMeasureView, the type picker, the action area and a center-screen crosshair.
/// On dismiss, returns the captured measurements via `onClose`.
struct MeasureScreen: View {

    let initialTitle: String
    let onSaved: (MeasureCapture) -> Void
    let onClose: () -> Void

    @StateObject private var arSession = ARSessionManager(scanMode: .measure)
    @StateObject private var vm = MeasureViewModel()
    @State private var cameraAuthorized: Bool = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    @State private var requestingCamera = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if !cameraAuthorized {
                permissionView
            } else {
                measureContent
            }

            // Top close + timer
            VStack {
                HStack {
                    Button {
                        arSession.stop()
                        onClose()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.black.opacity(0.5)))
                    }
                    Spacer()
                    if vm.isSessionActive {
                        HStack(spacing: 6) {
                            Circle().fill(Color.red).frame(width: 7, height: 7)
                            Text(formatTime(arSession.elapsedSeconds))
                                .font(.system(size: 13, weight: .medium, design: .monospaced))
                                .foregroundStyle(.white)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.5)))
                    }
                    Spacer()
                    Button {
                        let capture = vm.buildCapture()
                        arSession.stop()
                        onSaved(capture)
                    } label: {
                        Text("Klar")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(vm.measurements.isEmpty ? Color.gray.opacity(0.5) : Color.accentColor))
                    }
                    .disabled(vm.measurements.isEmpty)
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, 50)
                Spacer()
            }
        }
        .onAppear {
            ensureCameraPermission()
        }
        .onDisappear {
            arSession.stop()
        }
        .alert(item: Binding(
            get: { arSession.error },
            set: { _ in arSession.dismissError() }
        )) { err in
            Alert(title: Text("Sessionsfel"), message: Text(err.message), dismissButton: .default(Text("OK")))
        }
    }

    // MARK: - Permission

    private var permissionView: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(.white.opacity(0.7))
            Text("Kameraåtkomst krävs")
                .font(.title3.bold())
                .foregroundStyle(.white)
            Text("EventFlow Time behöver kameran för att kunna mäta i AR.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                requestCamera()
            } label: {
                Text(requestingCamera ? "Begär…" : "Tillåt kamera")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Color.accentColor))
            }
            .padding(.horizontal, Theme.Spacing.xl)
            Button("Öppna inställningar") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .foregroundStyle(.white.opacity(0.7))
        }
    }

    private func ensureCameraPermission() {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .authorized {
            cameraAuthorized = true
            startSessionIfNeeded()
        } else if status == .notDetermined {
            requestCamera()
        }
    }

    private func requestCamera() {
        requestingCamera = true
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                requestingCamera = false
                cameraAuthorized = granted
                if granted { startSessionIfNeeded() }
            }
        }
    }

    private func startSessionIfNeeded() {
        guard arSession.sessionState == .idle || arSession.sessionState == .stopped else { return }
        arSession.reset()
        arSession.start()
    }

    // MARK: - Main content

    private var measureContent: some View {
        VStack(spacing: 0) {
            arViewport
                .frame(maxHeight: .infinity)
            bottomPanel
        }
        .background(Color.black)
        .ignoresSafeArea(.container, edges: .top)
    }

    private var arViewport: some View {
        ZStack {
            #if canImport(ARKit)
            ARMeasureView(viewModel: vm, arSessionManager: arSession)
            #else
            Color.black
            #endif

            CrosshairOverlay(active: vm.canPlacePoint)

            VStack {
                MeasurementReadout(
                    value: vm.displayValue,
                    type: vm.measurementType,
                    pointCount: vm.currentPoints.count
                )
                .padding(.top, 100)
                Spacer()
                trackingOverlay
                    .padding(.bottom, Theme.Spacing.sm)
            }
        }
    }

    @ViewBuilder
    private var trackingOverlay: some View {
        switch arSession.trackingState {
        case .notAvailable:
            trackingBanner(text: "Tracking ej tillgänglig", color: .red)
        case .limited(let reason):
            trackingBanner(text: reason, color: .yellow)
        case .normal:
            EmptyView()
        }
    }

    private func trackingBanner(text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white.opacity(0.9))
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(color.opacity(0.6)))
    }

    // MARK: - Bottom panel

    private var bottomPanel: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.white.opacity(0.2))
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            VStack(spacing: Theme.Spacing.md) {
                measurementTypePicker
                actionArea
                if !vm.measurements.isEmpty { savedBadge }
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.lg)
        }
        .background(
            UnevenRoundedRectangle(topLeadingRadius: Theme.Radius.xl, topTrailingRadius: Theme.Radius.xl)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.3), radius: 20, y: -5)
                .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    private var measurementTypePicker: some View {
        HStack(spacing: 6) {
            ForEach(MeasurementType.allCases) { type in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        vm.measurementType = type
                    }
                    if vm.placementState != .idle && vm.placementState != .complete {
                        vm.startMeasurement()
                    }
                } label: {
                    VStack(spacing: 2) {
                        Image(systemName: type.icon)
                            .font(.system(size: 15, weight: .semibold))
                        Text(type.label)
                            .font(.system(size: 9, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .foregroundStyle(vm.measurementType == type ? .white : .secondary)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .fill(vm.measurementType == type ? Color.accentColor : Color.surfaceSecondary)
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var actionArea: some View {
        switch vm.placementState {
        case .idle:
            primaryButton(title: "Starta mätning", icon: "play.fill") {
                if !vm.isSessionActive { vm.startSession() }
                vm.startMeasurement()
            }

        case .placingA, .placingB:
            VStack(spacing: Theme.Spacing.md) {
                primaryButton(title: "Fäst punkt", icon: "scope") {
                    vm.placePointFromCenter?()
                }
                HStack(spacing: 8) {
                    Image(systemName: vm.placementState.icon)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                    Text("Sikta med korshåret och tryck ovan")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    if !vm.currentPoints.isEmpty {
                        Button {
                            vm.undoLastPoint()
                        } label: {
                            Image(systemName: "arrow.uturn.backward")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

        case .placingMulti:
            VStack(spacing: Theme.Spacing.md) {
                primaryButton(title: "Fäst punkt", icon: "scope") {
                    vm.placePointFromCenter?()
                }
                HStack(spacing: 8) {
                    Text("Punkt \(vm.currentPoints.count + 1)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.green)
                    Spacer()
                    if vm.canFinishMulti {
                        Button {
                            vm.finishFreeDistance()
                        } label: {
                            Text("Slutför")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(Capsule().fill(Color.accentColor))
                        }
                    }
                }
            }

        case .complete:
            VStack(spacing: Theme.Spacing.md) {
                HStack {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    TextField("Namnge mätningen…", text: $vm.currentLabel)
                        .font(.subheadline)
                }
                .padding(Theme.Spacing.md)
                .background(RoundedRectangle(cornerRadius: Theme.Radius.md).fill(Color.surfaceSecondary))

                HStack(spacing: Theme.Spacing.sm) {
                    Button {
                        vm.saveMeasurementAndContinue()
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                    } label: {
                        Label("Spara & nästa", systemImage: "arrow.right.circle.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Color.accentColor))
                    }
                    Button {
                        vm.startMeasurement()
                    } label: {
                        Label("Mät om", systemImage: "arrow.counterclockwise")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Color.surfaceSecondary))
                    }
                }
            }
        }
    }

    private var savedBadge: some View {
        HStack {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.green)
            Text("\(vm.measurements.count) sparad\(vm.measurements.count == 1 ? "" : "e")")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Button("Rensa", role: .destructive) {
                vm.clearAll()
            }
            .font(.system(size: 12, weight: .semibold))
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.sm).fill(Color.surfaceSecondary))
    }

    private func primaryButton(title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Color.accentColor))
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60, s = Int(seconds) % 60
        return String(format: "%02d:%02d", m, s)
    }
}

// MARK: - Crosshair

private struct CrosshairOverlay: View {
    let active: Bool
    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(Color.white.opacity(active ? 0.95 : 0.5), lineWidth: 1.5)
                .frame(width: 36, height: 36)
            Circle()
                .fill(Color.white.opacity(active ? 0.95 : 0.5))
                .frame(width: 4, height: 4)
        }
    }
}

// MARK: - Readout

private struct MeasurementReadout: View {
    let value: Double?
    let type: MeasurementType
    let pointCount: Int

    var body: some View {
        VStack(spacing: 4) {
            Text(type.label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.6))
                .tracking(1.2)
            Text(displayString)
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
            if pointCount > 0 {
                Text("\(pointCount) punkter")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(.black.opacity(0.55)))
    }

    private var displayString: String {
        guard let v = value else { return "—" }
        return v < 1 ? String(format: "%.0f mm", v * 1000) : String(format: "%.3f m", v)
    }
}
