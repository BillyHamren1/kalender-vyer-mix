import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Radio, Loader2 } from 'lucide-react';
import { isScannerApp } from '@/config/appMode';
import { Capacitor } from '@capacitor/core';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  isActive: boolean;
  /** Skip camera initialization entirely (e.g. on Zebra devices using DataWedge) */
  skipCamera?: boolean;
}

/**
 * QRScanner — Hybrid scanner component
 * 
 * In scanner mode (Zebra devices): Skips camera entirely, shows only manual input.
 * DataWedge handles all hardware scanning — no camera permission needed.
 * 
 * In other modes: Uses BarcodeDetector API with jsQR fallback + manual input.
 * On native Capacitor platforms, uses getUserMedia with special handling.
 * 
 * skipCamera logic:
 *   - undefined → auto-detect (true for isScannerApp, false otherwise)
 *   - true → always skip camera
 *   - false → always try camera (use only when camera is explicitly desired)
 */
export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, isActive, skipCamera }) => {
  // Default: skip camera on scanner app (Zebra uses DataWedge), allow on web/other
  const shouldSkipCamera = skipCamera ?? isScannerApp;

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScanRef = useRef<string>('');
  const mountedRef = useRef(true);
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check BarcodeDetector support on mount
  useEffect(() => {
    if (shouldSkipCamera) return;
    const supported = 'BarcodeDetector' in window;
    setHasBarcodeDetector(supported);
    if (supported) {
      try {
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39']
        });
      } catch (e) {
        console.warn('[QRScanner] BarcodeDetector init failed:', e);
        setHasBarcodeDetector(false);
      }
    }
  }, [shouldSkipCamera]);

  // Stable ref for onScan to avoid callback chain recreation
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const handleDetected = useCallback((value: string) => {
    if (value && value !== lastScanRef.current) {
      lastScanRef.current = value;
      onScanRef.current(value);
      setTimeout(() => { lastScanRef.current = ''; }, 3000);
    }
  }, []);

  // Stop camera — stable, no deps
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
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
    lastScanRef.current = '';
  }, []);

  // Scan loop — uses refs to avoid dependency issues
  const runScanLoop = useCallback(() => {
    const scan = async () => {
      if (!mountedRef.current || !videoRef.current) return;

      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      try {
        if (detectorRef.current) {
          const barcodes = await detectorRef.current.detect(video);
          if (barcodes.length > 0) {
            handleDetected(barcodes[0].rawValue);
          }
        } else {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (code?.data) {
                handleDetected(code.data);
              }
            }
          }
        }
      } catch (e) {
        // detect() can throw on some frames, ignore and retry
      }

      if (mountedRef.current) {
        animationFrameRef.current = requestAnimationFrame(scan);
      }
    };
    animationFrameRef.current = requestAnimationFrame(scan);
  }, [handleDetected]);

  // Start camera — stable deps via refs
  const startCamera = useCallback(async () => {
    if (shouldSkipCamera) return;
    try {
      setError(null);
      setCameraState('starting');
      console.log('[QRScanner] Starting camera, platform:', Capacitor.getPlatform());

      // Safety net: if we're still in 'starting' after 15s, force error state.
      // This catches any edge case where getUserMedia/play hangs beyond individual timeouts.
      if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          console.warn('[QRScanner] Safety timeout: still starting after 15s, forcing error');
          setCameraState(prev => {
            if (prev === 'starting') {
              setError('Kameran svarade inte. Använd hårdvaruscan eller manuell inmatning.');
              // Clean up any partial stream
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
              }
              return 'error';
            }
            return prev;
          });
        }
      }, 15000);

      // On native platforms, try to check/request permission via Web API
      // (NOT @capacitor/camera which is for photo capture, not getUserMedia)
      // On Android, try Web Permissions API (skip on iOS — it can hang in WKWebView)
      const isIosNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
      if (Capacitor.isNativePlatform() && !isIosNative) {
        try {
          if (navigator.permissions?.query) {
            const permPromise = navigator.permissions.query({ name: 'camera' as PermissionName });
            const status = await Promise.race([
              permPromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (status && status.state === 'denied') {
              console.log('[QRScanner] Web permission denied');
              if (startingTimeoutRef.current) { clearTimeout(startingTimeoutRef.current); startingTimeoutRef.current = null; }
              setCameraState('error');
              setError('Kameratillstånd nekades. Gå till enhetens inställningar och tillåt kamera för appen.');
              return;
            }
            console.log('[QRScanner] Web permission status:', status?.state ?? 'timeout');
          }
        } catch (permErr) {
          console.warn('[QRScanner] Permission query not supported, proceeding to getUserMedia:', permErr);
        }
      }

      // Use simpler constraints on iOS to avoid hanging
      const isIos = isIosNative || /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const constraints: MediaStreamConstraints = {
        video: isIos
          ? { facingMode: 'environment' }
          : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      console.log('[QRScanner] Requesting getUserMedia, iOS:', isIos);
      
      // Wrap getUserMedia in a timeout — on some Android WebViews it hangs forever
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getUserMedia timeout efter 10s — kameran svarar inte.')), 10000)
        ),
      ]);
      console.log('[QRScanner] Got stream, tracks:', stream.getVideoTracks().length);

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;

        // Wait for video to be ready with event-based detection + timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn('[QRScanner] Video start timeout after 8s');
            if (!video.paused && video.readyState >= video.HAVE_CURRENT_DATA) {
              console.log('[QRScanner] Video appears to be playing despite timeout');
              resolve();
            } else {
              reject(new Error('Kameran svarade inte i tid. Försök igen.'));
            }
          }, 8000);

          const onPlaying = () => {
            clearTimeout(timeout);
            video.removeEventListener('playing', onPlaying);
            console.log('[QRScanner] Video playing event fired');
            resolve();
          };
          video.addEventListener('playing', onPlaying);

          // Trigger play
          video.play().catch((e: any) => {
            clearTimeout(timeout);
            video.removeEventListener('playing', onPlaying);
            console.warn('[QRScanner] play() rejected:', e);
            reject(new Error('Kameran kunde inte startas: ' + (e.message || e)));
          });
        });

        if (!mountedRef.current) return;

        // Clear safety timeout — we made it
        if (startingTimeoutRef.current) { clearTimeout(startingTimeoutRef.current); startingTimeoutRef.current = null; }

        setCameraState('running');
        console.log('[QRScanner] Camera started successfully, videoWidth:', video.videoWidth);
        runScanLoop();
      }
    } catch (err: any) {
      console.error('[QRScanner] Camera error:', err);
      if (startingTimeoutRef.current) { clearTimeout(startingTimeoutRef.current); startingTimeoutRef.current = null; }
      if (!mountedRef.current) return;

      // Clean up partial stream on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraState('error');
      if (err.name === 'NotAllowedError') {
        setError('Kameratillstånd nekades. Tillåt kamera i enhetens inställningar.');
      } else if (err.name === 'NotFoundError') {
        setError('Ingen kamera hittades på enheten.');
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        setError('Kameran kunde inte startas. Den kanske används av en annan app.');
      } else {
        setError(err.message || 'Kameran kunde inte startas.');
      }
    }
  }, [shouldSkipCamera, runScanLoop]);

  // Manual input
  const [manualInput, setManualInput] = useState('');

  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  }, [manualInput, onScan]);

  // Lifecycle: start/stop camera based on isActive
  useEffect(() => {
    mountedRef.current = true;

    if (isActive && !shouldSkipCamera) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [isActive, shouldSkipCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white safe-area-top">
        <h2 className="text-lg font-semibold">
          {shouldSkipCamera ? 'Manuell inmatning' : 'QR-skanner'}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera view */}
      {!shouldSkipCamera && (
        <div className="flex-1 relative overflow-hidden">
          {cameraState === 'error' ? (
            <div className="flex flex-col items-center justify-center h-full text-white p-6">
              <Camera className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-center mb-2 text-base">
                {error || 'Kameran kunde inte startas'}
              </p>
              <p className="text-center text-sm text-white/60 mb-6">
                Du kan ange kod manuellt nedan.
              </p>
              <Button onClick={startCamera} variant="secondary">
                Försök igen
              </Button>
            </div>
          ) : cameraState === 'starting' ? (
            <div className="flex flex-col items-center justify-center h-full text-white p-6">
              <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-60" />
              <p className="text-center text-base">Startar kameran...</p>
              <p className="text-center text-xs text-white/40 mt-2">Om inget händer, tryck stäng och använd hårdvaruscan.</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {/* Hidden canvas for jsQR fallback */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-white/30 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />

                  {cameraState === 'running' && (
                    <div
                      className="absolute left-2 right-2 h-0.5 bg-primary"
                      style={{ animation: 'scan-line 2s ease-in-out infinite' }}
                    />
                  )}
                </div>
              </div>

              {cameraState === 'running' && !hasBarcodeDetector && (
                <div className="absolute top-4 left-4 right-4 bg-black/70 text-white text-xs text-center py-2 px-3 rounded-lg">
                  Använder jsQR-fallback för avkodning
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Scanner mode info */}
      {shouldSkipCamera && (
        <div className="flex-1 flex flex-col items-center justify-center text-white p-6">
          <Radio className="h-16 w-16 mb-4 opacity-60" />
          <p className="text-center text-lg font-medium mb-2">Använd Zebra-skannern</p>
          <p className="text-center text-sm text-white/60">
            Tryck på skanningsknappen på enheten, eller ange kod manuellt nedan.
          </p>
        </div>
      )}

      {/* Manual input — always available */}
      <div className="p-4 bg-black/80 safe-area-bottom">
        <p className="text-white text-sm text-center mb-2">
          {shouldSkipCamera ? 'Ange kod manuellt:' : 'Eller ange kod manuellt:'}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Ange QR-kod eller SKU..."
            className="flex-1 px-3 py-2 rounded bg-white/10 text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:border-primary"
            autoFocus={shouldSkipCamera}
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Skicka
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
        .safe-area-top { padding-top: max(1rem, env(safe-area-inset-top)); }
        .safe-area-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  );
};
