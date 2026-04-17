import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, Tag, MapPin, CalendarDays, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector';
import { identifyProduct } from '@/services/scannerService';
import { toast } from 'sonner';

interface IdentifiedItem {
  id: string;
  scannedValue: string;
  scannedAt: number;
  loading: boolean;
  found: boolean;
  name?: string;
  sku?: string;
  status?: string;
  currentBooking?: string;
  client?: string;
  location?: string;
  error?: string;
}

interface IdentifyScannerOverlayProps {
  isActive: boolean;
  onClose: () => void;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  available: { label: 'Tillgänglig', className: 'bg-green-100 text-green-800' },
  allocated: { label: 'Allokerad', className: 'bg-blue-100 text-blue-800' },
  reserved: { label: 'Reserverad', className: 'bg-amber-100 text-amber-800' },
  damaged: { label: 'Skadad', className: 'bg-red-100 text-red-800' },
  local_match: { label: 'Lokal träff', className: 'bg-muted text-muted-foreground' },
};

/**
 * IdentifyScannerOverlay — Camera stays open while user scans multiple
 * products. Each scan is added to a session list shown below the camera.
 */
export const IdentifyScannerOverlay: React.FC<IdentifyScannerOverlayProps> = ({ isActive, onClose }) => {
  const isIos = (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') || /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<IdentifiedItem[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const mountedRef = useRef(true);
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);

  // Init detector
  useEffect(() => {
    const DetectorClass = ('BarcodeDetector' in window)
      ? (window as any).BarcodeDetector
      : BarcodeDetectorPolyfill;
    try {
      detectorRef.current = new DetectorClass({
        formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'codabar'],
      });
    } catch (e) {
      console.warn('[IdentifyScannerOverlay] BarcodeDetector init failed:', e);
    }
  }, []);

  const playBeep = useCallback((success: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 1200 : 400;
      osc.type = 'square';
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.1 : 0.25));
    } catch {}
  }, []);

  const handleIdentify = useCallback(async (scannedValue: string) => {
    const value = scannedValue.trim();
    if (!value) return;

    const itemId = `${value}-${Date.now()}`;
    setItems(prev => [{
      id: itemId,
      scannedValue: value,
      scannedAt: Date.now(),
      loading: true,
      found: false,
    }, ...prev]);

    playBeep(true);

    try {
      const result = await identifyProduct(value);
      setItems(prev => prev.map(it => it.id === itemId ? {
        ...it,
        loading: false,
        found: result.found,
        name: result.name,
        sku: result.sku,
        status: result.status,
        currentBooking: result.currentBooking,
        client: result.client,
        location: result.location,
        error: result.error,
      } : it));
      if (!result.found) {
        playBeep(false);
      }
    } catch (err: any) {
      setItems(prev => prev.map(it => it.id === itemId ? {
        ...it,
        loading: false,
        found: false,
        error: err.message || 'Kunde inte identifiera',
      } : it));
      playBeep(false);
    }
  }, [playBeep]);

  const handleDetected = useCallback((value: string) => {
    const now = Date.now();
    // Dedup same value within 2.5s
    if (value === lastScanRef.current.value && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { value, at: now };
    handleIdentify(value);
  }, [handleIdentify]);

  const stopCamera = useCallback(() => {
    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
    lastScanRef.current = { value: '', at: 0 };
  }, []);

  const runScanLoop = useCallback(() => {
    let lastScanTime = 0;
    const SCAN_INTERVAL = 250;

    const scan = async () => {
      if (!mountedRef.current || !videoRef.current) return;

      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      const now = performance.now();
      if (now - lastScanTime < SCAN_INTERVAL || scanningRef.current) {
        animationFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      lastScanTime = now;
      scanningRef.current = true;

      try {
        if (detectorRef.current) {
          let barcodes: any[] = [];
          try {
            barcodes = await detectorRef.current.detect(video);
          } catch {
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0);
                try {
                  barcodes = await detectorRef.current.detect(canvas);
                } catch {}
              }
            }
          }
          if (barcodes.length > 0) {
            handleDetected(barcodes[0].rawValue);
          }
        }
      } finally {
        scanningRef.current = false;
      }

      if (mountedRef.current) {
        animationFrameRef.current = requestAnimationFrame(scan);
      }
    };

    animationFrameRef.current = requestAnimationFrame(scan);
  }, [handleDetected]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setCameraState('starting');

      if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setCameraState((prev) => {
            if (prev === 'starting') {
              setError('Kameran svarade inte. Använd hårdvaruskanning eller manuell inmatning.');
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
              }
              return 'error';
            }
            return prev;
          });
        }
      }, 15000);

      if (!navigator.mediaDevices?.getUserMedia) {
        if (startingTimeoutRef.current) {
          clearTimeout(startingTimeoutRef.current);
          startingTimeoutRef.current = null;
        }
        setCameraState('error');
        setError('Kameran stöds inte i denna webvy.');
        return;
      }

      const preferredConstraints: MediaStreamConstraints = {
        video: isIos
          ? { facingMode: { ideal: 'environment' } }
          : {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: false,
      };

      const fallbackConstraints: MediaStreamConstraints = { video: true, audio: false };

      const getUserMediaWithTimeout = async (mediaConstraints: MediaStreamConstraints): Promise<MediaStream> => {
        return Promise.race([
          navigator.mediaDevices.getUserMedia(mediaConstraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getUserMedia timeout — kameran svarar inte.')), 10000)
          ),
        ]);
      };

      let stream: MediaStream;
      try {
        stream = await getUserMediaWithTimeout(preferredConstraints);
      } catch (primaryError: any) {
        if (!isIos) throw primaryError;
        stream = await getUserMediaWithTimeout(fallbackConstraints);
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
          const fail = (msg: string) => { if (!settled) { settled = true; cleanup(); reject(new Error(msg)); } };
          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('canplay', onCanPlay);
          };
          const timeout = setTimeout(() => {
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA || video.videoWidth > 0 || !video.paused) {
              finish();
            } else {
              fail('Kameran svarade inte i tid.');
            }
          }, 8000);
          const onPlaying = () => finish();
          const onLoadedMetadata = () => { if (video.readyState >= HTMLMediaElement.HAVE_METADATA) finish(); };
          const onCanPlay = () => finish();
          video.addEventListener('playing', onPlaying);
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('canplay', onCanPlay);
          video.setAttribute('playsinline', 'true');
          video.setAttribute('autoplay', 'true');
          video.muted = true;
          const playResult = video.play();
          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch((e: any) => fail('Kameran kunde inte starta: ' + (e.message || e)));
          }
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) finish();
        });

        if (!mountedRef.current) return;
        if (startingTimeoutRef.current) {
          clearTimeout(startingTimeoutRef.current);
          startingTimeoutRef.current = null;
        }
        setCameraState('running');
        runScanLoop();
      }
    } catch (err: any) {
      if (startingTimeoutRef.current) {
        clearTimeout(startingTimeoutRef.current);
        startingTimeoutRef.current = null;
      }
      if (!mountedRef.current) return;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraState('error');
      if (err.name === 'NotAllowedError') {
        setError('Kameraåtkomst nekad. Tillåt kameran i enhetens inställningar.');
      } else if (err.name === 'NotFoundError') {
        setError('Ingen kamera hittades.');
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        setError('Kameran kunde inte startas. Den kan användas av en annan app.');
      } else {
        setError(err.message || 'Kameran kunde inte startas.');
      }
    }
  }, [isIos, runScanLoop]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isActive) {
      setError(null);
      setItems([]);
      stopCamera();
      return () => {
        mountedRef.current = false;
        stopCamera();
      };
    }
    void startCamera();
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [isActive, startCamera, stopCamera]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white safe-area-top">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Identifiera produkter</h2>
          {items.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full">{items.length}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera area (top half) */}
      <div className="relative bg-black flex-shrink-0" style={{ height: '40vh', minHeight: 240 }}>
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${cameraState === 'running' ? '' : 'invisible absolute inset-0'}`}
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {cameraState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 bg-black">
            <Camera className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-center mb-4 text-sm">{error || 'Kameran kunde inte startas'}</p>
            <Button onClick={() => void startCamera()} variant="secondary" size="sm">
              Försök igen
            </Button>
          </div>
        )}

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 bg-black">
            <Loader2 className="h-10 w-10 mb-3 animate-spin opacity-60" />
            <p className="text-center text-sm">Startar kamera...</p>
          </div>
        )}

        {cameraState === 'running' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/30 rounded-lg relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
              <div
                className="absolute left-2 right-2 h-0.5 bg-primary"
                style={{ animation: 'scan-line 2s ease-in-out infinite' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results list (bottom) */}
      <div className="flex-1 overflow-y-auto bg-background">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm text-center">Rikta kameran mot en streckkod för att identifiera produkter.</p>
            <p className="text-xs text-center mt-1 opacity-70">Skannade produkter visas här.</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const statusInfo = item.status
                ? (statusLabels[item.status] || { label: item.status, className: 'bg-muted text-muted-foreground' })
                : null;
              return (
                <div key={item.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : item.found ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.loading ? (
                        <p className="text-sm text-muted-foreground">Söker {item.scannedValue}...</p>
                      ) : item.found ? (
                        <>
                          <p className="font-medium text-sm">{item.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                            {item.sku && (
                              <span className="flex items-center gap-1 text-muted-foreground font-mono">
                                <Tag className="h-3 w-3" />{item.sku}
                              </span>
                            )}
                            {statusInfo && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            )}
                            {item.currentBooking && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                {item.currentBooking}{item.client ? ` (${item.client})` : ''}
                              </span>
                            )}
                            {item.location && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3 w-3" />{item.location}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium">Hittades inte</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.scannedValue}</p>
                          {item.error && <p className="text-xs text-destructive mt-0.5">{item.error}</p>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {items.length > 0 && (
        <div className="p-3 bg-background border-t safe-area-bottom flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setItems([])}>
            Rensa lista
          </Button>
          <Button size="sm" className="flex-1" onClick={onClose}>
            Klar
          </Button>
        </div>
      )}
    </div>
  );
};
