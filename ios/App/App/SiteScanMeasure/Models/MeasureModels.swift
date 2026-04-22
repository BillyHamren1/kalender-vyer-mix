import Foundation
import simd

// MARK: - Scan Mode

/// Scan mode driving ARSessionManager configuration.
/// Only `.measure` is used by the EventFlow Time port — the other cases are kept
/// for source compatibility with the SiteScan ARSessionManager logic.
enum ScanMode: String, Codable, CaseIterable, Identifiable {
    case measure       = "measure"
    case surfaceScan   = "surface_scan"
    case roomScan      = "room_scan"
    case fastTerrain   = "fast_terrain"

    var id: String { rawValue }
    var label: String { "Mätning" }
}

// MARK: - GeoPoint

struct GeoPoint: Codable, Equatable {
    let latitude: Double
    let longitude: Double
    let accuracy: Double?
    let timestamp: Date
}

// MARK: - Measurement Point

struct MeasurementPoint: Codable, Equatable {
    let x: Double
    let y: Double
    let z: Double
    let confidence: Double?
    let normalX: Double?
    let normalY: Double?
    let normalZ: Double?
    let capturedAt: Date

    var position: SIMD3<Double> { SIMD3(x, y, z) }
}

// MARK: - Measurement Result

struct MeasurementResult: Identifiable, Codable {
    let id: UUID
    var label: String?
    var points: [MeasurementPoint]
    var createdAt: Date

    init(id: UUID = UUID(), label: String? = nil, points: [MeasurementPoint] = [], createdAt: Date = Date()) {
        self.id = id
        self.label = label
        self.points = points
        self.createdAt = createdAt
    }

    var distance: Double? {
        guard let first = points.first, let last = points.last, points.count >= 2 else { return nil }
        return simd_distance(first.position, last.position)
    }

    var totalLength: Double? {
        guard points.count >= 2 else { return nil }
        var total: Double = 0
        for i in 1..<points.count {
            total += simd_distance(points[i - 1].position, points[i].position)
        }
        return total
    }

    var heightDifference: Double? {
        guard let first = points.first, let last = points.last, points.count >= 2 else { return nil }
        return last.y - first.y
    }
}

// MARK: - Measure Capture (serialized result returned to JS)

struct MeasureCapture: Codable {
    var measurements: [MeasurementResult] = []
    var captureStartedAt: Date?
    var captureCompletedAt: Date?
    var location: GeoPoint?
    var count: Int { measurements.count }
}
