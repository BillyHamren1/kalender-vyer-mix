import SwiftUI
import SceneKit

#if canImport(ARKit)
import ARKit

/// SceneKit-based AR view that renders points/lines/labels for active measurements.
/// Ported from SiteScan ARMeasureView, trimmed for the EventFlow Time integration.
@MainActor
struct ARMeasureView: UIViewRepresentable {
    @ObservedObject var viewModel: MeasureViewModel
    let arSessionManager: ARSessionManager

    func makeUIView(context: Context) -> ARSCNView {
        let scnView = ARSCNView()
        scnView.autoenablesDefaultLighting = true
        scnView.automaticallyUpdatesLighting = true
        scnView.delegate = context.coordinator
        scnView.showsStatistics = false
        scnView.rendersContinuously = true
        scnView.session = arSessionManager.arSession

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        scnView.addGestureRecognizer(tap)

        let coaching = ARCoachingOverlayView()
        coaching.session = scnView.session
        coaching.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        coaching.goal = .horizontalPlane
        coaching.activatesAutomatically = true
        scnView.addSubview(coaching)

        context.coordinator.scnView = scnView
        return scnView
    }

    func updateUIView(_ scnView: ARSCNView, context: Context) {
        _ = arSessionManager.sessionVersion
        context.coordinator.updateVisuals()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel, arSessionManager: arSessionManager)
    }

    class Coordinator: NSObject, ARSCNViewDelegate {
        let viewModel: MeasureViewModel
        let arSessionManager: ARSessionManager
        weak var scnView: ARSCNView?

        private var pointNodes: [SCNNode] = []
        private var lineNodes: [SCNNode] = []
        private var labelNodes: [SCNNode] = []
        private var savedNodes: [SCNNode] = []

        private let activeLineColor: UIColor = .white
        private let activePointColor: UIColor = .white
        private let savedLineColor: UIColor = .systemYellow

        init(viewModel: MeasureViewModel, arSessionManager: ARSessionManager) {
            self.viewModel = viewModel
            self.arSessionManager = arSessionManager
            super.init()
            Task { @MainActor [weak self] in
                viewModel.placePointFromCenter = { self?.placePointAtCenter() }
            }
        }

        @MainActor
        func placePointAtCenter() {
            guard let scnView = scnView, viewModel.canPlacePoint else { return }
            if arSessionManager.trackingState == .notAvailable { return }
            let center = CGPoint(x: scnView.bounds.midX, y: scnView.bounds.midY)
            placePoint(at: center, in: scnView)
        }

        @MainActor
        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let scnView = scnView, viewModel.canPlacePoint else { return }
            if arSessionManager.trackingState == .notAvailable { return }
            let location = gesture.location(in: scnView)
            placePoint(at: location, in: scnView)
        }

        @MainActor
        private func placePoint(at location: CGPoint, in scnView: ARSCNView) {
            if let result = performRaycast(at: location, in: scnView) {
                let worldPos = result.worldTransform.columns.3
                let normal = extractNormal(from: result)
                let point = MeasurementPoint(
                    x: Double(worldPos.x), y: Double(worldPos.y), z: Double(worldPos.z),
                    confidence: confidenceFromResult(result),
                    normalX: normal?.x, normalY: normal?.y, normalZ: normal?.z,
                    capturedAt: Date()
                )
                let impact = UIImpactFeedbackGenerator(style: .rigid)
                impact.impactOccurred(intensity: CGFloat(confidenceFromResult(result)))
                viewModel.addRealPoint(point)
            } else {
                let notif = UINotificationFeedbackGenerator()
                notif.notificationOccurred(.warning)
            }
        }

        @MainActor
        private func performRaycast(at point: CGPoint, in scnView: ARSCNView) -> ARRaycastResult? {
            if let query = scnView.raycastQuery(from: point, allowing: .existingPlaneGeometry, alignment: .any),
               let best = scnView.session.raycast(query).first { return best }
            if let query = scnView.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .any),
               let best = scnView.session.raycast(query).first { return best }
            return nil
        }

        private func extractNormal(from result: ARRaycastResult) -> (x: Double, y: Double, z: Double)? {
            let col1 = result.worldTransform.columns.1
            return (Double(col1.x), Double(col1.y), Double(col1.z))
        }

        private func confidenceFromResult(_ result: ARRaycastResult) -> Double {
            switch result.target {
            case .existingPlaneGeometry: return 0.95
            case .existingPlaneInfinite: return 0.85
            case .estimatedPlane:        return 0.7
            @unknown default:            return 0.5
            }
        }

        @MainActor
        func updateVisuals() {
            guard let scnView = scnView else { return }
            (pointNodes + lineNodes + labelNodes + savedNodes).forEach { $0.removeFromParentNode() }
            pointNodes.removeAll(); lineNodes.removeAll(); labelNodes.removeAll(); savedNodes.removeAll()

            // Saved measurements (faded yellow)
            for measurement in viewModel.measurements {
                let pts = measurement.points
                for point in pts {
                    let node = createDotNode(at: pos(point), color: savedLineColor, opacity: 0.55, radius: 0.006)
                    scnView.scene.rootNode.addChildNode(node)
                    savedNodes.append(node)
                }
                for i in 1..<pts.count {
                    let from = pos(pts[i-1]), to = pos(pts[i])
                    let lineNode = createLineNode(from: from, to: to, color: savedLineColor.withAlphaComponent(0.55), radius: 0.003)
                    scnView.scene.rootNode.addChildNode(lineNode)
                    savedNodes.append(lineNode)
                    let label = createDistanceLabel(from: from, to: to)
                    scnView.scene.rootNode.addChildNode(label)
                    savedNodes.append(label)
                }
            }

            // Active points/lines (white)
            let points = viewModel.currentPoints
            for point in points {
                let node = createDotNode(at: pos(point), color: activePointColor, opacity: 1.0, radius: 0.008)
                scnView.scene.rootNode.addChildNode(node)
                pointNodes.append(node)
            }
            for i in 1..<points.count {
                let from = pos(points[i-1]), to = pos(points[i])
                let lineNode = createLineNode(from: from, to: to, color: activeLineColor, radius: 0.003)
                scnView.scene.rootNode.addChildNode(lineNode)
                lineNodes.append(lineNode)
                let label = createDistanceLabel(from: from, to: to, type: viewModel.measurementType)
                scnView.scene.rootNode.addChildNode(label)
                labelNodes.append(label)
            }
        }

        private func distanceScale(for position: SCNVector3) -> Float {
            guard let scnView = scnView else { return 1.0 }
            let pov: SCNNode? = MainActor.assumeIsolated { scnView.pointOfView }
            guard let pov else { return 1.0 }
            let camPos = pov.worldPosition
            let dx = position.x - camPos.x, dy = position.y - camPos.y, dz = position.z - camPos.z
            let dist = max(sqrt(dx*dx + dy*dy + dz*dz), 0.15)
            return Float(dist)
        }

        private func createDotNode(at position: SCNVector3, color: UIColor, opacity: CGFloat, radius: CGFloat) -> SCNNode {
            let container = SCNNode()
            container.position = position
            let s = CGFloat(distanceScale(for: position))
            let sphere = SCNSphere(radius: radius * s)
            sphere.firstMaterial?.diffuse.contents = color.withAlphaComponent(opacity)
            sphere.firstMaterial?.lightingModel = .constant
            sphere.segmentCount = 16
            container.addChildNode(SCNNode(geometry: sphere))
            let ring = SCNTorus(ringRadius: radius * 2.5 * s, pipeRadius: radius * 0.3 * s)
            ring.firstMaterial?.diffuse.contents = color.withAlphaComponent(opacity * 0.4)
            ring.firstMaterial?.lightingModel = .constant
            container.addChildNode(SCNNode(geometry: ring))
            return container
        }

        private func createLineNode(from: SCNVector3, to: SCNVector3, color: UIColor, radius: CGFloat = 0.003) -> SCNNode {
            let node = SCNNode()
            let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
            let dist = sqrt(dx*dx + dy*dy + dz*dz)
            guard dist > 0.0001 else { return node }
            let mid = SCNVector3((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
            let s = CGFloat(distanceScale(for: mid))
            let cylinder = SCNCylinder(radius: radius * s, height: CGFloat(dist))
            cylinder.firstMaterial?.diffuse.contents = color
            cylinder.firstMaterial?.lightingModel = .constant
            let cylNode = SCNNode(geometry: cylinder)
            cylNode.position = mid
            cylNode.look(at: to, up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 1, 0))
            node.addChildNode(cylNode)
            return node
        }

        private func createDistanceLabel(from: SCNVector3, to: SCNVector3, type: MeasurementType = .distance) -> SCNNode {
            let dx = Double(to.x - from.x), dy = Double(to.y - from.y), dz = Double(to.z - from.z)
            let value: Double
            switch type {
            case .verticalHeight: value = abs(dy)
            case .width:          value = sqrt(dx*dx + dz*dz)
            default:              value = sqrt(dx*dx + dy*dy + dz*dz)
            }
            let label = value < 1 ? String(format: "%.0f mm", value * 1000) : String(format: "%.3f m", value)
            return createTextLabel(
                at: SCNVector3((from.x + to.x) / 2, (from.y + to.y) / 2 + 0.025, (from.z + to.z) / 2),
                text: label
            )
        }

        private func createTextLabel(at position: SCNVector3, text: String) -> SCNNode {
            let scnText = SCNText(string: text, extrusionDepth: 0.1)
            scnText.font = UIFont.monospacedDigitSystemFont(ofSize: 10, weight: .semibold)
            scnText.firstMaterial?.diffuse.contents = UIColor.white
            scnText.firstMaterial?.lightingModel = .constant
            scnText.flatness = 0.1
            let s = distanceScale(for: position)
            let (tMin, tMax) = scnText.boundingBox
            let bgW = (tMax.x - tMin.x) + 3, bgH = (tMax.y - tMin.y) + 2
            let scale: Float = 0.004 * s
            let bg = SCNPlane(width: CGFloat(bgW * scale), height: CGFloat(bgH * scale))
            bg.firstMaterial?.diffuse.contents = UIColor.black.withAlphaComponent(0.75)
            bg.firstMaterial?.lightingModel = .constant
            bg.cornerRadius = CGFloat(bgH * scale * 0.4)
            let textNode = SCNNode(geometry: scnText)
            textNode.scale = SCNVector3(scale, scale, scale)
            textNode.pivot = SCNMatrix4MakeTranslation(
                (tMax.x - tMin.x) / 2 + tMin.x,
                (tMax.y - tMin.y) / 2 + tMin.y, 0
            )
            let container = SCNNode()
            container.position = position
            container.constraints = [SCNBillboardConstraint()]
            container.addChildNode(SCNNode(geometry: bg))
            container.addChildNode(textNode)
            return container
        }

        private func pos(_ p: MeasurementPoint) -> SCNVector3 {
            SCNVector3(Float(p.x), Float(p.y), Float(p.z))
        }
    }
}
#endif
