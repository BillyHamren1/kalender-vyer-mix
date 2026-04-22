import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCcw, Camera as CameraIcon, AlertTriangle, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };

/**
 * CameraMeasure — live tap-to-measure tool (iPhone Measure-style).
 *
 * Opens the device camera as a live background and lets the user tap to drop
 * points on a flat surface (ground or wall). The distance between consecutive
 * points is computed using a calibrated reference scale.
 *
 * NOTE: True AR depth requires native ARKit/ARCore. In the web/Capacitor
 * WebView we use a calibrated reference scale (px/cm) the user sets once.
 */
const CameraMeasure: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [pxPerCm, setPxPerCm] = useState<number>(() => {
    const stored = localStorage.getItem('cameraMeasure.pxPerCm');
    return stored ? parseFloat(stored) : 10; // default 10 px/cm
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationCm, setCalibrationCm] = useState<string>('10');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [needsManualStart, setNeedsManualStart] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNeedsManualStart(false);
        // Don't block measuring — just note camera unavailable
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
      setNeedsManualStart(false);
      setError(null);
    } catch (e: any) {
      setNeedsManualStart(true);
      setError(e?.message || 'Tryck på "Aktivera kamera" för att tillåta åtkomst.');
    }
  }, []);

  // Try auto-start; if it fails, user can tap to enable
  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  useEffect(() => {
    localStorage.setItem('cameraMeasure.pxPerCm', String(pxPerCm));
  }, [pxPerCm]);

  const getRelativePoint = useCallback((clientX: number, clientY: number): Point | null => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const idxAttr = target?.getAttribute?.('data-point-idx');
    if (idxAttr != null && !calibrating) {
      const idx = parseInt(idxAttr, 10);
      if (!Number.isNaN(idx)) {
        setDraggingIdx(idx);
        try {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        } catch {}
        return;
      }
    }
    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;
    if (calibrating) {
      setCalibrationPoints((prev) => [...prev, p].slice(-2));
      return;
    }
    setPoints((prev) => [...prev, p]);
  };

  const distancePx = (a: Point, b: Point) =>
    Math.hypot(b.x - a.x, b.y - a.y);

  const formatDistance = (px: number) => {
    const cm = px / pxPerCm;
    if (cm >= 100) return `${(cm / 100).toFixed(2)} m`;
    return `${cm.toFixed(1)} cm`;
  };

  const totalPx = points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    return acc + distancePx(points[i - 1], p);
  }, 0);

  const handleApplyCalibration = () => {
    if (calibrationPoints.length !== 2) return;
    const px = distancePx(calibrationPoints[0], calibrationPoints[1]);
    const cm = parseFloat(calibrationCm);
    if (!cm || cm <= 0 || px <= 0) return;
    setPxPerCm(px / cm);
    setCalibrating(false);
    setCalibrationPoints([]);
  };

  const reset = () => setPoints([]);
  const undo = () => setPoints((p) => p.slice(0, -1));

  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null) return;
    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;
    setPoints((prev) => prev.map((pt, i) => (i === draggingIdx ? p : pt)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (draggingIdx !== null) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {}
      setDraggingIdx(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/m/tools')}
          className="text-white hover:bg-white/10 gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Ruler className="h-4 w-4" />
          Mätning
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCalibrating((c) => !c);
            setCalibrationPoints([]);
          }}
          className="text-white hover:bg-white/10 text-xs"
        >
          {calibrating ? 'Avbryt' : 'Kalibrera'}
        </Button>
      </div>

      {/* Camera */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Overlay for taps + SVG lines */}
        <div
          ref={overlayRef}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 touch-none select-none"
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {(calibrating ? calibrationPoints : points).map((p, i, arr) => {
              if (i === 0) return null;
              const prev = arr[i - 1];
              return (
                <line
                  key={`l-${i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={calibrating ? '#fbbf24' : '#22d3ee'}
                  strokeWidth={2}
                  strokeDasharray={calibrating ? '6 4' : undefined}
                />
              );
            })}
            {!calibrating &&
              points.map((p, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                const mx = (prev.x + p.x) / 2;
                const my = (prev.y + p.y) / 2;
                return (
                  <g key={`lbl-${i}`}>
                    <rect
                      x={mx - 32}
                      y={my - 12}
                      width={64}
                      height={20}
                      rx={6}
                      fill="rgba(0,0,0,0.7)"
                    />
                    <text
                      x={mx}
                      y={my + 3}
                      textAnchor="middle"
                      fill="white"
                      fontSize={12}
                      fontWeight={600}
                    >
                      {formatDistance(distancePx(prev, p))}
                    </text>
                  </g>
                );
              })}
          </svg>

          {(calibrating ? calibrationPoints : points).map((p, i) => (
            <div
              key={`p-${i}`}
              data-point-idx={calibrating ? undefined : i}
              className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white bg-cyan-400/80 shadow-lg pointer-events-auto touch-none"
              style={{ left: p.x, top: p.y }}
            />
          ))}

          {/* Center crosshair when no points */}
          {!calibrating && points.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full border-2 border-white/70" />
              <div className="absolute w-px h-6 bg-white/70" />
              <div className="absolute h-px w-6 bg-white/70" />
            </div>
          )}
        </div>

        {/* Camera unsupported / error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/80 z-30">
            <div className="max-w-sm text-center space-y-3">
              <AlertTriangle className="h-10 w-10 mx-auto text-amber-400" />
              <h2 className="text-lg font-semibold">Kameran är inte tillgänglig</h2>
              <p className="text-sm text-white/70">{error}</p>
              <p className="text-xs text-white/50">
                Mätverktyget kräver kameraåtkomst. Tillåt kamera i webbläsarinställningarna eller
                öppna appen på en mobil enhet.
              </p>
              <Button variant="secondary" onClick={() => navigate('/m/tools')}>
                Tillbaka
              </Button>
            </div>
          </div>
        )}

        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="text-center space-y-2">
              <CameraIcon className="h-8 w-8 mx-auto animate-pulse" />
              <p className="text-sm text-white/70">Startar kameran…</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="relative z-20 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-6 px-4 space-y-3">
        {calibrating ? (
          <div className="space-y-2">
            <div className="text-xs text-white/70 text-center">
              Kalibrering: tryck på två punkter med känt avstånd, ange avståndet i cm.
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={calibrationCm}
                onChange={(e) => setCalibrationCm(e.target.value)}
                placeholder="cm"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              />
              <Button
                onClick={handleApplyCalibration}
                disabled={calibrationPoints.length !== 2}
                className="bg-cyan-500 hover:bg-cyan-400 text-black"
              >
                Använd
              </Button>
            </div>
            <div className="text-[10px] text-white/50 text-center">
              Punkter satta: {calibrationPoints.length}/2 · Aktuell skala: {pxPerCm.toFixed(2)} px/cm
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-white/60 uppercase tracking-wider">Totalt avstånd</span>
              <span className="text-3xl font-bold tabular-nums">
                {points.length >= 2 ? formatDistance(totalPx) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={undo}
                disabled={points.length === 0}
                className="flex-1 text-white hover:bg-white/10 border border-white/20"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Ångra
              </Button>
              <Button
                variant="ghost"
                onClick={reset}
                disabled={points.length === 0}
                className="flex-1 text-white hover:bg-white/10 border border-white/20"
              >
                Nollställ
              </Button>
              <Button
                onClick={() => {
                  // Drop a point at center as a hint when user prefers button to tap
                  const el = overlayRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  setPoints((prev) => [...prev, { x: r.width / 2, y: r.height / 2 }]);
                }}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Punkt
              </Button>
            </div>
            <div className="text-[10px] text-white/40 text-center">
              Tryck på bilden för att sätta punkter · Dra punkter för att justera · Skala: {pxPerCm.toFixed(1)} px/cm
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraMeasure;
