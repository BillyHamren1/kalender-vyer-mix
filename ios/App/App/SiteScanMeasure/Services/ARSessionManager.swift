import Foundation
import Combine
import SwiftUI
import os

#if canImport(ARKit)
import ARKit
#endif

/// AR session lifecycle manager.
/// Ported from SiteScan's ARSessionManager, trimmed to what MeasureScreen needs.
@MainActor
final class ARSessionManager: NSObject, ObservableObject {

    @Published private(set) var sessionState: SessionState = .idle
    @Published private(set) var trackingState: TrackingQuality = .notAvailable
    @Published private(set) var error: SessionError? = nil
    @Published private(set) var elapsedSeconds: TimeInterval = 0
    @Published private(set) var sessionVersion: Int = 0

    enum SessionState: Equatable {
        case idle, preparing, running, paused, stopped
        case interrupted(reason: String)
        case failed(message: String)
        var isActive: Bool {
            switch self {
            case .running, .paused, .interrupted: return true
            default: return false
            }
        }
    }

    enum TrackingQuality: Equatable {
        case notAvailable
        case limited(reason: String)
        case normal
    }

    struct SessionError: Identifiable, Equatable {
        let id = UUID()
        let code: ErrorCode
        let message: String
        let isRecoverable: Bool
        static func == (lhs: SessionError, rhs: SessionError) -> Bool { lhs.id == rhs.id }
        enum ErrorCode: String {
            case cameraUnavailable, sensorFailed, worldTrackingFailed
            case insufficientFeatures, sessionInterrupted, configurationFailed, unknown
        }
    }

    private(set) var scanMode: ScanMode

    #if canImport(ARKit)
    let arSession: ARSession = ARSession()
    #endif

    private var timer: Timer?
    private var sessionStartTime: Date?
    private let logger = Logger(subsystem: "se.eventflow.time", category: "ARSession")

    init(scanMode: ScanMode) {
        self.scanMode = scanMode
        super.init()
        #if canImport(ARKit)
        arSession.delegate = self
        #endif
    }

    deinit { timer?.invalidate() }

    func start() {
        guard sessionState == .idle || sessionState == .stopped else { return }
        sessionState = .preparing
        error = nil

        #if canImport(ARKit)
        guard ARWorldTrackingConfiguration.isSupported else {
            sessionState = .failed(message: "ARKit world tracking stöds inte på denna enhet.")
            error = SessionError(code: .worldTrackingFailed, message: "ARWorldTrackingConfiguration stöds ej.", isRecoverable: false)
            return
        }
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.isLightEstimationEnabled = true
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            config.frameSemantics.insert(.smoothedSceneDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        arSession.run(config, options: [.resetTracking, .removeExistingAnchors])
        sessionState = .running
        sessionVersion += 1
        startTimer()
        #else
        sessionState = .running
        startTimer()
        #endif
    }

    func pause() {
        guard sessionState == .running else { return }
        #if canImport(ARKit)
        arSession.pause()
        #endif
        stopTimer()
        sessionState = .paused
    }

    func stop() {
        #if canImport(ARKit)
        arSession.pause()
        #endif
        stopTimer()
        sessionState = .stopped
        trackingState = .notAvailable
    }

    func reset() {
        stop()
        sessionState = .idle
        error = nil
        elapsedSeconds = 0
        sessionStartTime = nil
    }

    func dismissError() { error = nil }

    private func startTimer() {
        sessionStartTime = sessionStartTime ?? Date()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.sessionStartTime else { return }
                self.elapsedSeconds = Date().timeIntervalSince(start)
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    #if canImport(ARKit)
    private func mapTrackingState(_ s: ARCamera.TrackingState) -> TrackingQuality {
        switch s {
        case .notAvailable: return .notAvailable
        case .limited(let reason):
            let desc: String
            switch reason {
            case .initializing:         desc = "Initierar"
            case .excessiveMotion:      desc = "Rör enheten långsammare"
            case .insufficientFeatures: desc = "Rikta mot en yta med mer detaljer"
            case .relocalizing:         desc = "Återfinner position…"
            @unknown default:           desc = "Okänd begränsning"
            }
            return .limited(reason: desc)
        case .normal: return .normal
        }
    }
    #endif
}

#if canImport(ARKit)
extension ARSessionManager: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        Task { @MainActor in
            trackingState = mapTrackingState(camera.trackingState)
        }
    }

    nonisolated func session(_ session: ARSession, didFailWithError arError: Error) {
        Task { @MainActor in
            let nsError = arError as NSError
            let code: SessionError.ErrorCode
            let recoverable: Bool
            switch nsError.code {
            case ARError.cameraUnauthorized.rawValue:
                code = .cameraUnavailable; recoverable = false
            case ARError.sensorFailed.rawValue:
                code = .sensorFailed; recoverable = true
            case ARError.sensorUnavailable.rawValue:
                code = .sensorFailed; recoverable = false
            case ARError.worldTrackingFailed.rawValue:
                code = .worldTrackingFailed; recoverable = true
            case ARError.insufficientFeatures.rawValue:
                code = .insufficientFeatures; recoverable = true
            default:
                code = .unknown; recoverable = true
            }
            error = SessionError(code: code, message: arError.localizedDescription, isRecoverable: recoverable)
            if !recoverable {
                sessionState = .failed(message: arError.localizedDescription)
                stop()
            }
        }
    }

    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor in
            sessionState = .interrupted(reason: "Sessionen avbröts.")
        }
    }

    nonisolated func sessionInterruptionEnded(_ session: ARSession) {
        Task { @MainActor in
            if case .interrupted = sessionState { sessionState = .running }
        }
    }
}
#endif
