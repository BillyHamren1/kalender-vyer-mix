import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  RotateCcw,
  Camera as CameraIcon,
  Ruler,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };
type CameraState = 'idle' | 'starting' | 'ready' | 'denied' | 'error';
type InteractionState =
  | { kind: 'move-point'; index: number; start: Point; moved: boolean }
  | { kind: 'create-point'; start: Point; index: number | null; moved: boolean }
  | { kind: 'move-calibration'; index: number; start: Point; moved: boolean }
  | { kind: 'create-calibration'; start: Point; index: number | null; moved: boolean }
  | null;

const STORAGE_KEY_POINTS = 'cameraMeasure.points.v3';
const STORAGE_KEY_SCALE = 'cameraMeasure.pxPerCm.v2';
const STORAGE_KEY_SNAPSHOT = 'cameraMeasure.snapshot.v1';
const HIT_RADIUS = 34;
const DRAG_THRESHOLD = 12;

const isNormalizedPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Point;
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const CameraMeasure: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const interactionRef = useRef<InteractionState>(null);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POINTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isNormalizedPoint) : [];
    } catch {
      return [];
    }
  });
  const [pxPerCm, setPxPerCm] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_SCALE);
    const n = stored ? parseFloat(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 10;
  });
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_SNAPSHOT);
    } catch {
      return null;
    }
  });

  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationCm, setCalibrationCm] = useState<string>('10');
  const [showPoints, setShowPoints] = useState(true);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [activeCalibrationPointIndex, setActiveCalibrationPointIndex] = useState<number | null>(null);

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

  useEffect(() => {
    try {
      if (snapshotUrl) {
        sessionStorage.setItem(STORAGE_KEY_SNAPSHOT, snapshotUrl);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_SNAPSHOT);
      }
    } catch {}
  }, [snapshotUrl]);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }

    streamRef.current = null;

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {}
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

    stopCamera();

    const tryConstraints = async (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints);

    try {
      let stream: MediaStream;

      try {
        stream = await tryConstraints({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (firstError: any) {
        if (firstError?.name === 'OverconstrainedError' || firstError?.name === 'NotFoundError') {
          stream = await tryConstraints({ video: true, audio: false });
        } else {
          throw firstError;
        }
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play().catch(() => undefined);
      }

      setCameraState('ready');
    } catch (error: any) {
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        setCameraState('denied');
        setErrorMsg('Kameratillstånd nekades. Tillåt kameraåtkomst i enhetens inställningar och försök igen.');
      } else if (error?.name === 'NotFoundError') {
        setCameraState('error');
        setErrorMsg('Ingen kamera hittades på denna enhet.');
      } else if (error?.name === 'NotReadableError') {
        setCameraState('error');
        setErrorMsg('Kameran används redan av en annan app. Stäng den och försök igen.');
      } else {
        setCameraState('error');
        setErrorMsg(error?.message || 'Kunde inte starta kameran. Försök igen.');
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (snapshotUrl) return;

      const video = videoRef.current;
      if (cameraState === 'ready' && video?.paused) {
        video.play().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cameraState, snapshotUrl]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const getOverlayRect = useCallback(() => overlayRef.current?.getBoundingClientRect() ?? null, []);

  const getRelativePoint = useCallback((clientX: number, clientY: number): Point | null => {
    const rect = getOverlayRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }, [getOverlayRect]);

  const getPointDistancePx = useCallback((a: Point, b: Point) => {
    const rect = getOverlayRect();
    if (!rect) return 0;
    return Math.hypot((b.x - a.x) * rect.width, (b.y - a.y) * rect.height);
  }, [getOverlayRect]);

  const findPointIndexNear = useCallback((candidate: Point, list: Point[]) => {
    let bestIndex = -1;
    let bestDistance = HIT_RADIUS;

    for (let i = 0; i < list.length; i += 1) {
      const distance = getPointDistancePx(candidate, list[i]);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return bestIndex;
  }, [getPointDistancePx]);

  const updatePointAt = useCallback((index: number, point: Point) => {
    setPoints((prev) => prev.map((existing, i) => (i === index ? point : existing)));
  }, []);

  const updateCalibrationPointAt = useCallback((index: number, point: Point) => {
    setCalibrationPoints((prev) => prev.map((existing, i) => (i === index ? point : existing)));
  }, []);

  const appendPoint = useCallback((point: Point) => {
    let newIndex = -1;
    setPoints((prev) => {
      newIndex = prev.length;
      return [...prev, point];
    });
    setActivePointIndex(newIndex);
    return newIndex;
  }, []);

  const appendCalibrationPoint = useCallback((point: Point) => {
    let newIndex = -1;
    setCalibrationPoints((prev) => {
      const next = prev.length >= 2 ? [prev[1], point] : [...prev, point];
      newIndex = next.length - 1;
      return next;
    });
    setActiveCalibrationPointIndex(newIndex);
    return newIndex;
  }, []);

  const endInteraction = useCallback((pointerId: number | null, currentTarget?: EventTarget | null) => {
    if (pointerId !== null && currentTarget instanceof Element) {
      try {
        currentTarget.releasePointerCapture(pointerId);
      } catch {}
    }

    activePointerIdRef.current = null;
    interactionRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!snapshotUrl) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activePointerIdRef.current !== null) return;

    const point = getRelativePoint(e.clientX, e.clientY);
    if (!point) return;

    e.preventDefault();
    activePointerIdRef.current = e.pointerId;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    if (calibrating) {
      const hitIndex = findPointIndexNear(point, calibrationPoints);
      if (hitIndex !== -1) {
        setActiveCalibrationPointIndex(hitIndex);
        interactionRef.current = { kind: 'move-calibration', index: hitIndex, start: point, moved: false };
        return;
      }

      interactionRef.current = { kind: 'create-calibration', start: point, index: null, moved: false };
      setActiveCalibrationPointIndex(null);
      return;
    }

    const hitIndex = findPointIndexNear(point, points);
    if (hitIndex !== -1) {
      setActivePointIndex(hitIndex);
      interactionRef.current = { kind: 'move-point', index: hitIndex, start: point, moved: false };
      return;
    }

    interactionRef.current = { kind: 'create-point', start: point, index: null, moved: false };
    setActivePointIndex(null);
  }, [snapshotUrl, getRelativePoint, calibrating, findPointIndexNear, calibrationPoints, points]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const interaction = interactionRef.current;
    if (!interaction) return;

    const point = getRelativePoint(e.clientX, e.clientY);
    if (!point) return;

    e.preventDefault();

    const movedEnough = getPointDistancePx(interaction.start, point) >= DRAG_THRESHOLD;

    if (interaction.kind === 'move-point') {
      if (!interaction.moved && !movedEnough) return;
      interaction.moved = true;
      updatePointAt(interaction.index, point);
      return;
    }

    if (interaction.kind === 'move-calibration') {
      if (!interaction.moved && !movedEnough) return;
      interaction.moved = true;
      updateCalibrationPointAt(interaction.index, point);
      return;
    }

    if (interaction.kind === 'create-point') {
      if (!interaction.moved && !movedEnough) return;
      interaction.moved = true;

      if (interaction.index === null) {
        interaction.index = appendPoint(point);
      } else {
        updatePointAt(interaction.index, point);
      }
      return;
    }

    if (!interaction.moved && !movedEnough) return;
    interaction.moved = true;

    if (interaction.index === null) {
      interaction.index = appendCalibrationPoint(point);
    } else {
      updateCalibrationPointAt(interaction.index, point);
    }
  }, [getRelativePoint, getPointDistancePx, updatePointAt, updateCalibrationPointAt, appendPoint, appendCalibrationPoint]);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const interaction = interactionRef.current;
    const point = getRelativePoint(e.clientX, e.clientY) ?? interaction?.start ?? null;

    if (interaction && point) {
      if (interaction.kind === 'create-point' && interaction.index === null) {
        appendPoint(point);
      } else if (interaction.kind === 'create-calibration' && interaction.index === null) {
        appendCalibrationPoint(point);
      } else if (interaction.kind === 'move-point') {
        setActivePointIndex(interaction.index);
      } else if (interaction.kind === 'move-calibration') {
        setActiveCalibrationPointIndex(interaction.index);
      }
    }

    endInteraction(e.pointerId, e.currentTarget);
  }, [appendPoint, appendCalibrationPoint, endInteraction, getRelativePoint]);

  const distancePx = useCallback((a: Point, b: Point) => getPointDistancePx(a, b), [getPointDistancePx]);

  const formatDistance = useCallback((px: number) => {
    const cm = px / pxPerCm;
    if (cm >= 100) return `${(cm / 100).toFixed(2)} m`;
    return `${cm.toFixed(1)} cm`;
  }, [pxPerCm]);

  const totalPx = points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + distancePx(points[index - 1], point);
  }, 0);

  const handleApplyCalibration = () => {
    if (calibrationPoints.length !== 2) return;
    const px = distancePx(calibrationPoints[0], calibrationPoints[1]);
    const cm = parseFloat(calibrationCm);
    if (!cm || cm <= 0 || px <= 0) return;

    setPxPerCm(px / cm);
    setCalibrating(false);
    setCalibrationPoints([]);
    setActiveCalibrationPointIndex(null);
  };

  const toggleCalibrating = () => {
    setCalibrating((current) => {
      const next = !current;
      if (!next) {
        setCalibrationPoints([]);
        setActiveCalibrationPointIndex(null);
      }
      return next;
    });
  };

  const resetMeasurement = () => {
    setPoints([]);
    setCalibrationPoints([]);
    setActivePointIndex(null);
    setActiveCalibrationPointIndex(null);
    interactionRef.current = null;
  };

  const undo = () => {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      setActivePointIndex(next.length ? next.length - 1 : null);
      return next;
    });
  };

  const addCenterPoint = () => {
    if (!snapshotUrl) return;
    appendPoint({ x: 0.5, y: 0.5 });
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMsg('Kunde inte frysa bilden ännu. Vänta tills kameran är igång och försök igen.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Kunde inte skapa rityta för kamerabilden.');

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const nextSnapshot = canvas.toDataURL('image/jpeg', 0.88);
      setSnapshotUrl(nextSnapshot);
      setErrorMsg(null);
      setCalibrating(false);
      setCalibrationPoints([]);
      setActiveCalibrationPointIndex(null);
      endInteraction(activePointerIdRef.current);
      stopCamera();
      setCameraState('idle');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Kunde inte frysa bilden. Försök igen.');
    }
  };

  const retake = async () => {
    endInteraction(activePointerIdRef.current);
    setSnapshotUrl(null);
    resetMeasurement();
    await startCamera();
  };

  const cameraReady = cameraState === 'ready';
  const measuringOnFrozenImage = !!snapshotUrl;
  const renderPoints = calibrating ? calibrationPoints : points;
  const renderColor = calibrating ? '#fbbf24' : '#22d3ee';

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
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

        <div className="flex flex-col items-center text-sm font-medium leading-tight">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            {calibrating ? 'Kalibrering' : 'Mätning'}
          </div>
          <span className="text-[11px] text-white/60 font-normal">
            {measuringOnFrozenImage ? 'Fryst bild' : 'Livekamera'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPoints((value) => !value)}
            className="text-white hover:bg-white/10 px-2"
            aria-label={showPoints ? 'Dölj punkter' : 'Visa punkter'}
          >
            {showPoints ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCalibrating}
            disabled={!measuringOnFrozenImage}
            className="text-white hover:bg-white/10 text-xs disabled:opacity-40"
          >
            {calibrating ? 'Avbryt' : 'Kalibrera'}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {!measuringOnFrozenImage && (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
        )}

        {snapshotUrl && (
          <img
            src={snapshotUrl}
            alt="Fryst kamerabild för mätning"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        <div
          ref={overlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="absolute inset-0 touch-none select-none"
          style={{ touchAction: 'none' }}
        >
          {cameraReady && !measuringOnFrozenImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full border-2 border-white/75" />
              <div className="absolute w-px h-10 bg-white/75" />
              <div className="absolute h-px w-10 bg-white/75" />
            </div>
          )}

          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {calibrating && showPoints && points.map((point, index) => {
              if (index === 0) return null;
              const previous = points[index - 1];
              return (
                <line
                  key={`bg-${index}`}
                  x1={`${previous.x * 100}%`}
                  y1={`${previous.y * 100}%`}
                  x2={`${point.x * 100}%`}
                  y2={`${point.y * 100}%`}
                  stroke="#22d3ee"
                  strokeOpacity={0.25}
                  strokeWidth={2}
                />
              );
            })}

            {showPoints && renderPoints.map((point, index, list) => {
              if (index === 0) return null;
              const previous = list[index - 1];
              return (
                <line
                  key={`line-${index}`}
                  x1={`${previous.x * 100}%`}
                  y1={`${previous.y * 100}%`}
                  x2={`${point.x * 100}%`}
                  y2={`${point.y * 100}%`}
                  stroke={renderColor}
                  strokeWidth={2.5}
                  strokeDasharray={calibrating ? '6 4' : undefined}
                />
              );
            })}

            {!calibrating && showPoints && points.map((point, index) => {
              if (index === 0) return null;
              const previous = points[index - 1];
              const mx = ((previous.x + point.x) / 2) * 100;
              const my = ((previous.y + point.y) / 2) * 100;
              return (
                <g key={`label-${index}`}>
                  <rect
                    x={`calc(${mx}% - 36px)`}
                    y={`calc(${my}% - 14px)`}
                    width={72}
                    height={22}
                    rx={6}
                    fill="rgba(0,0,0,0.75)"
                  />
                  <text
                    x={`${mx}%`}
                    y={`calc(${my}% + 3px)`}
                    textAnchor="middle"
                    fill="white"
                    fontSize={13}
                    fontWeight={600}
                  >
                    {formatDistance(distancePx(previous, point))}
                  </text>
                </g>
              );
            })}
          </svg>

          {calibrating && showPoints && points.map((point, index) => (
            <div
              key={`bg-point-${index}`}
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-white/40 bg-cyan-400/30 pointer-events-none"
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            />
          ))}

          {showPoints && renderPoints.map((point, index) => {
            const isActive = calibrating ? activeCalibrationPointIndex === index : activePointIndex === index;
            return (
              <div
                key={`point-${index}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg pointer-events-none"
                style={{
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                  width: isActive ? 44 : 36,
                  height: isActive ? 44 : 36,
                  background: calibrating ? 'rgba(251,191,36,0.92)' : 'rgba(34,211,238,0.92)',
                  boxShadow: isActive ? '0 0 0 10px rgba(255,255,255,0.18)' : '0 8px 20px rgba(0,0,0,0.35)',
                }}
              />
            );
          })}
        </div>

        {!measuringOnFrozenImage && (
          <div className="absolute inset-x-0 top-16 z-20 flex flex-col items-center gap-3 px-4 pointer-events-none">
            {!cameraReady && (
              <div className="pointer-events-auto">
                <Button
                  onClick={startCamera}
                  disabled={cameraState === 'starting'}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold gap-2 shadow-lg"
                >
                  <CameraIcon className="h-4 w-4" />
                  {cameraState === 'starting' ? 'Startar kamera…' : 'Starta kamera'}
                </Button>
              </div>
            )}

            {errorMsg && (
              <p className="max-w-xs text-center text-xs text-white/90 bg-black/70 px-3 py-2 rounded-md">
                {errorMsg}
              </p>
            )}

            <p className="text-[11px] text-white/70 text-center max-w-xs">
              Rikta motivet med krysset och frys bilden innan du sätter punkter.
            </p>
          </div>
        )}
      </div>

      <div className="relative z-20 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-6 px-4 space-y-3">
        {!measuringOnFrozenImage ? (
          <>
            <div className="text-center space-y-1">
              <div className="text-xs text-white/60 uppercase tracking-wider">Steg 1</div>
              <div className="text-lg font-semibold">Frys bilden innan du mäter</div>
              <div className="text-[11px] text-white/55">Det gör att punkter sitter fast stabilt i bilden i stället för att följa livekameran.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={captureFrame}
                disabled={!cameraReady}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-12 disabled:opacity-40"
              >
                <CameraIcon className="h-4 w-4 mr-1.5" />
                Frys bild
              </Button>
              <Button
                variant="ghost"
                onClick={startCamera}
                disabled={cameraState === 'starting'}
                className="flex-1 text-white hover:bg-white/10 border border-white/20 h-12"
              >
                Försök igen
              </Button>
            </div>
          </>
        ) : calibrating ? (
          <div className="space-y-2">
            <div className="text-xs text-amber-300 text-center font-medium">
              Kalibrering aktiv — sätt två punkter på ett känt avstånd.
            </div>
            <div className="text-[11px] text-white/60 text-center">
              Vanliga mätpunkter ligger kvar i bakgrunden och påverkas inte.
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
                onClick={resetMeasurement}
                disabled={points.length === 0 && calibrationPoints.length === 0}
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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={retake}
                className="flex-1 text-white hover:bg-white/10 border border-white/20 h-11"
              >
                Ta om bild
              </Button>
            </div>
            <div className="text-[10px] text-white/50 text-center">
              Tryck för att fästa punkt · Dra befintlig punkt för finjustering · Skala: {pxPerCm.toFixed(1)} px/cm · {points.length} punkter
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraMeasure;
