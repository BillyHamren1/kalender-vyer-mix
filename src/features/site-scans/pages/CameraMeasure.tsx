import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCcw, Camera as CameraIcon, Ruler, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };
type CameraState = 'idle' | 'starting' | 'ready' | 'denied' | 'error';

const STORAGE_KEY_POINTS = 'cameraMeasure.points.v2';
const STORAGE_KEY_SCALE = 'cameraMeasure.pxPerCm';
const HIT_RADIUS = 32; // generous touch target in px (visual is 36, hit is 64 diameter)

/**
 * CameraMeasure — robust mobile-first measure tool for EventFlow Time.
 *
 * Design notes:
 * - Single unified pointer pipeline (Pointer Events API). Touch is handled by the
 *   browser's pointer abstraction; we never mix raw TouchEvents with PointerEvents.
 * - Hit testing is geometric (distance to point) rather than DOM-based, so a finger
 *   that lands slightly off a point still grabs it.
 * - Newly created point becomes the active drag target immediately.
 * - Points persist to localStorage so a transient remount doesn't wipe work.
 * - Camera is started by an explicit user gesture (iOS/Capacitor requirement) and
 *   has explicit lifecycle states with retry.
 * - Calibration overlays the normal points (dimmed) instead of replacing them, so
 *   work is never visually "lost".
 */
const CameraMeasure: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const draggingRef = useRef<number | null>(null);
  const draggingCalibRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [points, setPoints] = useState<Point[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POINTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [pxPerCm, setPxPerCm] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_SCALE);
    const n = stored ? parseFloat(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 10;
  });

  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationCm, setCalibrationCm] = useState<string>('10');
  const [showPoints, setShowPoints] = useState(true);

  // Persist points
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(points));
    } catch {}
  }, [points]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SCALE, String(pxPerCm));
    } catch {}
  }, [pxPerCm]);

  // ---- Camera lifecycle -----------------------------------------------------

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    }
    streamRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraState('starting');
    setErrorMsg(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setErrorMsg('Kameran stöds inte i denna webbläsare.');
      return;
    }

    // Always release previous stream first
    stopCamera();

    const tryConstraints = async (constraints: MediaStreamConstraints) => {
      return navigator.mediaDevices.getUserMedia(constraints);
    };

    try {
      let stream: MediaStream;
      try {
        stream = await tryConstraints({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (firstErr: any) {
        // Fallback: some devices reject the ideal facingMode hint
        if (firstErr?.name === 'OverconstrainedError' || firstErr?.name === 'NotFoundError') {
          stream = await tryConstraints({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }

      streamRef.current = stream;

      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        v.muted = true;
        try {
          await v.play();
        } catch {
          // Some browsers reject play() if not in a gesture; the user already
          // tapped "Starta kamera" so this is normally fine. Ignore.
        }
      }

      setCameraState('ready');
    } catch (e: any) {
      const name = e?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraState('denied');
        setErrorMsg('Kameratillstånd nekades. Tillåt kameraåtkomst i enhetens inställningar.');
      } else if (name === 'NotFoundError') {
        setCameraState('error');
        setErrorMsg('Ingen kamera hittades på denna enhet.');
      } else if (name === 'NotReadableError') {
        setCameraState('error');
        setErrorMsg('Kameran används redan av en annan app. Stäng den och försök igen.');
      } else {
        setCameraState('error');
        setErrorMsg(e?.message || 'Kunde inte starta kameran. Försök igen.');
      }
    }
  }, [stopCamera]);

  // Pause/resume handling (iOS often suspends the stream when app goes background)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && cameraState === 'ready') {
        const v = videoRef.current;
        if (v && v.paused) {
          v.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cameraState]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Geometry helpers -----------------------------------------------------

  const getRelativePoint = useCallback((clientX: number, clientY: number): Point | null => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const findPointIndexNear = useCallback((p: Point, list: Point[]): number => {
    let bestIdx = -1;
    let bestDist = HIT_RADIUS;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(list[i].x - p.x, list[i].y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, []);

  // ---- Unified pointer pipeline --------------------------------------------

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only honor primary contact (ignore second finger / right click)
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (activePointerIdRef.current !== null) return; // already tracking a contact

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    e.preventDefault();
    activePointerIdRef.current = e.pointerId;

    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}

    if (calibrating) {
      const hitCalib = findPointIndexNear(p, calibrationPoints);
      if (hitCalib !== -1) {
        draggingCalibRef.current = hitCalib;
        return;
      }
      // Add or replace calibration point (max 2)
      setCalibrationPoints((prev) => {
        const next = prev.length >= 2 ? [prev[1], p] : [...prev, p];
        draggingCalibRef.current = next.length - 1;
        return next;
      });
      return;
    }

    // Normal mode: hit-test existing points first
    const hit = findPointIndexNear(p, points);
    if (hit !== -1) {
      draggingRef.current = hit;
      return;
    }

    // Otherwise create a new point AND make it the active drag target
    setPoints((prev) => {
      const next = [...prev, p];
      draggingRef.current = next.length - 1;
      return next;
    });
  }, [calibrating, calibrationPoints, points, getRelativePoint, findPointIndexNear]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const dragIdx = draggingRef.current;
    const dragCalibIdx = draggingCalibRef.current;
    if (dragIdx === null && dragCalibIdx === null) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();

    if (dragCalibIdx !== null) {
      setCalibrationPoints((prev) => prev.map((pt, i) => (i === dragCalibIdx ? p : pt)));
    } else if (dragIdx !== null) {
      setPoints((prev) => prev.map((pt, i) => (i === dragIdx ? p : pt)));
    }
  }, [getRelativePoint]);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
    activePointerIdRef.current = null;
    draggingRef.current = null;
    draggingCalibRef.current = null;
  }, []);

  // ---- Math -----------------------------------------------------------------

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

  // ---- Calibration ----------------------------------------------------------

  const handleApplyCalibration = () => {
    if (calibrationPoints.length !== 2) return;
    const px = distancePx(calibrationPoints[0], calibrationPoints[1]);
    const cm = parseFloat(calibrationCm);
    if (!cm || cm <= 0 || px <= 0) return;
    setPxPerCm(px / cm);
    setCalibrating(false);
    setCalibrationPoints([]);
  };

  const toggleCalibrating = () => {
    setCalibrating((current) => {
      const next = !current;
      if (!next) setCalibrationPoints([]);
      return next;
    });
  };

  // ---- Actions --------------------------------------------------------------

  const reset = () => {
    setPoints([]);
    draggingRef.current = null;
  };
  const undo = () => setPoints((prev) => prev.slice(0, -1));
  const addCenterPoint = () => {
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPoints((prev) => [...prev, { x: rect.width / 2, y: rect.height / 2 }]);
  };

  // ---- Render ---------------------------------------------------------------

  const cameraReady = cameraState === 'ready';
  const renderPoints = calibrating ? calibrationPoints : points;
  const renderColor = calibrating ? '#fbbf24' : '#22d3ee';

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
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
          {calibrating ? 'Kalibrering' : 'Mätning'}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPoints((v) => !v)}
            className="text-white hover:bg-white/10 px-2"
            aria-label={showPoints ? 'Dölj punkter' : 'Visa punkter'}
          >
            {showPoints ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCalibrating}
            className="text-white hover:bg-white/10 text-xs"
          >
            {calibrating ? 'Avbryt' : 'Kalibrera'}
          </Button>
        </div>
      </div>

      {/* Camera + overlay */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        <div
          ref={overlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          className="absolute inset-0 touch-none select-none"
          style={{ touchAction: 'none' }}
        >
          {/* Lines + labels */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Dimmed background lines (real points) when calibrating */}
            {calibrating && showPoints && points.map((point, i) => {
              if (i === 0) return null;
              const prev = points[i - 1];
              return (
                <line
                  key={`bg-${i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={point.x}
                  y2={point.y}
                  stroke="#22d3ee"
                  strokeOpacity={0.25}
                  strokeWidth={2}
                />
              );
            })}

            {showPoints && renderPoints.map((point, i, arr) => {
              if (i === 0) return null;
              const prev = arr[i - 1];
              return (
                <line
                  key={`l-${i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={renderColor}
                  strokeWidth={2.5}
                  strokeDasharray={calibrating ? '6 4' : undefined}
                />
              );
            })}

            {!calibrating && showPoints &&
              points.map((point, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                const mx = (prev.x + point.x) / 2;
                const my = (prev.y + point.y) / 2;
                return (
                  <g key={`lbl-${i}`}>
                    <rect
                      x={mx - 36}
                      y={my - 14}
                      width={72}
                      height={22}
                      rx={6}
                      fill="rgba(0,0,0,0.75)"
                    />
                    <text
                      x={mx}
                      y={my + 3}
                      textAnchor="middle"
                      fill="white"
                      fontSize={13}
                      fontWeight={600}
                    >
                      {formatDistance(distancePx(prev, point))}
                    </text>
                  </g>
                );
              })}
          </svg>

          {/* Dimmed background point markers (real points) when calibrating */}
          {calibrating && showPoints && points.map((point, i) => (
            <div
              key={`bgp-${i}`}
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-white/40 bg-cyan-400/30 pointer-events-none"
              style={{ left: point.x, top: point.y }}
            />
          ))}

          {/* Active points */}
          {showPoints && renderPoints.map((point, i) => (
            <div
              key={`p-${i}`}
              className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full border-2 border-white shadow-lg pointer-events-none"
              style={{
                left: point.x,
                top: point.y,
                background: calibrating ? 'rgba(251,191,36,0.85)' : 'rgba(34,211,238,0.85)',
              }}
            />
          ))}

          {/* Crosshair when no points yet */}
          {!calibrating && points.length === 0 && cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full border-2 border-white/70" />
              <div className="absolute w-px h-8 bg-white/70" />
              <div className="absolute h-px w-8 bg-white/70" />
            </div>
          )}
        </div>

        {/* Camera state overlay (non-blocking for measurement) */}
        {!cameraReady && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3 px-4 pointer-events-none">
            <div className="pointer-events-auto">
              <Button
                onClick={startCamera}
                disabled={cameraState === 'starting'}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold gap-2 shadow-lg"
              >
                <CameraIcon className="h-4 w-4" />
                {cameraState === 'starting'
                  ? 'Startar kamera…'
                  : cameraState === 'denied'
                  ? 'Försök igen'
                  : cameraState === 'error'
                  ? 'Försök igen'
                  : 'Starta kamera'}
              </Button>
            </div>
            {errorMsg && (
              <p className="max-w-xs text-center text-xs text-white/85 bg-black/70 px-3 py-2 rounded-md pointer-events-none">
                {errorMsg}
              </p>
            )}
            <p className="text-[11px] text-white/60 text-center max-w-xs pointer-events-none">
              Du kan mäta även utan kamera — placera punkter på den svarta bakgrunden.
            </p>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="relative z-20 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-6 px-4 space-y-3">
        {calibrating ? (
          <div className="space-y-2">
            <div className="text-xs text-amber-300 text-center font-medium">
              Kalibrering aktiv — sätt två punkter på ett känt avstånd.
            </div>
            <div className="text-[11px] text-white/60 text-center">
              Dina vanliga mätpunkter är kvar och visas dimmat i bakgrunden.
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
                className="bg-amber-400 hover:bg-amber-300 text-black font-semibold"
              >
                Använd
              </Button>
            </div>
            <div className="text-[10px] text-white/50 text-center">
              Punkter: {calibrationPoints.length}/2 · Aktuell skala: {pxPerCm.toFixed(2)} px/cm
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
                className="flex-1 text-white hover:bg-white/10 border border-white/20 h-11"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Ångra
              </Button>
              <Button
                variant="ghost"
                onClick={reset}
                disabled={points.length === 0}
                className="flex-1 text-white hover:bg-white/10 border border-white/20 h-11"
              >
                Nollställ
              </Button>
              <Button
                onClick={addCenterPoint}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-11"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Punkt
              </Button>
            </div>
            <div className="text-[10px] text-white/50 text-center">
              Tryck för att sätta punkt · Dra för att flytta · Skala: {pxPerCm.toFixed(1)} px/cm · {points.length} punkter
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraMeasure;
