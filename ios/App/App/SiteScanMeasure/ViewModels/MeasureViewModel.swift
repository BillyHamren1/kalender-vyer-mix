import SwiftUI
import Combine

enum MeasurementType: String, CaseIterable, Identifiable {
    case distance = "distance"
    case verticalHeight = "vertical_height"
    case width = "width"
    case freeDistance = "free_distance"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .distance:       return "Avstånd"
        case .verticalHeight: return "Höjd"
        case .width:          return "Bredd"
        case .freeDistance:   return "Fri bana"
        }
    }
    var icon: String {
        switch self {
        case .distance:       return "ruler"
        case .verticalHeight: return "arrow.up.and.down"
        case .width:          return "arrow.left.and.right"
        case .freeDistance:   return "point.topleft.down.to.point.bottomright.curvepath"
        }
    }
}

enum PlacementState: Equatable {
    case idle
    case placingA
    case placingB
    case placingMulti(count: Int)
    case complete

    var icon: String {
        switch self {
        case .idle:        return "scope"
        case .placingA:    return "a.circle.fill"
        case .placingB:    return "b.circle.fill"
        case .placingMulti: return "plus.circle.fill"
        case .complete:    return "checkmark.circle.fill"
        }
    }
}

struct PointLockEvent: Identifiable {
    let id = UUID()
    let pointIndex: Int
    let confidence: Double
    let timestamp: Date
}

@MainActor
final class MeasureViewModel: ObservableObject {

    @Published var measurementType: MeasurementType = .distance
    @Published var placementState: PlacementState = .idle
    @Published var currentPoints: [MeasurementPoint] = []
    @Published var currentLabel: String = ""
    @Published var measurements: [MeasurementResult] = []
    @Published var isSessionActive: Bool = false
    @Published var sessionStartedAt: Date?
    @Published var lastPointLock: PointLockEvent? = nil
    @Published var surfaceDetected: Bool = false
    @Published var isReviewMode: Bool = false

    var placePointFromCenter: (() -> Void)?

    var currentDistance: Double? {
        guard currentPoints.count >= 2 else { return nil }
        let a = currentPoints.first!, b = currentPoints.last!
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        return (dx*dx + dy*dy + dz*dz).squareRoot()
    }

    var currentHeight: Double? {
        guard currentPoints.count >= 2 else { return nil }
        return abs(currentPoints.last!.y - currentPoints.first!.y)
    }

    var currentWidth: Double? {
        guard currentPoints.count >= 2 else { return nil }
        let a = currentPoints.first!, b = currentPoints.last!
        let dx = b.x - a.x, dz = b.z - a.z
        return (dx*dx + dz*dz).squareRoot()
    }

    var currentTotalLength: Double? {
        guard currentPoints.count >= 2 else { return nil }
        var total: Double = 0
        for i in 1..<currentPoints.count {
            let a = currentPoints[i - 1], b = currentPoints[i]
            let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
            total += (dx*dx + dy*dy + dz*dz).squareRoot()
        }
        return total
    }

    var displayValue: Double? {
        switch measurementType {
        case .distance:       return currentDistance
        case .verticalHeight: return currentHeight
        case .width:          return currentWidth
        case .freeDistance:   return currentTotalLength
        }
    }

    var canPlacePoint: Bool {
        switch placementState {
        case .placingA, .placingB, .placingMulti: return true
        default: return false
        }
    }

    var canFinishMulti: Bool {
        if case .placingMulti = placementState, currentPoints.count >= 2 { return true }
        return false
    }

    func startSession() {
        isSessionActive = true
        sessionStartedAt = Date()
        resetCurrentMeasurement()
    }

    func startMeasurement() {
        isReviewMode = false
        resetCurrentMeasurement()
        placementState = .placingA
    }

    @discardableResult
    func saveMeasurementAndContinue() -> MeasurementResult? {
        let result = saveMeasurement()
        placementState = .placingA
        isReviewMode = false
        return result
    }

    func addRealPoint(_ point: MeasurementPoint) {
        guard canPlacePoint else { return }
        currentPoints.append(point)
        lastPointLock = PointLockEvent(
            pointIndex: currentPoints.count - 1,
            confidence: point.confidence ?? 0.5,
            timestamp: Date()
        )
        advancePlacement()
    }

    func finishFreeDistance() {
        guard canFinishMulti else { return }
        placementState = .complete
    }

    @discardableResult
    func saveMeasurement() -> MeasurementResult? {
        guard currentPoints.count >= 2 else { return nil }
        let label = currentLabel.isEmpty ? defaultLabel() : currentLabel
        let result = MeasurementResult(label: label, points: currentPoints, createdAt: Date())
        measurements.append(result)
        resetCurrentMeasurement()
        return result
    }

    func undoLastPoint() {
        guard !currentPoints.isEmpty else { return }
        currentPoints.removeLast()
        switch measurementType {
        case .distance, .verticalHeight, .width:
            placementState = currentPoints.isEmpty ? .placingA : .placingB
        case .freeDistance:
            placementState = currentPoints.isEmpty ? .placingA : .placingMulti(count: currentPoints.count)
        }
    }

    func clearAll() {
        measurements.removeAll()
        resetCurrentMeasurement()
    }

    func endSession() {
        isSessionActive = false
        isReviewMode = false
        resetCurrentMeasurement()
    }

    func buildCapture() -> MeasureCapture {
        MeasureCapture(
            measurements: measurements,
            captureStartedAt: sessionStartedAt,
            captureCompletedAt: Date()
        )
    }

    private func resetCurrentMeasurement() {
        currentPoints = []
        currentLabel = ""
        placementState = .idle
        lastPointLock = nil
    }

    private func advancePlacement() {
        switch measurementType {
        case .distance, .verticalHeight, .width:
            placementState = currentPoints.count < 2 ? .placingB : .complete
        case .freeDistance:
            placementState = .placingMulti(count: currentPoints.count)
        }
    }

    private func defaultLabel() -> String {
        let prefix: String
        switch measurementType {
        case .distance:       prefix = "Avstånd"
        case .verticalHeight: prefix = "Höjd"
        case .width:          prefix = "Bredd"
        case .freeDistance:   prefix = "Bana"
        }
        return "\(prefix) \(measurements.count + 1)"
    }
}
