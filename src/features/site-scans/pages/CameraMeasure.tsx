import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCcw, Camera as CameraIcon, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };

/**
 * CameraMeasure — live tap-to-measure tool (iPhone Measure-style).
 *
 * In iOS/Capacitor the camera must be started from a direct user gesture,
 * so the stream is activated from a button instead of useEffect.
 */
const CameraMeasure: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [pxPerCm, setPxPerCm] = useState<number>(() => {
    const stored = localStorage.getItem('cameraMeasure.pxPerCm');
    return stored ? parseFloat(stored) : 10;
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationCm, setCalibrationCm] = useState<string>('10');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStartingCamera(true);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraReady(false);
      setStartingCamera(false);
      setError('Kameran stöds inte i denna webbläsare.');
      return;
    }

    try {
      stopCamera();

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
    } catch (e: any) {
      setCameraReady(false);

      if (e?.name === 'NotAllowedError') {
        setError('Kameratillstånd nekades. Tillåt kameraåtkomst i inställningarna.');
      } else if (e?.name === 'NotFoundError') {
        setError('Ingen kamera hittades.');
      } else if (e?.name === 'NotReadableError') {
        setError('Kameran används av en annan app.');
      } else {
        setError(e?.message || 'Kunde inte starta kameran.');
      }
    } finally {
      setStartingCamera(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    localStorage.setItem('cameraMeasure.pxPerCm', String(pxPerCm));
  }, [pxPerCm]);

  const getRelativePoint = useCallback((clientX: number, clientY: number): Point | null => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const beginInteraction = useCallback((clientX: number, clientY: number, target: EventTarget | null) => {
    const targetElement = target instanceof HTMLElement ? target.closest('[data-point-idx]') as HTMLElement | null : null;
    const idxAttr = targetElement?.getAttribute('data-point-idx');

    if (idxAttr != null && !calibrating) {
      const idx = parseInt(idxAttr, 10);
      if (!Number.isNaN(idx)) {
        setDraggingIdx(idx);
        return;
      }
    }

    const point = getRelativePoint(clientX, clientY);
    if (!point) return;

    if (calibrating) {
      setCalibrationPoints((prev) => [...prev, point].slice(-2));
      return;
    }

    setPoints((prev) => [...prev, point]);
  }, [calibrating, getRelativePoint]);

  const moveInteraction = useCallback((clientX: number, clientY: number) => {
    if (draggingIdx === null) return;
    const point = getRelativePoint(clientX, clientY);
    if (!point) return;
    setPoints((prev) => prev.map((pt, i) => (i === draggingIdx ? point : pt)));
  }, [draggingIdx, getRelativePoint]);

  const endInteraction = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    beginInteraction(e.clientX, e.clientY, e.target);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    moveInteraction(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {}
    endInteraction();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!e.touches.length) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    beginInteraction(touch.clientX, touch.clientY, e.target);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!e.touches.length) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    moveInteraction(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    endInteraction();
  };

  const distancePx = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

  const formatDistance = (px: number) => {
    const cm = px / pxPerCm;
    if (cm >= 100) return `${(cm / 100).toFixed(2)} m`;
    return `${cm.toFixed(1)} cm`;
  };

  const totalPx = points.reduce((acc, point, i) => {
    if (i === 0) return 0;
    return acc + distancePx(points[i - 1], point);
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
  const undo = () => setPoints((prev) => prev.slice(0, -1));

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
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
            setCalibrating((current) => !current);
            setCalibrationPoints([]);
          }}
          className="text-white hover:bg-white/10 text-xs"
        >
          {calibrating ? 'Avbryt' : 'Kalibrera'}
        </Button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        <div
          ref={overlayRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="absolute inset-0 touch-none select-none"
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {(calibrating ? calibrationPoints : points).map((point, i, arr) => {
              if (i === 0) return null;
              const prev = arr[i - 1];
              return (
                <line
                  key={`l-${i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={calibrating ? '#fbbf24' : '#22d3ee'}
                  strokeWidth={2}
                  strokeDasharray={calibrating ? '6 4' : undefined}
                />
              );
            })}
            {!calibrating &&
              points.map((point, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                const mx = (prev.x + point.x) / 2;
                const my = (prev.y + point.y) / 2;
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
                      {formatDistance(distancePx(prev, point))}
                    </text>
                  </g>
                );
              })}
          </svg>

          {(calibrating ? calibrationPoints : points).map((point, i) => (
            <div
              key={`p-${i}`}
              data-point-idx={calibrating ? undefined : i}
              className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white bg-cyan-400/80 shadow-lg pointer-events-auto touch-none"
              style={{ left: point.x, top: point.y }}
            />
          ))}

          {!calibrating && points.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full border-2 border-white/70" />
              <div className="absolute w-px h-6 bg-white/70" />
              <div className="absolute h-px w-6 bg-white/70" />
            </div>
          )}
        </div>

        {!cameraReady && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 px-4">
            <Button
              onClick={startCamera}
              disabled={startingCamera}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold gap-2 shadow-lg"
            >
              <CameraIcon className="h-4 w-4" />
              {startingCamera ? 'Startar kamera…' : 'Starta kamera'}
            </Button>
            {error && (
              <p className="max-w-xs text-center text-xs text-white/80 bg-black/60 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

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
                  const el = overlayRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  setPoints((prev) => [...prev, { x: rect.width / 2, y: rect.height / 2 }]);
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
