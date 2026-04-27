import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Radio, Loader2 } from 'lucide-react';
import { isScannerApp } from '@/config/appMode';
import { Capacitor } from '@capacitor/core';
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector';

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
 * In Android scanner mode (Zebra devices): Skips camera entirely, shows only manual input.
 * DataWedge handles all hardware scanning — no camera permission needed.
 * 
 * In iOS scanner mode: Uses the device camera (no Zebra/DataWedge hardware).
 * 
 * In web/other modes: Uses BarcodeDetector API with jsQR fallback + manual input.
 * On native Capacitor platforms, uses getUserMedia with special handling.
 * 
 * skipCamera logic:
 *   - undefined → auto-detect (true only for Android scanner app, false otherwise)
 *   - true → always skip camera
 *   - false → always try camera (use only when camera is explicitly desired)
 */
export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, isActive, skipCamera }) => {
  const isNativeAndroidScanner = isScannerApp && Capacitor.getPlatform() === 'android';
  const shouldSkipCamera = skipCamera ?? isNativeAndroidScanner;
  const isIos = (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') || /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScanRef = useRef<string>('');
  const mountedRef = useRef(true);
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);

  // Initialize BarcodeDetector (native or polyfill) on mount
  useEffect(() => {
    if (shouldSkipCamera) return;
    const DetectorClass = ('BarcodeDetector' in window)
      ? (window as any).BarcodeDetector
      : BarcodeDetectorPolyfill;
    try {
      detectorRef.current = new DetectorClass({
        formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'codabar'],
      });
      setHasBarcodeDetector(true);
      console.log('[QRScanner] BarcodeDetector ready (native:', 'BarcodeDetector' in window, ')');
    } catch (e) {
      console.warn('[QRScanner] BarcodeDetector init failed:', e);
      setHasBarcodeDetector(false);
    }
  }, [shouldSkipCamera]);

  // Stable ref for onScan to avoid callback chain recreation
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // Quick beep so the user gets immediate feedback at the moment of detection,
  // independent of any downstream onScan handler. Identical to the
  // IdentifyScannerOverlay (which is known to work on iOS).
  const playBeep = useCallback((success: boolean) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 1200 : 400;
      osc.type = 'square';
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.1 : 0.25));
    } catch {/* noop */}
  }, []);

  const handleDetected = useCallback((value: string) => {
    if (value && value !== lastScanRef.current) {
      lastScanRef.current = value;
      setManualInput(value);
      playBeep(true);
      onScanRef.current(value);
      setTimeout(() => {
        lastScanRef.current = '';
      }, 3000);
    }
  }, [playBeep]);

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
    lastScanRef.current = '';
  }, []);

  const runScanLoop = useCallback(() => {
    let lastScanTime = 0;
    const SCAN_INTERVAL = 250; // ~4 fps — give polyfill time to process

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
          // Try detecting directly from video first
          let barcodes: any[] = [];
          try {
            barcodes = await detectorRef.current.detect(video);
          } catch {
            // Some polyfills need canvas ImageBitmap instead of video element
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0);
                try {
                  barcodes = await detectorRef.current.detect(canvas);
                } catch (e2) {
                  console.warn('[QRScanner] detect(canvas) also failed:', e2);
                }
              }
            }
          }
          if (barcodes.length > 0) {
            const value = barcodes[0].rawValue;
            console.log('[QRScanner] Detected:', value, 'format:', barcodes[0].format);
            handleDetected(value);
          }
        }
      } catch (err) {
        console.warn('[QRScanner] scan error:', err);
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
    if (shouldSkipCamera) return;

    try {
      setError(null);
      setCameraState('starting');

      if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setCameraState((prev) => {
            if (prev === 'starting') {
              setError('Camera did not respond. Use hardware scan or manual input.');
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
              if (startingTimeoutRef.current) {
                clearTimeout(startingTimeoutRef.current);
                startingTimeoutRef.current = null;
              }
              setCameraState('error');
              setError('Camera permission denied. Go to device settings and allow camera access for the app.');
              return;
            }
          }
        } catch {
          // Permission query not supported, continue
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        if (startingTimeoutRef.current) {
          clearTimeout(startingTimeoutRef.current);
          startingTimeoutRef.current = null;
        }
        setCameraState('error');
        setError('Camera is not supported in this web view (getUserMedia missing).');
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

      const fallbackConstraints: MediaStreamConstraints = {
        video: true,
        audio: false,
      };

      const getUserMediaWithTimeout = async (mediaConstraints: MediaStreamConstraints): Promise<MediaStream> => {
        return Promise.race([
          navigator.mediaDevices.getUserMedia(mediaConstraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getUserMedia timeout after 10s — camera not responding.')), 10000)
          ),
        ]);
      };

      let stream: MediaStream;

      try {
        stream = await getUserMediaWithTimeout(preferredConstraints);
      } catch (primaryError: any) {
        if (!isIos) throw primaryError;
        try {
          stream = await getUserMediaWithTimeout(fallbackConstraints);
        } catch (fallbackError: any) {
          throw fallbackError;
        }
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

          const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };

          const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(message));
          };

          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('canplay', onCanPlay);
          };

          const timeout = setTimeout(() => {
            if (
              video.readyState >= HTMLMediaElement.HAVE_METADATA ||
              video.videoWidth > 0 ||
              video.videoHeight > 0 ||
              !video.paused
            ) {
              finish();
            } else {
              fail('Camera did not respond in time. Please try again.');
            }
          }, 8000);

          const onPlaying = () => finish();
          const onLoadedMetadata = () => {
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
              finish();
            }
          };
          const onCanPlay = () => finish();

          video.addEventListener('playing', onPlaying);
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('canplay', onCanPlay);

          video.setAttribute('playsinline', 'true');
          video.setAttribute('autoplay', 'true');
          video.muted = true;

          const playResult = video.play();

          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch((e: any) => {
              fail('Camera could not be started: ' + (e.message || e));
            });
          }

          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            finish();
          }
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
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraState('error');
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Allow camera in device settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on device.');
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        setError('Camera could not be started. It may be in use by another app.');
      } else {
        setError(err.message || 'Camera could not be started.');
      }
    }
  }, [isIos, runScanLoop, shouldSkipCamera]);


  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  }, [manualInput, onScan]);

  // Stable refs so the lifecycle effect below doesn't restart the camera
  // on every parent render (which created a start/stop loop on iOS).
  const startCameraRef = useRef(startCamera);
  const stopCameraRef = useRef(stopCamera);
  startCameraRef.current = startCamera;
  stopCameraRef.current = stopCamera;

  useEffect(() => {
    mountedRef.current = true;

    if (!isActive) {
      setError(null);
      stopCameraRef.current();
      return () => {
        mountedRef.current = false;
        stopCameraRef.current();
      };
    }

    if (shouldSkipCamera) {
      stopCameraRef.current();
      return () => {
        mountedRef.current = false;
        stopCameraRef.current();
      };
    }

    void startCameraRef.current();

    return () => {
      mountedRef.current = false;
      stopCameraRef.current();
    };
    // Intentionally only depend on activation flags — start/stop are read via refs
    // to prevent restart loops when parent re-renders.
  }, [isActive, shouldSkipCamera]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 bg-black/80 text-white safe-area-top">
        <h2 className="text-lg font-semibold">{shouldSkipCamera ? 'Manual input' : 'QR Scanner'}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {!shouldSkipCamera && (
        // min-h-0 är kritiskt: en `flex-1` child i en `flex flex-col`-container
        // får annars minHeight=auto vilket på iOS WKWebView kunde lämna videon
        // med 0 höjd när manuell input-blocket nedanför var aktivt — kameran
        // verkade köra (scan-linjen rörde sig) men <video> levererade aldrig
        // pixlar till BarcodeDetector. Explicit minHeight som fallback.
        <div
          className="flex-1 min-h-0 relative overflow-hidden bg-black"
          style={{ minHeight: '50vh' }}
        >
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
              <Camera className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-center mb-2 text-base">{error || 'Camera could not be started'}</p>
              <p className="text-center text-sm text-white/60 mb-6">You can enter a code manually below.</p>
              <Button
                onClick={() => void startCamera()}
                variant="secondary"
              >
                Try again
              </Button>
            </div>
          )}

          {cameraState === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 bg-black">
              <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-60" />
              <p className="text-center text-base">Starting camera...</p>
            </div>
          )}

          {cameraState === 'running' && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-white/30 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-primary"
                    style={{ animation: 'scan-line 2s ease-in-out infinite' }}
                  />
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {shouldSkipCamera && (
        <div className="flex-1 flex flex-col items-center justify-center text-white p-6">
          <Radio className="h-16 w-16 mb-4 opacity-60" />
          <p className="text-center text-lg font-medium mb-2">Use Zebra scanner</p>
          <p className="text-center text-sm text-white/60">Press the scan button on the device, or enter a code manually below.</p>
        </div>
      )}

      <div className="p-4 bg-black/80 safe-area-bottom">
        <p className="text-white text-sm text-center mb-2">{shouldSkipCamera ? 'Enter code manually:' : 'Or enter code manually:'}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Enter QR code or SKU..."
            className="flex-1 px-3 py-2 rounded bg-white/10 text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:border-primary"
            autoFocus={shouldSkipCamera}
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Submit
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
