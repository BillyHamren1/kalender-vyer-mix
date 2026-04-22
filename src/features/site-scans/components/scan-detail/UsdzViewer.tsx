import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RoomModelViewerProps = {
  url: string;
  alt?: string;
  className?: string;
  height?: number;
};

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Re-center the object: translate all geometry so the model is at world origin
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.translate(-center.x, -center.y, -center.z);
    }
  });
  object.position.set(0, 0, 0);
  const target = new THREE.Vector3(0, 0, 0);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let distance = (maxDimension * 0.5) / Math.tan(fov * 0.5);
  distance *= 2.0;

  camera.position.set(
    distance * 0.7,
    distance * 0.5,
    distance * 0.7,
  );
  camera.near = Math.max(distance / 200, 0.001);
  camera.far = Math.max(distance * 200, 500);
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.update();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => {
        Object.values(mat).forEach((v) => {
          if (v && typeof v === "object" && "isTexture" in v) (v as THREE.Texture).dispose();
        });
        mat.dispose();
      });
    }
  });
}

export default function RoomModelViewer({
  url,
  alt,
  className,
  height = 400,
}: RoomModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setIsLoading(true);
    setError(null);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(2, 1.5, 2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.2;
    controls.maxDistance = 80;

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-4, 2, -5);
    scene.add(fillLight);

    container.appendChild(renderer.domElement);

    const updateSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    let isDisposed = false;
    let animationFrame = 0;
    let loadedModel: THREE.Object3D | null = null;

    // Default material for OBJ models that have no material
    const defaultMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const loader = new OBJLoader();
    loader.load(
      url,
      (obj) => {
        if (isDisposed) return;

        // Apply default material to meshes without proper materials
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            if (!mesh.material || (mesh.material as THREE.MeshBasicMaterial).type === "MeshPhongMaterial") {
              mesh.material = defaultMaterial;
            }
          }
        });

        loadedModel = obj;
        scene.add(obj);
        fitCameraToObject(camera, controls, obj);
        setIsLoading(false);
      },
      undefined,
      (loadError) => {
        if (isDisposed) return;
        console.error("Kunde inte ladda OBJ:", loadError);
        setError("Kunde inte rendera 3D-modellen.");
        setIsLoading(false);
      },
    );

    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      if (loadedModel) {
        scene.remove(loadedModel);
        disposeObject(loadedModel);
      }
      defaultMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-muted/20",
        className,
      )}
      style={{ height }}
      aria-label={alt ?? "3D-modell"}
    >
      <div ref={containerRef} className="h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar 3D-modell…
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-background/85 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
