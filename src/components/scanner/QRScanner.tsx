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
 */
export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, isActive, skipCamera }) => {
  const shouldSkipCamera = skipCamera === false ? false : (skipCamera ?? isScannerApp);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScanRef = useRef<string>('');

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

  const handleDetected = useCallback((value: string) => {
    if (value && value !== lastScanRef.current) {
      lastScanRef.current = value;
      onScan(value);
      setTimeout(() => { lastScanRef.current = ''; }, 3000);
    }
  }, [onScan]);

  // Scan loop — BarcodeDetector or jsQR fallback
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !isActive) return;
    
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    try {
      // Try native BarcodeDetector first
      if (detectorRef.current) {
        const barcodes = await detectorRef.current.detect(video);
        if (barcodes.length > 0) {
          handleDetected(barcodes[0].rawValue);
          return;
        }
      } else {
        // jsQR fallback
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
              return;
            }
          }
        }
      }
    } catch (e) {
      // detect() can throw on some frames, ignore and retry
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [isActive, handleDetected]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (shouldSkipCamera) return;
    try {
      setError(null);
      setCameraState('starting');
      console.log('[QRScanner] Starting camera, platform:', Capacitor.getPlatform());
      
      // On native platforms, request camera permission first via Capacitor
      if (Capacitor.isNativePlatform()) {
        try {
          const { Camera: CapCamera } = await import('@capacitor/camera');
          const perms = await CapCamera.requestPermissions({ permissions: ['camera'] });
          console.log('[QRScanner] Capacitor camera permissions:', JSON.stringify(perms));
          if (perms.camera === 'denied') {
            setCameraState('error');
            setError('Kameratillstånd nekades. Gå till inställningar och tillåt kamera.');
            return;
          }
        } catch (permErr) {
          console.warn('[QRScanner] Capacitor permission request failed, trying getUserMedia directly:', permErr);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState('running');
        console.log('[QRScanner] Camera started successfully');
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      console.error('[QRScanner] Camera error:', err);
      setCameraState('error');
      if (err.name === 'NotAllowedError') {
        setError('Kameratillstånd nekades. Tillåt kamera i webbläsarens inställningar.');
      } else if (err.name === 'NotFoundError') {
        setError('Ingen kamera hittades på enheten.');
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        setError('Kameran kunde inte startas. Den kanske används av en annan app.');
      } else {
        setError(err.message || 'Kameran kunde inte startas.');
      }
    }
  }, [scanFrame, shouldSkipCamera]);

  // Stop camera
  const stopCamera = useCallback(() => {
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

  // Manual input
  const [manualInput, setManualInput] = useState('');
  
  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  }, [manualInput, onScan]);

  // Start/stop camera based on isActive
  useEffect(() => {
    if (isActive && !shouldSkipCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [isActive, startCamera, stopCamera, shouldSkipCamera]);

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
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
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
